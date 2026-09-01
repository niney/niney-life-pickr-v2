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
| `housing/reb-complexes.csv` | 한국부동산원 공동주택 단지 식별정보_기본정보 — data.go.kr **15106861** (UTF-8 BOM, 2025-09-18 기준) | 44MB | `pnpm --filter friendly load:housing-complexes data/open/housing/reb-complexes.csv` | 307,408행 중 **아파트 45,920단지**(연립 24,033·다세대 237,454 은 1차 미적재) |
| `housing/reb-complex-names.csv` | 한국부동산원 공동주택 단지 식별정보_단지명 이력정보 — data.go.kr **15106867** | 0.6MB | 위 명령의 `--names=` (기본 경로면 자동) | 8,905행 → 아파트 1,552단지 별칭 |
| `housing/gongsi-2025.zip` | 국토교통부 주택 공시가격 정보(2025) — data.go.kr **3073746** (호별 공시가격, 2025-01-01 기준, 연 1회 · 다운로드 버튼이 JS 라 `selectFileDataDownload.do` → `fileDownload.do?atchFileId=` 순으로 받는다) | 144MB(zip) / CSV 3.4GB | `pnpm --filter friendly load:housing-prices` (zip 그대로 스트리밍) | 15,580,435행 → 아파트 단지 × 면적 구간 공시가격 중위·범위 + 도로명주소 |
| `housing/20260828_단지_기본정보.xlsx` | 국토교통부 공동주택 관리비 공개 의무단지 정보 — [data.go.kr **15098979**](https://www.data.go.kr/data/15098979/fileData.do) (K-apt 단지 기본정보, 주 1회 · 그 페이지에서 로그인 후 "다운로드" 로 수동 다운로드, 파일명 그대로 두면 로더가 최신 날짜 파일을 고른다. 1행은 안내문이고 헤더는 2행 — 로더가 건너뛴다) | 11MB | `pnpm --filter friendly load:housing-kapt` | 21,701행 → **20,273단지** 매칭(지번 17,484 · 이름 924 · 도로명 1,865; 모호 393 · 미매칭 920) — 단지코드·분양형태(임대 판별)·난방·승강기(유형별 열 합산)·도로명주소 |

파일이 아닌 **API** 로 받는 것: 식품안전나라 레시피 `COOKRCP01`(1,156건 → 1,101종). 키는
`.env` 의 `FOOD_RECIPE_API_KEY`. `pnpm --filter friendly load:food-catalog --source=recipe`.

집값 실거래도 **API** — 국토교통부 아파트 매매 실거래가 상세(data.go.kr **15126468**, `RTMSDataSvcAptTradeDev`)·
아파트 전월세 실거래가(**15126474**, `RTMSDataSvcAptRent`). 시군구(법정동 5자리) × 계약년월 단위로
받으므로 원본 파일이 없고 `HousingTradeSync` 장부가 "어느 달을 받았나" 를 기억한다. 키는 `.env` 의
`RTMS_API_KEY`(비우면 `BUS_API_KEY` 폴백 — 두 데이터셋 활용신청 필요, 개발계정 일 10,000콜).
`pnpm --filter friendly load:housing-trades --months=24` 로 백필(≈12,000콜 → 이틀에 나눠 실행해도 장부가
이어 받는다), 이후 `--recent=3` 으로 최근 3개월 재수집(신고 지연·해제 반영) — 서버의 `HOUSING_REFRESH_CRON`
이 같은 일을 자동으로 한다. 단지 좌표는 지번 주소를 VWorld 로 지오코딩하며 일상지도와 **같은 캐시 압축본**
(`apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz`)에 실린다 — 로컬에서 온라인 적재 후
`export:life-geocode` 로 갱신해 커밋하면 운영은 `--offline` 으로 호출 0건.

집값 보강 적재 순서(단지 마스터 → 실거래 → 공시가격 → K-apt → 건축물대장 → 좌표 보완). 단지 마스터를 재적재해도
보강 컬럼·좌표는 같은 id 에서 이어받는다(`replaceHousingComplexes`).

| 단계 | 명령 | 원천·쿼터 |
|---|---|---|
| 공시가격 | `load:housing-prices` | 위 zip, 쿼터 없음(연 1회 파일 교체) |
| K-apt 속성 | `load:housing-kapt [xlsx]` / `--source=api --max-calls=4900` | 파일(주 1회) 또는 API [15057332](https://www.data.go.kr/data/15057332/openapi.do)·[15058453](https://www.data.go.kr/data/15058453/openapi.do)(`KAPT_API_KEY`, 일 5,000 — 경로는 `AptListService4/getTotalAptList4`·`AptBasisInfoServiceV5/getAphusBassInfoV5`·`getAphusDtlInfoV5`, 2026-09-02 확인. 게이트웨이 `12` 는 미신청이 아니라 경로 버전 불일치) |
| 건축물대장 | `load:housing-buildings --max-calls=9800` | 건축HUB 15134735(`BLDG_API_KEY`, 일 10,000 — 단지당 2콜, ≈5일) |
| 좌표 보완 | `geocode:housing-missing [--offline]` | 도로명(공시가격·K-apt·건축물대장) → 지번 변형, VWorld 캐시 공유 |
| 실거래 백필 | `load:housing-trades --months=60 --recent=0 --max-calls=9800` (매일) | 매매 2006-01~·전월세 2011-01~ 조회 가능 |

영양성분은 [data.go.kr 15100070](https://www.data.go.kr/data/15100070/standard.do) 에 같은 내용의
API(`tn_pubr_public_nutri_food_info_api`)도 있지만 **쓰지 않는다** — 배포본 CSV 가 같은 데이터이고
쿼터를 안 쓴다. data.go.kr 는 **데이터셋마다 활용신청**이 따로라, 다른 데이터셋용 키를 그대로
쓰면 `30 등록되지 않은 서비스키` 가 난다(키가 잘못된 게 아니라 그 데이터셋에 신청이 안 된 것).

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
