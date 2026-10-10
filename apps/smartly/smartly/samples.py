"""AI 허브 테스트셋 — OCR 은 잘린 메뉴명 이미지 129,104장, 번역은 언어별 메뉴명·정답 130,405쌍."""

from __future__ import annotations

import json
import random
import threading
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


def pick(total: int, count: int, seed: int) -> list[int]:
    """seed 가 같으면 같은 표본 — 화면에서 같은 예시를 다시 볼 수 있게."""
    return random.Random(seed).sample(range(total), min(count, total))


@dataclass
class OcrSample:
    id: int
    gt: str  # 정답 메뉴명(원본 파일명의 '%' 앞)


class OcrSamples:
    def __init__(self, manifest_path: Path, images_dir: Path):
        self.manifest_path = manifest_path
        self.images_dir = images_dir
        self._items: list[OcrSample] | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.manifest_path.exists()

    def _ensure_loaded(self) -> list[OcrSample]:
        if self._items is None:
            with self._lock:
                if self._items is None:
                    raw = json.loads(self.manifest_path.read_text(encoding="utf-8"))
                    self._items = [OcrSample(id=item["id"], gt=item["gt"]) for item in raw]
        return self._items

    def __len__(self) -> int:
        return len(self._ensure_loaded())

    def image_path(self, sample_id: int) -> Path:
        return self.images_dir / f"{sample_id:06d}.jpg"

    def get(self, sample_id: int) -> OcrSample | None:
        items = self._ensure_loaded()
        return items[sample_id] if 0 <= sample_id < len(items) else None

    def random(self, count: int, seed: int) -> list[OcrSample]:
        items = self._ensure_loaded()
        return [items[i] for i in pick(len(items), count, seed)]


@dataclass
class TranslationSample:
    ko: str
    reference: str


class TranslationSamples:
    def __init__(self, testset_dir: Path):
        self.testset_dir = testset_dir
        self._frames: dict[str, list[TranslationSample]] = {}
        self._lock = threading.Lock()

    def path(self, lang: str) -> Path:
        return self.testset_dir / f"{lang}.tsv"

    def available(self, lang: str) -> bool:
        return self.path(lang).exists()

    def _ensure_loaded(self, lang: str) -> list[TranslationSample]:
        with self._lock:
            if lang not in self._frames:
                frame = pd.read_csv(self.path(lang), sep="\t", usecols=["ko", lang], dtype=str, keep_default_na=False)
                self._frames[lang] = [TranslationSample(ko=ko, reference=ref) for ko, ref in zip(frame["ko"], frame[lang])]
            return self._frames[lang]

    def count(self, lang: str) -> int:
        return len(self._ensure_loaded(lang))

    def random(self, lang: str, count: int, seed: int) -> list[TranslationSample]:
        items = self._ensure_loaded(lang)
        return [items[i] for i in pick(len(items), count, seed)]
