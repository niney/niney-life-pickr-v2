#!/usr/bin/env bash
#
# niney-life-pickr-v2 배포 스크립트 (운영 서버 전용)
# 사용: cd /home/samplepcb/niney-life-pickr-v2 && ./deploy.sh
#       ./deploy.sh 4        # 번호 바로 지정도 가능
#
# 케이스
#   1) API(friendly)만          — DB 스키마 변경 없음
#   2) API + DB 마이그레이션
#   3) 웹(apps/web)만
#   4) 웹 + API + DB (풀 재배포)
#   5) .env만
#   6) 일상지도 데이터 적재/갱신 — data/open/ 의 CSV + 저장소 지오코딩 캐시
#   7) 음식 카탈로그 적재/갱신 — data/open/food/ 의 배포본 + 레시피 API(코드 배포 없음)
#
# 일상지도(전국 CCTV·공중화장실) 데이터는 API 케이스(1,2,4)마다 자동 점검한다:
#   - 테이블이 비어 있으면 첫 적재(CSV 가 data/open/ 에 있을 때), 지오코딩 캐시 압축본이
#     이번 pull 로 바뀌었으면 가져오기 + 화장실 재적재(--offline, 업스트림 호출 0건).
#   - CSV 를 새로 올려 통째로 갱신하려면 6번.
#
# 음식 카탈로그(식단 관리)도 같은 방식으로 점검한다:
#   - 카탈로그가 비어 있고 data/open/food/ 에 배포본이 있으면 첫 적재(+LLM 분류·영양 보강).
#   - 배포본을 새로 올려 다시 적재하려면 7번. 카탈로그가 비면 자동완성·영양·추천 후보가 전부
#     빈 채로 돌아가므로(오류는 안 난다) 배포 후 종수를 꼭 확인한다.
#
# 마이그레이션이 포함된 케이스(2,4)는 "서버 중단 여부"를 물어본다.
#   - 추가형 마이그레이션(ADD COLUMN 등) → 중단 불필요(N)
#   - 파괴적 마이그레이션(DROP/NOT NULL/타입변경) → 중단 권장(y)

set -euo pipefail

ROOT="/home/samplepcb/niney-life-pickr-v2"
WEB_DIST="$ROOT/apps/web/dist"

# 일상지도 원천 CSV 는 git 밖(data/open/ 에 직접 업로드), 화장실 지오코딩 캐시는 저장소 압축본.
# 정리 규약(data/open/life/*.csv — docs/data-sources.md)을 먼저 보고, 없으면 localdata.go.kr 에서
# 내려받은 원래 파일명도 찾는다. 이미 서버에 올려둔 파일을 깨지 않기 위한 폴백이다.
# 경로는 환경변수 LIFE_CCTV_CSV / LIFE_TOILET_CSV 로 덮어쓸 수 있다.
LIFE_DATA_DIR="${LIFE_DATA_DIR:-$ROOT/data/open}"
first_existing() { local p; for p in "$@"; do [[ -f "$p" ]] && { printf '%s' "$p"; return 0; }; done; printf '%s' "$1"; }
LIFE_CCTV_CSV="${LIFE_CCTV_CSV:-$(first_existing "$LIFE_DATA_DIR/life/cctv.csv" "$LIFE_DATA_DIR/CCTV정보.csv")}"
LIFE_TOILET_CSV="${LIFE_TOILET_CSV:-$(first_existing "$LIFE_DATA_DIR/life/toilet.csv" "$LIFE_DATA_DIR/공중화장실정보.csv")}"
LIFE_GEOCODE_GZ="apps/friendly/src/modules/life-map/data/life-geocode-cache.json.gz"
# 음식 카탈로그 배포본 — 적재기(load:food-catalog)가 이 경로를 기본으로 찾는다. 출처는
# docs/data-sources.md. 영양성분 API(FOOD_API_KEY)는 선택이고, 파일이 있으면 파일이 우선이다.
FOOD_DATA_DIR="$ROOT/data/open/food"
FOOD_NUTRITION_CSV="$FOOD_DATA_DIR/mfds-nutrition.csv"
FOOD_HANSIK_XLSX="$FOOD_DATA_DIR/hansik-800.xlsx"
GZ_CHANGED=0   # 이번 pull 로 지오코딩 캐시 압축본이 바뀌었는지 — pull 이 채운다

cd "$ROOT"

# ── 헬퍼 ────────────────────────────────────────────────
step()       { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
pull() {
  step "코드 받기"
  local prev; prev="$(git rev-parse HEAD)"
  git pull --ff-only
  pnpm install --frozen-lockfile
  if [[ -n "$(git diff --name-only "$prev" HEAD -- "$LIFE_GEOCODE_GZ")" ]]; then GZ_CHANGED=1; fi
}
gen()        { step "prisma generate";      pnpm --filter friendly db:generate; }
migrate()    { step "prisma migrate deploy"; pnpm --filter friendly exec prisma migrate deploy; }
build_api()  { step "friendly 빌드";        pnpm --filter friendly build; }
build_web()  { step "web 빌드";             pnpm --filter web build; chmod -R o+rX "$WEB_DIST"; }
pm_stop()    { step "서버 중단";            pm2 stop friendly; }
pm_start()   { step "서버 기동";            pm2 start friendly --update-env; pm2 save; }
pm_reload()  { step "서버 reload";          pm2 reload friendly --update-env; pm2 save; }

# ── 일상지도 데이터 ────────────────────────────────────────
# status:life-map 은 "ok cctv=N toilet=M geocoded=G hospital=H cache=C" 한 줄(테이블이 없으면 "missing").
life_status() { pnpm --filter friendly status:life-map 2>/dev/null | grep -E '^(ok|missing)' | tail -n1 || true; }
# "ok a=1 b=2" 한 줄에서 값 하나 뽑기 — 일상지도·음식 카탈로그 상태가 같은 형식이다.
# sed 의 \b 는 GNU 확장이라 BSD sed(macOS)에서 조용히 빈 값이 된다 — 값이 비면 "0 건"으로
# 읽혀 불필요한 재적재를 도니, 이식성 있는 bash 정규식으로 뽑는다.
stat_val() {
  local key="$1" line="$2"
  [[ "$line" =~ (^|[[:space:]])"$key"=([0-9]+) ]] && printf '%s' "${BASH_REMATCH[2]}"
}

# 비어 있으면 첫 적재, 캐시 압축본이 바뀌었으면 가져오기(없는 키만 추가, 수 초) + 화장실 재적재.
# force=1 이면 전부 다시(CSV 를 새로 올린 '데이터 갱신'). CSV 가 없으면 안내만 하고 넘어간다.
# 적재는 Prisma 로 DB 에 직접 쓰므로 서버를 내리지 않아도 된다(WAL, 교체 트랜잭션 수 초~20초).
life_map_data() {
  local force="${1:-0}"
  local st; st="$(life_status)"
  if [[ "$st" != ok* ]]; then
    echo "  (일상지도 테이블 없음 — 마이그레이션(케이스 2/4) 뒤에 적재됩니다)"; return 0
  fi
  local cctv toilet geocoded hospital
  cctv="$(stat_val cctv "$st")"; toilet="$(stat_val toilet "$st")"; geocoded="$(stat_val geocoded "$st")"; hospital="$(stat_val hospital "$st")"
  echo "  일상지도 현재: CCTV ${cctv:-0}건 · 화장실 ${toilet:-0}건(좌표 ${geocoded:-0}) · 병의원 ${hospital:-0}건 · 캐시 압축본 변경=$GZ_CHANGED"
  if [[ "$force" == 1 || "$GZ_CHANGED" == 1 || "${toilet:-0}" == 0 ]]; then
    step "일상지도 지오코딩 캐시 가져오기(압축본)"; pnpm --filter friendly import:life-geocode
  fi
  if [[ "$force" == 1 || "${cctv:-0}" == 0 ]]; then
    if [[ -f "$LIFE_CCTV_CSV" ]]; then step "일상지도 CCTV 적재"; pnpm --filter friendly load:life-cctv "$LIFE_CCTV_CSV"
    else echo "  (CCTV CSV 없음: $LIFE_CCTV_CSV — 올린 뒤 ./deploy.sh 6)"; fi
  fi
  if [[ "$force" == 1 || "$GZ_CHANGED" == 1 || "${toilet:-0}" == 0 ]]; then
    if [[ -f "$LIFE_TOILET_CSV" ]]; then step "일상지도 화장실 적재(--offline, 호출 0건)"; pnpm --filter friendly load:life-toilets "$LIFE_TOILET_CSV" --offline
    else echo "  (화장실 CSV 없음: $LIFE_TOILET_CSV — 올린 뒤 ./deploy.sh 6)"; fi
  fi
  # 병의원 — CSV 가 아니라 심평원 API 전량 페이징(~80콜). 지오코더는 배포 예측성을 위해
  # --offline(좌표 결측 소수는 지도 미표시 — 수동으로 옵션 없이 재실행하면 채워진다).
  if [[ "$force" == 1 || "${hospital:-0}" == 0 ]]; then
    step "일상지도 병의원 적재(HIRA API, 지오코더 --offline)"; pnpm --filter friendly load:life-hospitals --offline || echo "  (병의원 적재 실패 — HIRA_API_KEY/활용신청 확인 뒤 재실행)"
  fi
}

ask_stop() {
  # 마이그레이션 전 서버 중단 여부 (기본 N = 무중단)
  read -rp $'\n파괴적 마이그레이션인가요? 서버를 중단하고 진행할까요? [y/N] ' a
  [[ "${a:-N}" == "y" || "${a:-N}" == "Y" ]]
}

# ── 케이스 실행 ─────────────────────────────────────────
# ── 음식 카탈로그(식단 관리) ────────────────────────────────────────────
# status:food-catalog 는 "ok items=N classified=C nutrition=U meals=M" 한 줄(테이블 없으면 "missing").
food_status() { pnpm --filter friendly status:food-catalog 2>/dev/null | grep -E '^(ok|missing)' | tail -n1 || true; }

# force=1 이면 이미 차 있어도 다시 적재한다(7번). 평소에는 비어 있을 때만 첫 적재.
food_catalog_data() {
  local force="${1:-0}"
  local st; st="$(food_status)"
  if [[ "$st" != ok* ]]; then
    echo "  (음식 카탈로그 테이블 없음 — 마이그레이션(케이스 2/4) 뒤에 적재됩니다)"; return 0
  fi
  local items; items="$(stat_val items "$st")"
  # 상태를 못 읽었으면 "0 종"으로 넘겨짚지 않는다 — 잘못 재적재하면 LLM 분류를 통째로 다시 돈다.
  if [[ -z "$items" ]]; then
    echo "  (상태 해석 실패: '$st' — 건너뜁니다. 필요하면 ./deploy.sh 7)"; return 0
  fi
  echo "  음식 카탈로그 현재: ${items}종 · 분류 $(stat_val classified "$st") · 영양 $(stat_val nutrition "$st")"
  if [[ "$force" != 1 && "$items" != 0 ]]; then return 0; fi

  if [[ ! -f "$FOOD_NUTRITION_CSV" && ! -f "$FOOD_HANSIK_XLSX" ]]; then
    echo "  (배포본 없음: $FOOD_DATA_DIR — mfds-nutrition.csv / hansik-800.xlsx 올린 뒤 ./deploy.sh 7)"
    return 0
  fi

  # 파일(영양·800선) + 레시피 API + 이 서버의 외식 어휘까지. --classify 는 chat 모델이 없으면
  # 조용히 건너뛰고, --backfill-nutrition 은 이름이 안 맞아 빈 행을 같은 계열에서 채운다.
  step "음식 카탈로그 적재"
  pnpm --filter friendly load:food-catalog --classify --backfill-nutrition

  # 이미 저장된 식단 항목 중 영양이 비어 있던 것을 채운다(기존 값은 건드리지 않는다).
  step "식단 기록 영양 스냅샷 채우기"
  pnpm --filter friendly backfill:meal-nutrition

  echo "  적재 후: $(food_status)"
}

case_1() {  # API만, DB 변경 없음
  pull; build_api; life_map_data; food_catalog_data; pm_reload
}

case_2() {  # API + DB 마이그레이션
  pull
  if ask_stop; then
    pm_stop; gen; migrate; life_map_data; food_catalog_data; build_api; pm_start
  else
    gen; migrate; life_map_data; food_catalog_data; build_api; pm_reload
  fi
}

case_3() {  # 웹만
  pull; build_web
  step "index.html OG 캐시 비우기"; pm2 reload friendly
}

case_4() {  # 웹 + API + DB (풀)
  pull
  if ask_stop; then
    pm_stop; gen; migrate; life_map_data; food_catalog_data; build_api; build_web; pm_start
  else
    gen; migrate; life_map_data; food_catalog_data; build_api; build_web; pm_reload
  fi
}

case_5() {  # .env만
  pm_reload
}

case_6() {  # 일상지도 데이터 적재/갱신 — CSV 를 data/open/ 에 올린 뒤 실행(코드 배포·재기동 없음)
  pull; gen; life_map_data 1
}

case_7() {  # 음식 카탈로그 적재/갱신 — 배포본을 data/open/food/ 에 올린 뒤 실행(코드 배포·재기동 없음)
  pull; gen; food_catalog_data 1
}

# ── 메뉴 ────────────────────────────────────────────────
choice="${1:-}"
if [[ -z "$choice" ]]; then
  cat <<'MENU'

배포 케이스를 선택하세요:
  1) API(friendly)만        — DB 스키마 변경 없음
  2) API + DB 마이그레이션
  3) 웹(apps/web)만
  4) 웹 + API + DB (풀 재배포)
  5) .env만
  6) 일상지도 데이터 적재/갱신 — data/open/ 의 CSV + 저장소 지오코딩 캐시
  7) 음식 카탈로그 적재/갱신   — data/open/food/ 의 배포본 + 레시피 API
MENU
  read -rp "번호 [1-7]: " choice
fi

case "$choice" in
  1) case_1 ;;
  2) case_2 ;;
  3) case_3 ;;
  4) case_4 ;;
  5) case_5 ;;
  6) case_6 ;;
  7) case_7 ;;
  *) echo "잘못된 선택: '$choice' (1-6)"; exit 1 ;;
esac

step "완료"
pm2 status
