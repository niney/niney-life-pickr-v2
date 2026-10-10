"""사전 + 번역 모델을 묶은 번역 흐름.

mode
  auto     원본 파이프라인 — 사전에 있으면 사전, 없으면 모델
  model    사전을 무시하고 모델만(모델 자체 실력 확인용)
  compare  둘 다 계산해 나란히 — 최종 결과는 auto 와 같다
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import torch

from ..config import LANGS, MODEL_FILE_BY_LANG, translate_model_path
from .dictionary import MenuDictionary
from .nmt import Candidate, NmtModel, to_candidate

Mode = Literal["auto", "model", "compare"]
Source = Literal["dictionary", "model", "none"]


@dataclass
class LangResult:
    lang: str
    text: str | None
    source: Source
    dictionary: str | None = None
    candidates: list[Candidate] = field(default_factory=list)


@dataclass
class TranslateOptions:
    mode: Mode = "auto"
    beam_size: int = 5
    n_best: int = 1
    replace_unk: bool = False


class TranslationService:
    def __init__(self, dictionary: MenuDictionary, device: torch.device):
        self.dictionary = dictionary
        # 중국어 간체·번체가 같은 파일을 쓰므로 파일 경로로 묶어 한 번만 올린다.
        self.models: dict[Path, NmtModel] = {}
        for lang in LANGS:
            path = translate_model_path(lang)
            self.models.setdefault(path, NmtModel(path, device))

    def model_for(self, lang: str) -> NmtModel:
        return self.models[translate_model_path(lang)]

    def translate_many(
        self, texts: list[str], langs: list[str], options: TranslateOptions,
    ) -> list[dict[str, LangResult]]:
        entries = [self.dictionary.lookup(text) for text in texts]
        results: list[dict[str, LangResult]] = [{} for _ in texts]
        # 같은 모델 파일(zh)을 쓰는 언어끼리는 모델을 한 번만 돌린다: 파일 → {입력 번호: 후보}
        model_outputs: dict[Path, dict[int, list[tuple[str, float]]]] = {}

        for lang in langs:
            needs_model = [
                i for i, entry in enumerate(entries)
                if options.mode != "auto" or entry is None or lang not in entry.translations
            ]
            path = translate_model_path(lang)
            done = model_outputs.setdefault(path, {})
            pending = [i for i in needs_model if i not in done]
            if pending:
                outputs = self.model_for(lang).translate(
                    [texts[i] for i in pending], beam_size=options.beam_size, n_best=options.n_best,
                    replace_unk=options.replace_unk,
                )
                done.update(zip(pending, outputs))

            for i, entry in enumerate(entries):
                dictionary_text = entry.translations.get(lang) if entry else None
                candidates = [to_candidate(lang, raw, score) for raw, score in done.get(i, [])] if i in needs_model else []
                if options.mode != "model" and dictionary_text:
                    text, source = dictionary_text, "dictionary"
                elif candidates:
                    text, source = candidates[0].text, "model"
                else:
                    text, source = None, "none"
                results[i][lang] = LangResult(
                    lang=lang, text=text, source=source,
                    dictionary=dictionary_text if options.mode != "model" else None, candidates=candidates,
                )
        return results


def model_files() -> dict[str, list[str]]:
    """모델 파일 이름 → 그 파일을 쓰는 언어들 (화면 상태 표시용)."""
    grouped: dict[str, list[str]] = {}
    for lang, name in MODEL_FILE_BY_LANG.items():
        grouped.setdefault(name, []).append(lang)
    return grouped
