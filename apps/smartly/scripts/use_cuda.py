"""설치된 torch 를 같은 버전의 CUDA 빌드로 바꾼다(NVIDIA GPU 용). 되돌리기는 `uv sync`(= pnpm --filter smartly setup).

잠금 파일(uv.lock)은 CPU 빌드 기준 그대로 두고 가상환경의 torch 만 갈아 끼운다 — 그래서 package.json 의
serve·pytest 는 `uv run --no-sync` 로 돌려 CPU 로 되돌아가지 않게 한다.

  uv run --no-sync python scripts/use_cuda.py [--cuda cu130]

cu130 은 CUDA 13.0 — 드라이버가 CUDA 13 이상을 지원해야 한다(nvidia-smi 의 CUDA 버전 확인).
실행 중인 smartly 서버가 있으면 torch DLL 이 잠겨 실패하니 먼저 끈다.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from importlib.metadata import version


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cuda", default="cu130", help="PyTorch 휠 색인 이름(cu126·cu130·cu132 …)")
    args = parser.parse_args(argv)

    installed = version("torch")
    base = installed.split("+")[0]
    print(f"torch {installed} → {base}+{args.cuda}")
    subprocess.run(
        [
            "uv", "pip", "install", "--python", sys.executable, f"torch=={base}",
            "--index-url", f"https://download.pytorch.org/whl/{args.cuda}", "--reinstall-package", "torch",
        ],
        check=True,
    )
    check = "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')"
    subprocess.run([sys.executable, "-c", check], check=True)


if __name__ == "__main__":
    main(sys.argv[1:])
