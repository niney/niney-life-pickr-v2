# 원본 데이터 운영 가이드

리포에 **원본 파일은 넣지 않는다**(`/data/` 는 `.gitignore`). 이 문서가 "무엇을 어디서 받아
어디에 두고 어떤 명령으로 적재하는가"의 단일 기준이다. 데이터셋 선정 근거·API 스펙 비교는
[PLAN-meal.md](PLAN-meal.md) 의 데이터 소스 표를 본다.

## 원칙

1. 원본은 **적재기(loader)의 입력일 뿐**이다. 한 번 DB 에 들어가면 서버는 파일을 보지 않는다 →
   원본은 **갱신·재구축 때만** 필요하다.
2. 그래서 보관 기준은 **"다시 받기 얼마나 어려운가"** 이다. 공개 URL 로 즉시 받을 수 있으면 지운다.
   로그인·심의·수십 GB 가 걸리면 **필요한 부분만 추출해** 남긴다.
3. 표준 위치에 두면 적재 명령에 경로를 안 써도 된다(로더가 `data/open/...` 를 기본으로 찾는다).

## 현재 보관 중 (`data/open/`)

| 경로 | 출처 | 크기 | 적재 명령 | 결과 |
|---|---|---|---|---|
| `food/mfds-nutrition.csv` | 식약처 전국통합식품영양성분정보(음식) — data.go.kr **15100070** (CSV 배포본) | 6.9MB | `pnpm --filter friendly load:food-catalog --source=nutrition` | 19,495행 → **1,236종** |
| `food/hansik-800.xlsx` | 한식진흥원 한식메뉴 외국어표기 800선 — data.go.kr **15129784** | 0.5MB | `pnpm --filter friendly load:food-catalog --source=hansik800` | 800행 → **452종**(+348종 별칭 보강) |
| `life/cctv.csv` | 지방행정인허가데이터개방 전국 CCTV 설치현황 (CP949) | 79MB | `pnpm --filter friendly load:life-cctv data/open/life/cctv.csv` | **377,243행** |
| `life/toilet.csv` | 지방행정인허가데이터개방 전국 공중화장실 (CP949) | 16MB | `pnpm --filter friendly load:life-toilets data/open/life/toilet.csv` | **53,559행** |
| `eval/meal-photos/` | AI Hub 「한국 이미지(음식)」에서 **추출**한 평가셋 | 91MB | (적재 안 함 — 모델 평가 전용) | **150클래스 × 5장 = 750장** |

파일이 아닌 **API** 로 받는 것: 식품안전나라 레시피 `COOKRCP01`(1,156건 → 1,101종). 키는
`.env` 의 `FOOD_RECIPE_API_KEY`. `pnpm --filter friendly load:food-catalog --source=recipe`.

인자 없이 `pnpm --filter friendly load:food-catalog` 를 돌리면 위 파일 2개 + 레시피 API +
로컬 외식 어휘까지 **전체 재적재**가 된다(`--classify` 를 붙이면 미분류 행 LLM 분류까지).

## 평가셋 (`eval/meal-photos/`)

파일명이 곧 정답 라벨이다(`곱창전골_0.jpg` → 정답 `곱창전골`). 그래서 인식 모델 비교가 한 줄이다.

```bash
pnpm --filter friendly probe:meal-vision -- --limit=30 --label-from-filename --models=qwen3.5:397b,gemma4:31b
```

`--limit` 은 앞에서 자르지 않고 **목록 전체에 균등 간격**으로 뽑는다(파일명이 클래스순이라
앞에서 자르면 '가~' 클래스만 평가하게 된다). 같은 `--limit` 이면 표본이 항상 같아 비교가 재현된다.
사진 1장에 약 4~7초 → 150장이면 모델당 10~15분.

원본 `kfood.zip`(16GB, **추출 확인 후 삭제함**)은 150클래스 × 약 1,000장 = 150,507장이었다. 같은 접시를 각도·조명만
바꿔 찍은 연속 컷이 대부분이라 모델 비교에는 클래스당 몇 장이면 충분하다 → 클래스 안에서 고르게
5장씩만 뽑았다(750장, 0.5%). 재다운로드에 AI Hub 로그인·승인이 필요하므로 추출본은 남긴다. 원본은
**중첩 zip 이 무압축 저장**이라 전체를 풀지 않고 필요한 멤버만 스트리밍해서 추출할 수 있다.
재추출이 필요하면(클래스당 장수를 늘리려면) 아래를 쓴다.

```python
# python3 extract_eval.py — kfood.zip → data/open/eval/meal-photos/<클래스>_<N>.jpg
import zipfile, os, re
SRC, OUT, PER_CLASS = "data/open/한국 음식 이미지/kfood.zip", "data/open/eval/meal-photos", 5
dec = lambda n: n.encode('cp437').decode('cp949', 'replace')   # 원본 파일명이 CP949
safe = lambda s: re.sub(r'[\\/:*?"<>|\s_]+', '', s)            # 라벨 파서는 첫 '_' 앞을 클래스로 본다
os.makedirs(OUT, exist_ok=True)
z = zipfile.ZipFile(SRC)
for oi in z.infolist():                                        # 27개 대분류 zip
    if not dec(oi.filename).lower().endswith('.zip'): continue
    with z.open(oi) as f:                                      # stored → seek 가능
        inner = zipfile.ZipFile(f); by = {}
        for ii in inner.infolist():
            n = dec(ii.filename)
            if ii.is_dir() or not n.lower().endswith(('.jpg', '.jpeg', '.png')): continue
            by.setdefault([p for p in n.split('/') if p][-2], []).append(ii)
        for cls, items in by.items():
            picks = sorted(items, key=lambda i: dec(i.filename))
            for k in range(PER_CLASS):                             # 앞 N장이 아니라 고르게 — 연속 컷 회피
                with inner.open(picks[int(k * len(picks) / PER_CLASS)]) as src, \
                     open(f"{OUT}/{safe(cls)}_{k}.jpg", 'wb') as out:
                    out.write(src.read())
```

## 백업 (원본과 별개)

원본은 다시 받으면 되지만 **아래 둘은 복구 불가**다.

- `apps/friendly/data/prod.db` — 크롤링·리뷰 분석·병합 결과·사용자 식단 기록
- `apps/friendly/data/meal-photos/` — 사용자가 올린 식단 사진(DB 에 경로만 있다)

자세한 절차는 [deploy-friendly.md](deploy-friendly.md).

> 주의: 테스트는 `.env` 의 `DATABASE_URL`(= prod.db)을 그대로 쓴다. 실 데이터를 지우는 테스트가
> 없도록 DB 를 건드리는 테스트는 반드시 `useIsolatedDatabase()` 로 격리한다.
