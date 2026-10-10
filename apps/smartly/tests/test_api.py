"""실제 모델로 도는 API 테스트 — `pnpm --filter smartly setup` 으로 모델·데이터를 꺼낸 뒤에만 돈다."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from smartly import config
from smartly.server import app

pytestmark = pytest.mark.skipif(
    not (config.OCR_MODEL_PATH.exists() and config.DICTIONARY_PATH.exists() and config.OCR_MANIFEST_PATH.exists()),
    reason="모델·데이터 없음 — pnpm --filter smartly setup",
)

client = TestClient(app)
API = "/smartly-api"


def test_health_reports_files():
    body = client.get(f"{API}/health").json()
    assert body["ocr"]["available"] is True
    assert {m["file"] for m in body["translationModels"]} == {"en_model.pt", "ja_model.pt", "zh_model.pt"}


def test_ocr_evaluation_reproduces_documented_accuracy():
    body = client.post(f"{API}/evaluate/ocr", json={"count": 300, "seed": 3}).json()
    assert body["count"] == 300 and body["total"] == 129104
    assert body["meanCer"] < 0.06  # 문서 2.9%, 표본 오차 감안


def test_ocr_upload_reads_test_image_and_rejects_non_image():
    sample = client.post(f"{API}/evaluate/ocr", json={"count": 1, "seed": 11}).json()["items"][0]
    image = client.get(f"{API}/ocr/samples/{sample['id']}/image")
    assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
    body = client.post(f"{API}/ocr", files=[("files", ("a.jpg", image.content, "image/jpeg"))]).json()
    assert body["results"][0]["text"] == sample["text"]
    bad = client.post(f"{API}/ocr", files=[("files", ("a.txt", b"nope", "text/plain"))])
    assert bad.status_code == 400


def test_ocr_accepts_png_upload():
    buffer = io.BytesIO()
    Image.new("RGB", (300, 64), "white").save(buffer, format="PNG")
    body = client.post(f"{API}/ocr", files=[("files", ("blank.png", buffer.getvalue(), "image/png"))]).json()
    assert 0.0 <= body["results"][0]["confidence"] <= 1.0


def test_translate_dictionary_hit_without_loading_model_path():
    body = client.post(f"{API}/translate", json={"text": "김치 찌개", "langs": ["en", "zh-TW"]}).json()
    assert body["dictionaryKo"] == "김치찌개"
    assert all(r["source"] == "dictionary" and r["candidates"] == [] for r in body["results"])


def test_translate_validates_input():
    assert client.post(f"{API}/translate", json={"text": ""}).status_code == 422
    assert client.post(f"{API}/translate", json={"text": "김치", "langs": ["fr"]}).status_code == 422


def test_dictionary_search_and_missing_sample():
    body = client.get(f"{API}/dictionary/search", params={"q": "비빔밥", "limit": 5}).json()
    assert body["total"] > 100 and len(body["items"]) == 5
    assert client.get(f"{API}/ocr/samples/99999999/image").status_code == 404
