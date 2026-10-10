# smartly

AI 허브 [관광 음식메뉴판 데이터(71553)](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71553)에 딸린 모델 두 개를 도커 없이 돌려 보는 **로컬 임시 체험 서버**.
웹 어드민 `테스트 → 메뉴판 AI`(`/admin/smartly-test`)가 Vite 개발 프록시(`/smartly-api` → `127.0.0.1:8700`)로 부른다. 운영 배포는 하지 않는다.

| 모델 | 하는 일 | 원본 수치 | 이 서버로 다시 잰 값(표본) |
|---|---|---|---|
| OCR (deep-text-recognition-benchmark TPS-VGG-BiLSTM-Attn) | 메뉴명 **한 줄로 잘린** 이미지 → 글자 | CER 2.9% | 5,000장 CER 2.97% |
| 번역 (OpenNMT-py 2.2 포크) + 메뉴 사전 11.7만 개 | 한국어 메뉴명 → 영어·일본어·중국어 간체·번체 | 글자 BLEU 0.70~0.78 | 1,000건씩 0.70~0.78 |

- 글자 위치를 찾는 검출기는 없다. 통사진은 화면에서 한 줄씩 드래그해 잘라 넣는다.
- 번역 점수의 대부분은 사전 조회에서 나온다(테스트셋의 약 78%가 사전에 그대로 있다). 사전에 없는 메뉴를 모델이 번역한 몫의 BLEU 는 0.03~0.12 이고 결과에 `<unk>` 가 많다. 모델 어휘(8만 개)가 일반 문장 위주라 메뉴명 전용 모델로 보기 어렵다.
- 원본 BLEU 는 문자열을 그대로 nltk 에 넘겨 **글자 단위**로 매긴 값이다.
- 원본 후처리(너무 긴 번역은 가장 많이 나온 단어 하나로)는 동점이면 실행마다 답이 달랐다(`max(set(...))`). 여기서는 먼저 나온 단어로 고정했다.

## 준비·실행

Python 3.10 과 [uv](https://docs.astral.sh/uv/) 가 필요하다(PyTorch CPU 휠을 받는다).

```bash
pnpm --filter smartly setup   # uv sync + 배포본(.tmp/ai-menu/AI모델)에서 모델·데이터 추출(약 6GB, 1~2분)
pnpm dev:smartly              # 127.0.0.1:8700
pnpm dev:web                  # 어드민 → 테스트 → 메뉴판 AI
pnpm --filter smartly pytest  # 모델이 없으면 API 테스트는 건너뜀
```

- 배포본 위치가 다르면 `uv run --no-sync python scripts/extract.py --source <AI모델 폴더>`. 테스트 이미지를 빼려면 `--skip-ocr-testset`.
- 환경 변수: `SMARTLY_PORT`(8700), `SMARTLY_HOST`(127.0.0.1), `SMARTLY_DEVICE`(auto | cpu | cuda, 기본 auto — CUDA 를 쓸 수 있으면 GPU), `SMARTLY_MODELS_DIR`, `SMARTLY_DATA_DIR`.
- 번역 모델은 언어마다 약 1GB 라 처음 쓰는 요청에서 올린다(1~2초). 셋 다 올리면 메모리를 수 GB 쓴다(GPU 면 VRAM 약 2.5GB).

### GPU(CUDA)

```bash
pnpm --filter smartly setup:cuda   # 서버를 끄고 실행 — 같은 버전 torch 의 CUDA 13.0 빌드(cu130)로 바꾼다
pnpm dev:smartly                   # SMARTLY_DEVICE=auto 라 GPU 를 잡는다(화면 상단 '장치 cuda · …')
```

- `uv.lock` 은 CPU 빌드 기준 그대로고 가상환경의 torch 만 바꾼다. 그래서 `serve`·`pytest` 는 `uv run --no-sync` 로 돈다. `setup`(= `uv sync`)을 다시 돌리면 CPU 로 돌아간다.
- 드라이버가 CUDA 13 이상을 지원해야 한다(`nvidia-smi`). 다른 빌드는 `uv run --no-sync python scripts/use_cuda.py --cuda cu126`.
- RTX 4090 실측(2026-10-10, 모델 적재 제외): OCR 5,000장 CPU 61초 → GPU 4.7초, 번역 64건(모델만) CPU 5.8~8.3초 → GPU 0.54~0.58초. 결과는 CPU 와 글자 하나까지 같다(OCR 5,000장·번역 언어별 300건 비교).

## API (`/smartly-api`)

| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/health` | 장치, 모델·사전·테스트셋 파일 유무와 적재 여부 |
| POST | `/ocr` | `files`(여러 장, 최대 32) → `{ results: [{ name, text, confidence, width, height }] }` |
| GET | `/ocr/samples/{id}/image` | 테스트 이미지(0~129,103) |
| POST | `/evaluate/ocr` | `{ count ≤ 5000, seed }` → CER·완전 일치율과 항목별 결과 |
| POST | `/translate` | `{ text, langs, mode: auto \| model \| compare, beamSize, nBest, replaceUnk }` → 언어별 결과와 출처(dictionary·model) |
| POST | `/evaluate/translate` | `{ lang, count ≤ 1000, seed }` → 글자 BLEU(전체·사전 몫·모델 몫)와 항목별 결과 |
| GET | `/dictionary/search` | `q`, `limit` → 사전 부분 검색 |

## 코드 출처와 고친 곳

- `onmt/` — 번역 도커 이미지(`ko-menu-translate.tar`)의 `/letr/onmt` 를 그대로 옮겼다(OpenNMT-py 2.2.0 포크, MIT, `onmt/LICENSE.md`). 고친 곳: `model_builder.py` 의 `torch.load(..., weights_only=False)`(torch ≥ 2.6 에서 torchtext Field 가 든 체크포인트를 열려고). 체크포인트가 `onmt.*` 경로로 피클돼 있어 패키지 이름을 바꾸면 못 연다.
- `smartly/ocr/dtrb/` — OCR 도커 이미지의 `/letr/inferences` 에서 모델 정의만 옮겼다(Apache-2.0, `LICENSE.md`). 고친 곳: 상대 import, 텐서를 입력과 같은 장치에 만들기(원본은 CPU·GPU 중 하나로 고정), `grid_sample` 의 `align_corners=False` 명시(학습 때 기본값과 같음).
- 모델·사전·이미지 같은 AI 허브 배포물은 리포에 넣지 않는다(`models/`, `data/` 는 gitignore). 공개 화면에 쓰려면 AI 허브 이용 조건부터 확인한다.
