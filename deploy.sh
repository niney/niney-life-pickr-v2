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
#
# 마이그레이션이 포함된 케이스(2,4)는 "서버 중단 여부"를 물어본다.
#   - 추가형 마이그레이션(ADD COLUMN 등) → 중단 불필요(N)
#   - 파괴적 마이그레이션(DROP/NOT NULL/타입변경) → 중단 권장(y)

set -euo pipefail

ROOT="/home/samplepcb/niney-life-pickr-v2"
WEB_DIST="$ROOT/apps/web/dist"

cd "$ROOT"

# ── 헬퍼 ────────────────────────────────────────────────
step()       { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
pull()       { step "코드 받기";            git pull --ff-only; pnpm install --frozen-lockfile; }
gen()        { step "prisma generate";      pnpm --filter friendly db:generate; }
migrate()    { step "prisma migrate deploy"; pnpm --filter friendly exec prisma migrate deploy; }
build_api()  { step "friendly 빌드";        pnpm --filter friendly build; }
build_web()  { step "web 빌드";             pnpm --filter web build; chmod -R o+rX "$WEB_DIST"; }
pm_stop()    { step "서버 중단";            pm2 stop friendly; }
pm_start()   { step "서버 기동";            pm2 start friendly --update-env; pm2 save; }
pm_reload()  { step "서버 reload";          pm2 reload friendly --update-env; pm2 save; }

ask_stop() {
  # 마이그레이션 전 서버 중단 여부 (기본 N = 무중단)
  read -rp $'\n파괴적 마이그레이션인가요? 서버를 중단하고 진행할까요? [y/N] ' a
  [[ "${a:-N}" == "y" || "${a:-N}" == "Y" ]]
}

# ── 케이스 실행 ─────────────────────────────────────────
case_1() {  # API만, DB 변경 없음
  pull; build_api; pm_reload
}

case_2() {  # API + DB 마이그레이션
  pull
  if ask_stop; then
    pm_stop; gen; migrate; build_api; pm_start
  else
    gen; migrate; build_api; pm_reload
  fi
}

case_3() {  # 웹만
  pull; build_web
  step "index.html OG 캐시 비우기"; pm2 reload friendly
}

case_4() {  # 웹 + API + DB (풀)
  pull
  if ask_stop; then
    pm_stop; gen; migrate; build_api; build_web; pm_start
  else
    gen; migrate; build_api; build_web; pm_reload
  fi
}

case_5() {  # .env만
  pm_reload
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
MENU
  read -rp "번호 [1-5]: " choice
fi

case "$choice" in
  1) case_1 ;;
  2) case_2 ;;
  3) case_3 ;;
  4) case_4 ;;
  5) case_5 ;;
  *) echo "잘못된 선택: '$choice' (1-5)"; exit 1 ;;
esac

step "완료"
pm2 status
