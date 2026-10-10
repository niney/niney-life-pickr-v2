"""정확도 재현 — 원본 get_cer.py · get_bleu.py 와 같은 채점식으로 표본을 매긴다."""

from __future__ import annotations

import time
from dataclasses import dataclass

from jiwer import cer as jiwer_cer
from nltk.translate.bleu_score import SmoothingFunction, sentence_bleu
from PIL import Image

from .ocr.recognizer import OcrRecognizer
from .samples import OcrSamples, TranslationSamples
from .translate.nmt import postprocess
from .translate.service import TranslateOptions, TranslationService

_smoothing = SmoothingFunction().method1


def char_cer(reference: str, hypothesis: str) -> float:
    if not reference:
        return 0.0 if not hypothesis else 1.0
    return float(jiwer_cer(reference, hypothesis))


def char_bleu(candidate: str, reference: str) -> float:
    """원본 get_bleu.py 그대로 — 문자열을 넘겨 **글자 단위** BLEU 가 된다. 4글자 미만은 1-gram 만 본다."""
    if not isinstance(candidate, str):
        return 0.0
    weights = (1.0, 0.0, 0.0, 0.0) if len(candidate) < 4 else (0.25, 0.25, 0.25, 0.25)
    return float(sentence_bleu([reference], candidate, weights=weights, smoothing_function=_smoothing))


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


@dataclass
class OcrEvalItem:
    id: int
    gt: str
    text: str
    confidence: float
    cer: float


def evaluate_ocr(recognizer: OcrRecognizer, samples: OcrSamples, count: int, seed: int) -> dict:
    started = time.monotonic()
    picked = samples.random(count, seed)
    images = []
    for sample in picked:
        with Image.open(samples.image_path(sample.id)) as image:
            images.append(image.copy())
    results = recognizer.recognize(images)
    items = [
        OcrEvalItem(id=s.id, gt=s.gt, text=r.text, confidence=r.confidence, cer=char_cer(s.gt, r.text))
        for s, r in zip(picked, results)
    ]
    return {
        "count": len(items),
        "seed": seed,
        "meanCer": _mean([item.cer for item in items]),
        "exactRate": _mean([1.0 if item.gt == item.text else 0.0 for item in items]),
        "seconds": time.monotonic() - started,
        "items": [item.__dict__ for item in items],
    }


def evaluate_translation(
    service: TranslationService, samples: TranslationSamples, lang: str, count: int, seed: int,
) -> dict:
    """원본 흐름(사전 → 모델)으로 번역하고 글자 단위 BLEU 를 매긴다. 사전·모델 몫을 따로 보여 준다.

    모델 결과는 원본처럼 후처리만 하고 공백은 그대로 둔 채 채점한다(화면 표시는 공백을 뗀 text).
    """
    started = time.monotonic()
    picked = samples.random(lang, count, seed)
    translated = service.translate_many([s.ko for s in picked], [lang], TranslateOptions(mode="auto"))
    items = []
    for sample, per_lang in zip(picked, translated):
        result = per_lang[lang]
        if result.source == "model":
            scored = postprocess(lang, result.candidates[0].raw)
        else:
            scored = result.text or ""
        items.append({
            "ko": sample.ko,
            "reference": sample.reference,
            "text": result.text,
            "source": result.source,
            "bleu": char_bleu(scored, sample.reference),
        })
    by_source = {
        source: [item["bleu"] for item in items if item["source"] == source] for source in ("dictionary", "model")
    }
    return {
        "lang": lang,
        "count": len(items),
        "seed": seed,
        "meanBleu": _mean([item["bleu"] for item in items]),
        "dictionaryRate": _mean([1.0 if item["source"] == "dictionary" else 0.0 for item in items]),
        "dictionaryBleu": _mean(by_source["dictionary"]),
        "modelBleu": _mean(by_source["model"]),
        "seconds": time.monotonic() - started,
        "items": items,
    }
