"""메뉴 사전(2-084_menu_dictionary_v0129.pkl, 약 11.7만 개) — 한국어 메뉴명 → 영어·일본어·중국어 간체·번체.

원본 번역 파이프라인은 이 사전에서 먼저 찾고, 없을 때만 번역 모델을 돌린다(테스트셋의 약 80%가 사전에서 끝난다).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from ..config import LANGS


def normalize(text: str) -> str:
    """사전 키 — 공백을 모두 뺀다. 원본은 입력만 공백을 빼고 사전 쪽은 그대로 둬서, 공백이 든 항목은 영영 못 찾았다."""
    return "".join(str(text).split())


@dataclass
class DictionaryEntry:
    ko: str
    translations: dict[str, str]  # 언어 코드 → 번역. 비어 있는 언어는 빠진다.


class MenuDictionary:
    def __init__(self, path: Path):
        self.path = path
        self._entries: dict[str, DictionaryEntry] | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.path.exists()

    @property
    def loaded(self) -> bool:
        return self._entries is not None

    def _ensure_loaded(self) -> dict[str, DictionaryEntry]:
        if self._entries is None:
            with self._lock:
                if self._entries is None:
                    self._entries = self._load()
        return self._entries

    def _load(self) -> dict[str, DictionaryEntry]:
        frame = pd.read_pickle(self.path)
        entries: dict[str, DictionaryEntry] = {}
        for ko, *values in zip(*(frame[column].tolist() for column in ("ko", *LANGS))):
            key = normalize(ko)
            if not key or key in entries:  # 원본처럼 같은 메뉴명이 여러 번이면 처음 것
                continue
            translations = {
                lang: value.strip() for lang, value in zip(LANGS, values) if isinstance(value, str) and value.strip()
            }
            entries[key] = DictionaryEntry(ko=str(ko), translations=translations)
        return entries

    def __len__(self) -> int:
        return len(self._ensure_loaded())

    def lookup(self, text: str) -> DictionaryEntry | None:
        return self._ensure_loaded().get(normalize(text))

    def search(self, query: str, limit: int = 50) -> tuple[int, list[DictionaryEntry]]:
        """부분 일치 검색 — 완전 일치, 앞부분 일치, 짧은 이름 순. (전체 건수, 앞에서 limit 개)를 돌려준다."""
        needle = normalize(query)
        if not needle:
            return 0, []
        hits = [(key, entry) for key, entry in self._ensure_loaded().items() if needle in key]
        hits.sort(key=lambda item: (item[0] != needle, not item[0].startswith(needle), len(item[0]), item[0]))
        return len(hits), [entry for _, entry in hits[:limit]]
