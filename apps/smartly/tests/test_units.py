"""모델 파일 없이 도는 단위 테스트 — 사전·번역 흐름·채점식·전처리."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest
from nltk.translate.bleu_score import SmoothingFunction, sentence_bleu
from PIL import Image

from smartly.config import translate_model_path
from smartly.evaluate import char_bleu, char_cer
from smartly.ocr.recognizer import IMG_H, IMG_W, preprocess, read_character_set
from smartly.samples import pick
from smartly.translate.dictionary import MenuDictionary, normalize
from smartly.translate.nmt import detokenize, postprocess, prepare_source
from smartly.translate.service import TranslateOptions, TranslationService

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from extract import gt_from_filename  # noqa: E402


@pytest.fixture
def dictionary(tmp_path: Path) -> MenuDictionary:
    frame = pd.DataFrame(
        {
            "ko": ["김치찌개", "김치 찌개", "된장 찌개", "김치볶음밥", "비빔밥"],
            "en": ["Kimchi Stew", "Kimchi Stew 2", "Soybean Paste Stew", "Kimchi Fried Rice", "Bibimbap"],
            "ja": ["キムチチゲ", None, "テンジャンチゲ", "キムチチャーハン", ""],
            "zh-CN": ["泡菜汤", "x", "大酱汤", "泡菜炒饭", "拌饭"],
            "zh-TW": ["泡菜湯", "x", "大醬湯", "泡菜炒飯", "拌飯"],
            "aa": [11, 13, 18, 17, 8],
        }
    )
    path = tmp_path / "dictionary.pkl"
    frame.to_pickle(path)
    return MenuDictionary(path)


class TestDictionary:
    def test_normalize_drops_all_whitespace(self):
        assert normalize(" 김치 \t찌개 ") == "김치찌개"

    def test_lookup_ignores_spaces_on_both_sides(self, dictionary: MenuDictionary):
        # 원본은 사전 쪽 공백을 안 빼서 '된장 찌개' 항목을 영영 못 찾았다.
        entry = dictionary.lookup("된장찌개")
        assert entry is not None and entry.translations["en"] == "Soybean Paste Stew"

    def test_first_entry_wins_on_duplicate_names(self, dictionary: MenuDictionary):
        assert dictionary.lookup("김치 찌개").translations["en"] == "Kimchi Stew"
        assert len(dictionary) == 4

    def test_empty_translations_are_dropped(self, dictionary: MenuDictionary):
        assert "ja" not in dictionary.lookup("비빔밥").translations

    def test_search_orders_exact_then_prefix_then_shorter(self, dictionary: MenuDictionary):
        total, entries = dictionary.search("김치")
        assert total == 2
        assert [e.ko for e in entries] == ["김치찌개", "김치볶음밥"]
        assert dictionary.search("  ") == (0, [])


class FakeModel:
    def __init__(self, label: str):
        self.label = label
        self.calls: list[list[str]] = []
        self.available = True
        self.loaded = True

    def translate(self, sources, *, beam_size, n_best, replace_unk):
        self.calls.append(list(sources))
        return [[(f"{self.label} 토큰 {i}", -1.0 - i) for i in range(n_best)] for _ in sources]


@pytest.fixture
def service(dictionary: MenuDictionary):
    svc = TranslationService(dictionary, device=None)
    fakes = {path: FakeModel(path.stem) for path in svc.models}
    svc.models = fakes
    return svc, fakes


class TestTranslationService:
    def test_auto_uses_dictionary_and_model_only_for_misses(self, service):
        svc, fakes = service
        [hit, miss] = svc.translate_many(["김치찌개", "없는메뉴"], ["en"], TranslateOptions(mode="auto"))
        assert hit["en"].source == "dictionary" and hit["en"].text == "Kimchi Stew"
        assert hit["en"].candidates == []
        assert miss["en"].source == "model" and miss["en"].text == "en_model 토큰 0"
        assert fakes[translate_model_path("en")].calls == [["없는메뉴"]]

    def test_auto_falls_back_to_model_when_language_missing_in_entry(self, service):
        svc, _ = service
        [result] = svc.translate_many(["비빔밥"], ["ja"], TranslateOptions())
        assert result["ja"].source == "model"

    def test_model_mode_ignores_dictionary(self, service):
        svc, _ = service
        [result] = svc.translate_many(["김치찌개"], ["en"], TranslateOptions(mode="model"))
        assert result["en"].source == "model" and result["en"].dictionary is None

    def test_compare_keeps_dictionary_answer_and_model_candidates(self, service):
        svc, _ = service
        [result] = svc.translate_many(["김치찌개"], ["en"], TranslateOptions(mode="compare", n_best=2))
        assert result["en"].text == "Kimchi Stew"
        assert [c.raw for c in result["en"].candidates] == ["en_model 토큰 0", "en_model 토큰 1"]

    def test_chinese_variants_share_one_model_call(self, service):
        svc, fakes = service
        [result] = svc.translate_many(["없는메뉴"], ["zh-CN", "zh-TW"], TranslateOptions())
        assert fakes[translate_model_path("zh-CN")].calls == [["없는메뉴"]]
        # 중국어는 화면용으로 토큰 사이 공백을 뗀다.
        assert result["zh-TW"].text == "zh_model토큰0"


class TestNmtHelpers:
    def test_postprocess_collapses_runaway_output_like_original(self):
        assert postprocess("zh-CN", "酱油 " * 20) == "酱油"
        assert postprocess("en", "Kimchi Stew") == "Kimchi Stew"

    def test_postprocess_breaks_ties_by_first_word(self):
        # 원본(max(set(...)))은 동점이면 실행마다 답이 바뀌었다.
        assert postprocess("ja", "追加 する 追加 する の の " * 5) == "追加"  # 50자 넘게

    def test_detokenize_only_for_cjk(self):
        assert detokenize("ja", "照り焼き マヨ 丼") == "照り焼きマヨ丼"
        assert detokenize("en", "Kimchi Stew") == "Kimchi Stew"

    def test_prepare_source_removes_spaces(self):
        assert prepare_source("떡산적 스테이크") == "떡산적스테이크"


class TestScoring:
    def test_char_bleu_matches_original_get_bleu(self):
        smoothie = SmoothingFunction().method1
        for candidate, reference in [("Kimchi Stew", "Kimchi Stew"), ("Kimch", "Kimchi Stew"), ("abc", "abd")]:
            weights = (1.0, 0, 0, 0) if len(candidate) < 4 else (0.25,) * 4
            expected = sentence_bleu([reference], candidate, weights=weights, smoothing_function=smoothie)
            assert char_bleu(candidate, reference) == pytest.approx(expected)
        assert char_bleu(None, "x") == 0.0  # type: ignore[arg-type]

    def test_char_cer(self):
        assert char_cer("김치찌개", "김치찌개") == 0.0
        assert char_cer("김치찌개", "김치개") == pytest.approx(0.25)
        assert char_cer("", "") == 0.0


class TestOcrHelpers:
    def test_preprocess_matches_training_input(self):
        tensor = preprocess(Image.new("RGB", (640, 120), "white"))
        assert tuple(tensor.shape) == (1, IMG_H, IMG_W)
        assert float(tensor.max()) == pytest.approx(1.0)

    def test_read_character_set_takes_last_block(self, tmp_path: Path):
        opt = tmp_path / "opt.txt"
        opt.write_text("character: abc\nimgH: 64\ncharacter: 가나다\n", encoding="utf-8")
        assert read_character_set(opt) == "가나다"

    def test_gt_from_filename(self):
        assert gt_from_filename("황태해장국%IN_KF01_M0002_723555_1-tf_16.jpg") == "황태해장국"
        assert gt_from_filename('"라구"소스스파게티%SL_KF03.jpg') == '"라구"소스스파게티'


def test_pick_is_deterministic_and_capped():
    assert pick(100, 5, seed=7) == pick(100, 5, seed=7)
    assert len(pick(3, 10, seed=1)) == 3
