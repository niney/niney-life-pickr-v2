"""번역 모델(OpenNMT-py 2.2 포크, 도커 이미지 /letr/onmt 그대로) 감싸기.

원본 translate.py 의 흐름을 따른다: 입력 공백 제거 → mecab-ko 형태소 분리 → 모델 → 너무 긴 결과는 가장 많이 나온
단어 하나로 줄인다. 모델 파일이 언어당 약 1GB 라 처음 쓸 때 올린다.
"""

from __future__ import annotations

import threading
import warnings
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import torch

with warnings.catch_warnings():
    # 포크가 쓰는 torch.cuda.amp.custom_fwd 가 최신 torch 에서 FutureWarning 을 낸다 — 동작에는 영향 없음.
    warnings.simplefilter("ignore", FutureWarning)
    import onmt.opts as onmt_opts
    from onmt.translate.translator import build_translator
    from onmt.utils.parse import ArgumentParser
    from onmt.utils.tokenizer import Tokenizer

# 원본 translate.py 의 후처리 기준 — 결과가 이보다 길면 반복 출력으로 보고 가장 많이 나온 단어만 남긴다.
MAX_CHAR_LENGTH = {"en": 300, "ja": 50}
DEFAULT_MAX_CHAR_LENGTH = 30


@dataclass
class Candidate:
    text: str  # 화면용 — 후처리 + 일본어·중국어는 토큰 사이 공백 제거
    raw: str  # 모델이 낸 그대로(토큰 사이 공백 포함)
    score: float  # 로그 확률 합 — 0 에 가까울수록 모델이 확신


def postprocess(lang: str, prediction: str) -> str:
    """원본 translate.py 후처리 — 원본 채점(BLEU)도 이 결과로 했다.

    원본은 max(set(words), key=words.count) 라 동점이면 집합 순서(실행마다 바뀌는 문자열 해시)에 따라 답이
    달라졌다. 동점이면 먼저 나온 단어로 고정한다.
    """
    if len(prediction) > MAX_CHAR_LENGTH.get(lang, DEFAULT_MAX_CHAR_LENGTH):
        return Counter(prediction.split()).most_common(1)[0][0]
    return prediction


def detokenize(lang: str, text: str) -> str:
    """일본어·중국어 모델은 형태소 사이에 공백을 넣어 낸다(원본은 그대로 저장). 화면에서는 붙여 보여 준다."""
    if lang == "en":
        return text
    return "".join(text.split())


def to_candidate(lang: str, raw: str, score: float) -> Candidate:
    return Candidate(text=detokenize(lang, postprocess(lang, raw)), raw=raw, score=score)


def prepare_source(text: str) -> str:
    """원본처럼 공백을 모두 빼고 넣는다(학습 데이터가 공백 없는 메뉴명 기준)."""
    return "".join(str(text).split())


_tokenizer_lock = threading.Lock()
_ko_tokenizer = None


def tokenize_ko(text: str) -> str:
    global _ko_tokenizer
    with _tokenizer_lock:
        if _ko_tokenizer is None:
            _ko_tokenizer = Tokenizer("ko").load()
        return " ".join(_ko_tokenizer.predict(text))


class NmtModel:
    """언어 모델 파일 하나. 빔 크기·후보 수·<unk> 대체는 요청마다 바꾼다(번역기 속성이라 다시 올릴 필요 없음)."""

    def __init__(self, model_path: Path, device: torch.device):
        self.model_path = model_path
        self.device = device
        self._translator = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.model_path.exists()

    @property
    def loaded(self) -> bool:
        return self._translator is not None

    def _ensure_loaded(self) -> None:
        if self._translator is not None:
            return
        parser = ArgumentParser()
        onmt_opts.config_opts(parser)
        onmt_opts.translate_opts(parser)
        gpu = str(self.device.index or 0) if self.device.type == "cuda" else "-1"
        opt = parser.parse_args(["-model", str(self.model_path), "-src", "-", "-gpu", gpu])
        ArgumentParser.validate_translate_opts(opt)
        self._translator = build_translator(opt, report_score=False)

    def translate(
        self, sources: list[str], *, beam_size: int = 5, n_best: int = 1, replace_unk: bool = False,
        batch_size: int = 64,
    ) -> list[list[tuple[str, float]]]:
        """한국어 메뉴명들 → 입력마다 (원문 그대로의 번역, 점수) 후보 n_best 개. 빈 입력은 빈 목록."""
        tokenized = [tokenize_ko(prepare_source(text)) for text in sources]
        targets = [i for i, line in enumerate(tokenized) if line.strip()]
        results: list[list[tuple[str, float]]] = [[] for _ in sources]
        if not targets:
            return results
        with self._lock:
            self._ensure_loaded()
            translator = self._translator
            translator.beam_size = beam_size
            translator.n_best = min(n_best, beam_size)
            translator.replace_unk = replace_unk
            scores, predictions = translator.translate(
                src=[tokenized[i] for i in targets], batch_size=batch_size, batch_type="sents",
            )
        for index, row_scores, row_preds in zip(targets, scores, predictions):
            results[index] = [(pred, float(score)) for pred, score in zip(row_preds, row_scores)]
        return results
