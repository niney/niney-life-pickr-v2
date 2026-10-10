"""HTTP API — 웹 어드민 체험 페이지가 Vite 개발 프록시(/smartly-api → 127.0.0.1:8700)로 부른다.

로컬 전용·인증 없음. 모델은 처음 쓰는 요청에서 올린다(번역 모델은 언어당 약 1GB, 몇 초 걸림).
"""

from __future__ import annotations

import io
from typing import Literal

from fastapi import APIRouter, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from . import config
from .evaluate import evaluate_ocr, evaluate_translation
from .ocr.recognizer import OcrRecognizer
from .samples import OcrSamples, TranslationSamples
from .translate.dictionary import MenuDictionary
from .translate.service import TranslateOptions, TranslationService, model_files

recognizer = OcrRecognizer(config.OCR_MODEL_PATH, config.OCR_OPT_PATH, config.DEVICE)
dictionary = MenuDictionary(config.DICTIONARY_PATH)
translation = TranslationService(dictionary, config.DEVICE)
ocr_samples = OcrSamples(config.OCR_MANIFEST_PATH, config.OCR_IMAGES_DIR)
translation_samples = TranslationSamples(config.TRANSLATE_TESTSET_DIR)

MAX_UPLOADS = 32
MAX_OCR_EVAL = 5000
MAX_TRANSLATE_EVAL = 1000

Lang = Literal["en", "ja", "zh-CN", "zh-TW"]

router = APIRouter(prefix="/smartly-api")


def require(available: bool) -> None:
    if not available:
        raise HTTPException(status_code=503, detail=config.SETUP_HINT)


@router.get("/health")
def health() -> dict:
    return {
        "device": str(config.DEVICE),
        "deviceName": config.DEVICE_NAME,
        "ocr": {"available": recognizer.available, "loaded": recognizer.loaded},
        "dictionary": {
            "available": dictionary.available,
            "loaded": dictionary.loaded,
            "size": len(dictionary) if dictionary.loaded else None,
        },
        "translationModels": [
            {
                "file": name,
                "langs": langs,
                "available": translation.model_for(langs[0]).available,
                "loaded": translation.model_for(langs[0]).loaded,
            }
            for name, langs in model_files().items()
        ],
        "ocrSamples": ocr_samples.available,
        "translationSamples": {lang: translation_samples.available(lang) for lang in config.LANGS},
    }


def _open_image(data: bytes, name: str) -> Image.Image:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            return image.copy()
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail=f"이미지를 읽지 못했습니다: {name}") from error


@router.post("/ocr")
def ocr(files: list[UploadFile] = File(...)) -> dict:
    """메뉴명 한 줄 이미지들 → 글자. 통사진을 넣으면 한 줄로 우겨 넣어 읽으니 먼저 잘라서 보낼 것."""
    require(recognizer.available)
    if len(files) > MAX_UPLOADS:
        raise HTTPException(status_code=400, detail=f"한 번에 {MAX_UPLOADS}장까지 올릴 수 있습니다")
    images = [_open_image(file.file.read(), file.filename or "") for file in files]
    results = recognizer.recognize(images)
    return {
        "results": [
            {"name": file.filename, "text": result.text, "confidence": result.confidence, "width": image.width,
             "height": image.height}
            for file, image, result in zip(files, images, results)
        ]
    }


@router.get("/ocr/samples/{sample_id}/image")
def ocr_sample_image(sample_id: int) -> FileResponse:
    require(ocr_samples.available)
    if ocr_samples.get(sample_id) is None:
        raise HTTPException(status_code=404, detail="없는 테스트 이미지입니다")
    return FileResponse(ocr_samples.image_path(sample_id), media_type="image/jpeg",
                        headers={"Cache-Control": "public, max-age=86400"})


class OcrEvalRequest(BaseModel):
    count: int = Field(24, ge=1, le=MAX_OCR_EVAL)
    seed: int = 0


@router.post("/evaluate/ocr")
def evaluate_ocr_route(body: OcrEvalRequest) -> dict:
    """테스트 이미지를 무작위로 골라 인식하고 CER(문자 오류율)을 매긴다 — 원본 문서 수치 2.9%."""
    require(recognizer.available and ocr_samples.available)
    return {"total": len(ocr_samples), **evaluate_ocr(recognizer, ocr_samples, body.count, body.seed)}


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200)
    langs: list[Lang] = Field(default_factory=lambda: list(config.LANGS), min_length=1)
    mode: Literal["auto", "model", "compare"] = "auto"
    beamSize: int = Field(5, ge=1, le=10)
    nBest: int = Field(1, ge=1, le=5)
    replaceUnk: bool = False


@router.post("/translate")
def translate(body: TranslateRequest) -> dict:
    """한국어 메뉴명 → 언어별 결과. 결과마다 사전에서 왔는지(dictionary) 모델이 번역했는지(model) 표시한다."""
    require(dictionary.available and all(translation.model_for(lang).available for lang in body.langs))
    options = TranslateOptions(mode=body.mode, beam_size=body.beamSize, n_best=body.nBest, replace_unk=body.replaceUnk)
    [per_lang] = translation.translate_many([body.text], list(body.langs), options)
    entry = dictionary.lookup(body.text)
    return {
        "input": body.text,
        "dictionaryKo": entry.ko if entry else None,
        "results": [
            {
                "lang": result.lang,
                "text": result.text,
                "source": result.source,
                "dictionary": result.dictionary,
                "candidates": [c.__dict__ for c in result.candidates],
            }
            for result in per_lang.values()
        ],
    }


class TranslateEvalRequest(BaseModel):
    lang: Lang = "en"
    count: int = Field(20, ge=1, le=MAX_TRANSLATE_EVAL)
    seed: int = 0


@router.post("/evaluate/translate")
def evaluate_translate_route(body: TranslateEvalRequest) -> dict:
    """테스트셋 메뉴명을 무작위로 골라 번역하고 글자 단위 BLEU 를 매긴다 — 원본 문서 수치 0.70~0.78."""
    require(dictionary.available and translation_samples.available(body.lang)
            and translation.model_for(body.lang).available)
    return {
        "total": translation_samples.count(body.lang),
        **evaluate_translation(translation, translation_samples, body.lang, body.count, body.seed),
    }


@router.get("/dictionary/search")
def dictionary_search(q: str = Query(min_length=1, max_length=50), limit: int = Query(50, ge=1, le=200)) -> dict:
    require(dictionary.available)
    total, entries = dictionary.search(q, limit)
    return {"total": total, "items": [{"ko": e.ko, "translations": e.translations} for e in entries]}


app = FastAPI(title="smartly", description=__doc__)
app.include_router(router)
