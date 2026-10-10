"""메뉴명 한 줄 이미지 → 글자 (deep-text-recognition-benchmark TPS-VGG-BiLSTM-Attn).

글자 위치를 찾는 검출기는 없다 — 메뉴명 한 줄만 잘라 낸 이미지를 받는다. 학습 설정(opt.txt)대로 흑백으로 바꿔
비율과 상관없이 300×64 로 늘려 넣으므로, 아주 길거나 세로로 쓴 글씨는 정확도가 떨어진다.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch
from PIL import Image

from .dtrb.model import Model
from .dtrb.utils import AttnLabelConverter

IMG_H, IMG_W = 64, 300
BATCH_MAX_LENGTH = 50
EOS = "[s]"


@dataclass
class OcrResult:
    text: str
    # 글자마다 고른 확률의 곱(원본 demo 의 confidence_score 와 같은 정의). 0~1.
    confidence: float


def read_character_set(opt_path: Path) -> str:
    """opt.txt 의 `character:` 줄이 학습에 쓴 글자 목록(1,189자)이다. 같은 블록이 여러 번 있으면 마지막 것."""
    found = None
    for line in opt_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("character: "):
            found = line[len("character: "):]
    if not found:
        raise ValueError(f"{opt_path} 에 character 항목이 없다")
    return found


def preprocess(image: Image.Image) -> torch.Tensor:
    """원본 ResizeNormalize 와 같다: 흑백 → 300×64 BICUBIC → [0,1] → [-1,1]. 결과 1×64×300."""
    gray = image.convert("L").resize((IMG_W, IMG_H), Image.BICUBIC)
    array = np.asarray(gray, dtype=np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0).sub_(0.5).div_(0.5)


class OcrRecognizer:
    def __init__(self, model_path: Path, opt_path: Path, device: torch.device, batch_size: int = 64):
        self.model_path = model_path
        self.opt_path = opt_path
        self.device = device
        self.batch_size = batch_size
        self._model: Model | None = None
        self._converter: AttnLabelConverter | None = None
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return self.model_path.exists() and self.opt_path.exists()

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        converter = AttnLabelConverter(read_character_set(self.opt_path))
        opt = SimpleNamespace(
            Transformation="TPS", FeatureExtraction="VGG", SequenceModeling="BiLSTM", Prediction="Attn",
            num_fiducial=20, imgH=IMG_H, imgW=IMG_W, input_channel=1, output_channel=512, hidden_size=256,
            num_class=len(converter.character), batch_max_length=BATCH_MAX_LENGTH,
        )
        model = Model(opt)
        # DataParallel 로 감싼 채 저장돼 키에 'module.' 이 붙어 있다. 텐서만 든 state_dict 라 weights_only 로 연다.
        state = torch.load(self.model_path, map_location="cpu", weights_only=True)
        model.load_state_dict({key.removeprefix("module."): value for key, value in state.items()})
        model.to(self.device).eval()
        self._converter = converter
        self._model = model

    def recognize(self, images: list[Image.Image]) -> list[OcrResult]:
        with self._lock:
            self._ensure_loaded()
            results: list[OcrResult] = []
            for start in range(0, len(images), self.batch_size):
                results.extend(self._recognize_batch(images[start:start + self.batch_size]))
            return results

    def _recognize_batch(self, images: list[Image.Image]) -> list[OcrResult]:
        assert self._model is not None and self._converter is not None
        batch = torch.stack([preprocess(image) for image in images]).to(self.device)
        text_for_pred = torch.zeros(len(images), BATCH_MAX_LENGTH + 1, dtype=torch.long, device=self.device)
        with torch.inference_mode():
            preds = self._model(batch, text_for_pred, is_train=False)
        max_probs, indices = preds.softmax(dim=2).max(dim=2)

        results = []
        for row_indices, row_probs in zip(indices.tolist(), max_probs.tolist()):
            chars = [self._converter.character[i] for i in row_indices]
            end = chars.index(EOS) if EOS in chars else len(chars)
            confidence = float(np.prod(row_probs[: end + 1]))  # [s] 까지 포함 — 원본과 같은 범위
            results.append(OcrResult(text="".join(chars[:end]), confidence=confidence))
        return results
