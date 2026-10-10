"""AI 허브 71553(관광 음식메뉴판) 배포본에서 smartly 가 쓰는 모델·사전·테스트셋을 꺼낸다.

도커 없이 이미지 tar(docker save 형식) 안의 /letr 레이어를 직접 읽는다.

  models/ocr/best_accuracy.pth, models/ocr/opt.txt   ← "2. 모델 파일"
  models/translate/{en,ja,zh}_model.pt                ← ko-menu-translate.tar
  data/dictionary.pkl, data/translate/<언어>.tsv       ← ko-menu-translate.tar
  data/ocr/images/<번호>.jpg + data/ocr/manifest.json  ← ko-menu-text-recognition.tar

테스트 이미지는 파일명이 정답("메뉴명%원본ID.jpg")인데 윈도우가 못 만드는 문자(" : < > ? * |)가 섞여 있어
번호로 저장하고 정답은 manifest 에 둔다. 이미 있는 파일은 건너뛴다(--force 로 다시 쓴다).

  uv run python scripts/extract.py [--source <AI모델 폴더>] [--skip-ocr-testset] [--force]
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tarfile
import time
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = APP_DIR.parent.parent / ".tmp" / "ai-menu" / "AI모델"

OCR_IMAGE_TAR = "5. 도커이미지/ko-menu-text-recognition.tar"
TRANSLATE_IMAGE_TAR = "5. 도커이미지/ko-menu-translate.tar"
OCR_MODEL_DIR = "2. 모델 파일"

TRANSLATE_LANGS = ("en", "ja", "zh-CN", "zh-TW")
OCR_TESTSET_PREFIX = "letr/data/data/testset_129104/"


def gt_from_filename(name: str) -> str:
    """테스트 이미지 파일명의 '%' 앞이 정답 메뉴명이다(원본 text_recognition.py 와 같은 규칙)."""
    return name.split("%")[0].strip()


def find_letr_layer(outer: tarfile.TarFile) -> str:
    """소스·모델을 복사한 `ADD ... in /letr` 단계의 레이어 경로를 이미지 설정의 빌드 이력에서 찾는다."""
    manifest = json.load(outer.extractfile("manifest.json"))[0]
    config = json.load(outer.extractfile(manifest["Config"]))
    # 빈 레이어(ENV·CMD 등)를 뺀 이력 순서가 manifest 의 Layers 순서와 같다.
    history = [h for h in config["history"] if not h.get("empty_layer")]
    layers = manifest["Layers"]
    if len(history) != len(layers):
        raise SystemExit(f"레이어 수({len(layers)})와 이력 수({len(history)})가 다르다 — 이미지 형식이 예상과 다름")
    for entry, layer in zip(history, layers):
        if "in /letr" in entry.get("created_by", ""):
            return layer
    raise SystemExit("/letr 레이어를 찾지 못했다")


def write_atomic(src, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    with open(tmp, "wb") as out:
        shutil.copyfileobj(src, out, length=1024 * 1024)
    tmp.replace(dest)


def stream_letr_layer(image_tar: Path, on_member) -> None:
    """이미지 tar 안의 /letr 레이어를 처음부터 끝까지 한 번 훑으며 파일마다 on_member(member, layer)를 부른다."""
    with tarfile.open(image_tar) as outer:
        layer_path = find_letr_layer(outer)
        print(f"  레이어 {layer_path.split('/')[0][:12]}… 읽는 중", flush=True)
        with tarfile.open(fileobj=outer.extractfile(layer_path), mode="r|") as layer:
            for member in layer:
                if member.isfile() and on_member(member, layer) is False:
                    return


def extract_translate(source: Path, force: bool) -> None:
    wanted: dict[str, Path] = {
        "letr/data/data/2-084_menu_dictionary_v0129.pkl": APP_DIR / "data" / "dictionary.pkl",
    }
    for model in ("en", "ja", "zh"):
        wanted[f"letr/data/models/{model}_model.pt"] = APP_DIR / "models" / "translate" / f"{model}_model.pt"
    for lang in TRANSLATE_LANGS:
        wanted[f"letr/data/data/2-084_onmt_testset_{lang}_130405.tsv"] = APP_DIR / "data" / "translate" / f"{lang}.tsv"

    todo = {name: dest for name, dest in wanted.items() if force or not dest.exists()}
    if not todo:
        print("번역: 이미 다 있음 — 건너뜀")
        return
    print(f"번역: {len(todo)}개 파일 꺼내는 중")

    def on_member(member: tarfile.TarInfo, layer: tarfile.TarFile):
        dest = todo.pop(member.name, None)
        if dest is not None:
            write_atomic(layer.extractfile(member), dest)
            print(f"  {dest.relative_to(APP_DIR)} ({member.size / 1e6:.0f}MB)", flush=True)
        return bool(todo)  # 다 꺼냈으면 나머지 레이어는 읽지 않는다

    stream_letr_layer(source / TRANSLATE_IMAGE_TAR, on_member)
    if todo:
        raise SystemExit(f"레이어에 없는 파일: {sorted(todo)}")


def extract_ocr_model(source: Path, force: bool) -> None:
    for name in ("best_accuracy.pth", "opt.txt"):
        dest = APP_DIR / "models" / "ocr" / name
        if dest.exists() and not force:
            continue
        with open(source / OCR_MODEL_DIR / name, "rb") as src:
            write_atomic(src, dest)
        print(f"OCR 모델: {dest.relative_to(APP_DIR)}")


def extract_ocr_testset(source: Path, force: bool) -> None:
    ocr_dir = APP_DIR / "data" / "ocr"
    manifest_path = ocr_dir / "manifest.json"
    if manifest_path.exists() and not force:
        print("OCR 테스트셋: 이미 있음 — 건너뜀")
        return
    images_dir = ocr_dir / "images"
    if images_dir.exists():
        shutil.rmtree(images_dir)
    images_dir.mkdir(parents=True)
    print("OCR 테스트셋: 이미지 꺼내는 중(약 13만 장)")

    entries: list[dict] = []
    started = time.monotonic()

    def on_member(member: tarfile.TarInfo, layer: tarfile.TarFile):
        if not member.name.startswith(OCR_TESTSET_PREFIX) or not member.name.lower().endswith(".jpg"):
            return True
        name = member.name[len(OCR_TESTSET_PREFIX):]
        sample_id = len(entries)
        with open(images_dir / f"{sample_id:06d}.jpg", "wb") as out:
            shutil.copyfileobj(layer.extractfile(member), out)
        entries.append({"id": sample_id, "gt": gt_from_filename(name), "file": name})
        if len(entries) % 10000 == 0:
            print(f"  {len(entries):,}장 ({time.monotonic() - started:.0f}초)", flush=True)
        return True

    stream_letr_layer(source / OCR_IMAGE_TAR, on_member)
    tmp = manifest_path.with_name("manifest.json.part")
    tmp.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    tmp.replace(manifest_path)
    print(f"  완료: {len(entries):,}장")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="AI 허브 배포본의 'AI모델' 폴더")
    parser.add_argument("--skip-ocr-testset", action="store_true", help="OCR 테스트 이미지(약 1.6GB)는 꺼내지 않는다")
    parser.add_argument("--force", action="store_true", help="이미 있는 파일도 다시 꺼낸다")
    args = parser.parse_args(argv)

    source: Path = args.source
    if not (source / TRANSLATE_IMAGE_TAR).exists():
        raise SystemExit(f"배포본을 찾지 못했다: {source} — --source 로 'AI모델' 폴더를 지정")

    extract_ocr_model(source, args.force)
    extract_translate(source, args.force)
    if not args.skip_ocr_testset:
        extract_ocr_testset(source, args.force)
    print("끝")


if __name__ == "__main__":
    main(sys.argv[1:])
