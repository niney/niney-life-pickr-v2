"""경로·장치·포트 설정. 모델·데이터는 scripts/extract.py 가 AI 허브 배포본에서 꺼내 둔 곳을 읽는다."""

from __future__ import annotations

import os
from pathlib import Path

import torch

APP_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = Path(os.environ.get("SMARTLY_MODELS_DIR") or APP_DIR / "models")
DATA_DIR = Path(os.environ.get("SMARTLY_DATA_DIR") or APP_DIR / "data")

HOST = os.environ.get("SMARTLY_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMARTLY_PORT", "8700"))

OCR_MODEL_PATH = MODELS_DIR / "ocr" / "best_accuracy.pth"
OCR_OPT_PATH = MODELS_DIR / "ocr" / "opt.txt"
OCR_MANIFEST_PATH = DATA_DIR / "ocr" / "manifest.json"
OCR_IMAGES_DIR = DATA_DIR / "ocr" / "images"
DICTIONARY_PATH = DATA_DIR / "dictionary.pkl"
TRANSLATE_TESTSET_DIR = DATA_DIR / "translate"

LANGS = ("en", "ja", "zh-CN", "zh-TW")
# 중국어 간체·번체는 번역 모델 하나(zh)를 같이 쓴다 — 사전 항목만 따로 있다.
MODEL_FILE_BY_LANG = {"en": "en_model.pt", "ja": "ja_model.pt", "zh-CN": "zh_model.pt", "zh-TW": "zh_model.pt"}

SETUP_HINT = "모델·데이터가 없습니다 — `pnpm --filter smartly setup` 으로 AI 허브 배포본에서 먼저 꺼내세요."


def translate_model_path(lang: str) -> Path:
    return MODELS_DIR / "translate" / MODEL_FILE_BY_LANG[lang]


def resolve_device() -> torch.device:
    """SMARTLY_DEVICE=auto(기본)|cpu|cuda. auto 는 CUDA 를 쓸 수 있으면 GPU — 기본 설치는 CPU 휠이라
    `pnpm --filter smartly setup:cuda` 로 CUDA 휠을 깔아야 GPU 가 잡힌다."""
    wanted = os.environ.get("SMARTLY_DEVICE", "auto").lower()
    if wanted == "auto":
        wanted = "cuda" if torch.cuda.is_available() else "cpu"
    if wanted == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("SMARTLY_DEVICE=cuda 인데 CUDA 를 쓸 수 없다(CPU 휠 설치 상태)")
    return torch.device(wanted)


DEVICE = resolve_device()
DEVICE_NAME = torch.cuda.get_device_name(DEVICE) if DEVICE.type == "cuda" else None
