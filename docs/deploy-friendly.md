# friendly 배포 가이드

Fastify + Prisma + SQLite 백엔드 (`apps/friendly`) 를 단독 Linux 서버에 pm2로 띄우는 절차.

## 사전 준비 (최초 1회)

```bash
# Node 20+, pnpm, pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
npm i -g pnpm pm2

# 앱 클론
sudo mkdir -p /home/samplepcb/niney-life-pickr-v2 && sudo chown $USER:$USER /home/samplepcb/niney-life-pickr-v2
cd /home/samplepcb/niney-life-pickr-v2
git clone <repo-url> .

# Playwright 브라우저 바이너리
pnpm install --frozen-lockfile
pnpm --filter friendly exec playwright install --with-deps chromium
```

## 환경 변수

`apps/friendly/.env` (git 제외, 서버에서 직접 작성):

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=file:./data/prod.db
JWT_SECRET=<openssl rand -base64 64 결과>
# 그 외 LLM/지도 API 키 등
```

## 빌드 & 마이그레이션

```bash
pnpm --filter friendly db:generate
pnpm --filter friendly exec prisma migrate deploy
pnpm --filter friendly build
```

`prisma migrate dev` 는 개발용. 운영은 반드시 `migrate deploy`.

## 대중교통 정적 데이터 적재 (최초 1회 + 필요 시 갱신)

`SEOUL_OPEN_API_KEY`(열린데이터광장 일반 인증키) 필요 — 미적재면 해당 API 가 503 안내를 낸다.

```bash
pnpm --filter friendly load:bus-stations       # 버스 정류소 마스터 (주변 정류장 찾기)
pnpm --filter friendly load:subway-stations    # 지하철 역사 마스터
pnpm --filter friendly load:subway-line-orders # 지하철 노선 순서
pnpm --filter friendly load:subway-congestion  # 지하철 혼잡도(정적)
```

정류소·역사는 사실상 정적이라 분기~반기 1회 재실행이면 충분하다.

## 음식 카탈로그 적재 (식단 관리 — 최초 1회 + 필요 시 갱신)

**카탈로그가 비면 오류 없이 조용히 반쪽이 된다** — 자동완성이 안 뜨고, 영양이 안 붙고, 추천 후보가
사용자 본인 기록으로만 좁아진다. 그래서 `deploy.sh` 가 API 배포(1·2·4)마다 종수를 점검하고,
비어 있으면 배포본이 있을 때 자동으로 적재한다.

배포본 2개를 서버에 올려 둔다(리포에 없다 — 출처는 [data-sources.md](data-sources.md)).

```bash
scp data/open/food/{mfds-nutrition.csv,hansik-800.xlsx} 서버:/home/samplepcb/niney-life-pickr-v2/data/open/food/
```

```bash
./deploy.sh 7                                  # 배포본 + 레시피 API + 이 서버의 외식 어휘 재적재
pnpm --filter friendly status:food-catalog     # ok items=N classified=C nutrition=U meals=M
```

- 영양성분은 **파일이 기본**이고 `DATA_GO_KR_API_KEY`(data.go.kr 15100070)는 선택이다 — 같은 데이터를
  쿼터 써 가며 받을 뿐이다. 레시피만 `FOOD_RECIPE_API_KEY`(식품안전나라)가 필요하다.
- `--classify` 단계는 chat 모델이 설정돼 있을 때만 돈다(없으면 조용히 건너뛴다).
- 외식 어휘는 **그 서버의 식당·리뷰 데이터**에서 나오므로 서버마다 종수가 다르다. 정상이다.

## pm2 기동

루트의 `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: 'friendly',
      cwd: './apps/friendly',
      script: 'dist/server.js',
      node_args: '--env-file=.env',
      instances: 1,            // SQLite 라 단일 인스턴스 고정
      exec_mode: 'fork',       // cluster 금지 (SQLite 락 충돌)
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      out_file: '/var/log/niney/out.log',
      error_file: '/var/log/niney/err.log',
      time: true,
    },
  ],
};
```

```bash
sudo mkdir -p /var/log/niney && sudo chown $USER:$USER /var/log/niney
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup     # 출력된 sudo 명령 실행 → 부팅 자동 기동
```

## Nginx + HTTPS

같은 도메인에서 웹/API 모두 서비스 (`ninelife.kr` 예시).
설정 파일: `/etc/nginx/sites-available/niney_life_pickr_v2_projects` → `sites-enabled` 에 심볼릭 링크.

```bash
chmod o+x /home/samplepcb /home/samplepcb/niney-life-pickr-v2
chmod -R o+rX /home/samplepcb/niney-life-pickr-v2/apps/web/dist
sudo certbot --nginx -d ninelife.kr
```

`location /api/` 의 `proxy_pass` 끝 슬래시 **없이** 작성 — 백엔드 라우트가 `/api/` prefix 포함이라 prefix 보존해야 함.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;   # 끝 슬래시 X
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_buffering off;
}
```

### 정산 공유 링크 OG 미리보기 (SSR-lite)

웹은 순수 SPA 라 카카오톡·텔레그램 크롤러(JS 미실행)가 공유 링크를 긁으면 OG
태그가 비어 미리보기가 안 뜬다. 공유 경로만 Fastify 로 보내 `index.html` 의
`<head>` 에 OG 메타(식당명·총액·인원수)를 주입해 내려준다.

**반드시 `^~` 를 붙인다.** 정산 카드 이미지 라우트는 `/share/settlements/<token>/
image.png` 처럼 `.png` 로 끝나는데, nginx 는 **정규식 location 이 일반 prefix 보다
우선**한다. 정적 캐싱용 `location ~* \.(png|...)$` 가 있으면 이 이미지 요청을
가로채 `root`(web/dist)에서 파일을 찾다 없으니 404 가 된다(개발은 Vite proxy 라
정상 → "dev OK / prod 404" 의 전형 원인). `^~` 는 "이 prefix 가 최장 매칭이면
정규식 검사를 건너뛴다"는 의미라, prefix 가 `.png` 정규식을 이긴다.

```nginx
# 정식 공유 경로 + 별칭(/s/). 끝 슬래시 X — Fastify 가 경로 그대로 받는다.
# ^~ 필수: /share/settlements/<token>/image.png 가 .png 정규식 location 에
# 가로채이지 않도록 prefix 우선권을 준다.
location ^~ /share/settlements/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;   # Cloudflare 실제 방문자 IP
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;            # Flexible SSL: 공개는 항상 https
}
location ^~ /s/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
# 타로 공유 링크(/tarot/s/<token>) OG + 공유 이미지(/tarot/s/<token>/image.png?format=og|story).
# 이미지가 .png 라 정산과 같은 이유로 ^~ 필수. 없으면 SPA 는 동작하고 OG·이미지만 404.
location ^~ /tarot/s/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
# 타로 카드 이미지(apps/web/dist/tarot/cards/*.webp) — 아래 1년 immutable 규칙엔 webp 가 없다.
# 카드를 같은 파일명으로 다시 생성해 교체할 수 있어 7일 캐시. 없는 카드는 index.html 폴백 대신
# 진짜 404 로 떨어져야 웹이 대체 카드(이름 박스)를 그린다.
location ^~ /tarot/cards/ {
    expires 7d;
    add_header Cache-Control "public, max-age=604800";
    try_files $uri =404;
}
```

### SPA 폴백과 `/tarot` 디렉터리 충돌 (필수)

웹 dist 에 `tarot/cards/` 가 생기면서 `/tarot` 가 **실제 디렉터리**가 됐다. SPA 폴백이
`try_files $uri $uri/ /index.html;` 이면 `/tarot` 요청이 `$uri/`(디렉터리)에 먼저 걸려
`301 → /tarot/` 로 보내고, 거기엔 index 가 없어 **403** 이 난다(2026-09-05 운영 실측 —
직접 진입·새로고침만 깨지고 SPA 내부 이동은 멀쩡해서 눈에 늦게 띈다). SPA 는 디렉터리
인덱스가 필요 없으니 `$uri/` 를 뺀다.

```nginx
location / {
    try_files $uri /index.html;
}
```

덧붙여 nginx 가 만드는 301 이 `http://ninelife.kr/...` 절대 주소로 나가고 있다(TLS 종료
뒤라 스킴이 http 로 보임 → 다시 https 로 한 번 더 튐). server 블록에 `absolute_redirect off;`
를 두면 상대 경로로 나간다.

```nginx
# 그룹 투표 공유 링크(/vote/<token>) OG — friendly 가 head 메타를 주입한다.
# 이 규칙이 없어도 nginx 가 정적 index.html 을 서빙해 SPA(투표)는 정상 동작하고
# 카카오톡 등 미리보기(OG)만 빠진다. PNG 라우트는 없어 정규식 충돌 걱정은 없지만
# 관례대로 ^~ 유지.
location ^~ /vote/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $http_cf_connecting_ip;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
}
```

- **Cloudflare 캐시**: `.png` 라 Cloudflare 가 엣지 캐시한다 — 잘못된 404 가 한 번
  캐시되면 nginx 를 고쳐도 한동안(관측상 max-age 14400s ≈ 4h) 404 가 보인다. nginx
  수정 후 Cloudflare 에서 해당 URL 을 **Purge** 해야 즉시 반영된다. 성공 응답은
  origin `cache-control: public, max-age=300` 을 따라 5분 엣지 캐시(편집 시 최대
  5분 지연 — OG 는 어차피 카카오가 더 길게 캐시).

- friendly 가 빌드된 웹 `index.html` 을 읽어 주입한다. 기본 경로는 산출물 기준
  자동 탐색(`apps/web/dist/index.html`). 위치가 다르면 `.env` 에 `WEB_INDEX_PATH`.
- **정산표 이미지(동적 og:image)**: 살아있는 공유 링크의 `og:image` 는
  `/share/settlements/<token>/image.png`(별칭 `/s/<token>/image.png`) 로 — friendly
  가 satori+resvg 로 정산표 매트릭스(행=참여자, 열=차수·카테고리·소계·총계) PNG 를
  즉석 렌더한다. 화면의 SettlementBreakdownTable 과 동일한 표다. 링크만 붙여도
  카카오톡 미리보기에 정산표가 뜨고, 웹/앱 공유 시트의 "정산표 이미지로 공유"
  버튼도 같은 라우트를 쓴다. 만료/없는 토큰이면 404 → 크롤러는 아래 기본
  이미지로 폴백. nginx 의 `location /share/settlements/`·`/s/` prefix 가 그대로
  커버하므로 추가 설정 불필요.
  - 한글 렌더용 폰트 `apps/friendly/assets/fonts/IBMPlexSansKR-{Regular,Bold}.ttf`
    가 레포에 포함(커밋됨) — git pull 만으로 배포된다. 별도 설치 불필요.
  - 카드에는 참가자 이름이 들어간다. 공유 페이지를 열면 어차피 같은 명단이
    보이고 링크는 ≤30일 만료라 노출 범위는 동일. 더 보수적으로 가려면
    share-preview 의 og.image 를 `OG_IMAGE_PATH` 기본 이미지로 되돌리면 된다.
- OG 기본 이미지(폴백)는 `apps/web/public/og-default.png` → 빌드 시 `dist/og-default.png`
  → `https://ninelife.kr/og-default.png`. 현재는 앱 아이콘 임시본 — 정식 배너
  (1200×630 권장)로 교체 권장. 경로 변경은 `OG_IMAGE_PATH`.
- **카카오 캐시**: 한 번 긁으면 며칠 캐시. 수정 후 갱신은 카카오 OG 캐시 초기화
  도구(`developers.kakao.com/tool/clear/og`). 텔레그램은 `@WebpageBot`.
- `index.html` 은 프로세스 메모리에 1회 캐시되므로 재배포 후 `pm2 reload friendly`
  필수(reload 시 캐시도 비워짐).

## 재배포 (매번)

```bash
cd /home/samplepcb/niney-life-pickr-v2
git pull --ff-only
pnpm install --frozen-lockfile
pnpm --filter friendly db:generate
pnpm --filter friendly exec prisma migrate deploy
pnpm --filter friendly build
pm2 reload friendly --update-env
pm2 save
```

## SQLite 백업

```bash
# crontab -e
0 4 * * * sqlite3 /home/samplepcb/niney-life-pickr-v2/apps/friendly/data/prod.db ".backup '/var/backups/niney/prod-$(date +\%F).db'"
```

## 사용자 업로드 파일 (식단 사진·영수증)

`apps/friendly/data/` 아래에 사용자 업로드가 쌓인다 — DB 백업만으로는 복구되지 않으니 같이 챙긴다.

| 경로 | 내용 | 정리 |
|---|---|---|
| `data/meal-photos/<userId>/<token>.jpg` (+`_t.jpg` 썸네일) | 식단 사진(원본 1600px/썸네일 320px) | 기록 삭제 시 unlink, 기록에 안 붙은 업로드는 **매일 04:30 자동 정리**(24h TTL) |
| `data/receipts/<token>.jpg` | 정산 영수증 | 자동 정리 없음(누적) |
| `data/meal-recognition-debug/`, `data/extraction-debug/` | 인식 측정 덤프 | `MEAL_RECOGNITION_DEBUG=1` / `EXTRACTION_DEBUG=1` 일 때만 생성 — 운영에선 끈 채로 둔다 |

```bash
# 사진까지 포함한 주간 백업 예시
0 5 * * 0 tar czf /var/backups/niney/meal-photos-$(date +\%F).tgz -C /home/samplepcb/niney-life-pickr-v2/apps/friendly/data meal-photos
du -sh apps/friendly/data/*                 # 디스크 사용량 점검
```

## 점검 명령

```bash
pm2 status
pm2 logs friendly --lines 50
ls apps/friendly/data/                      # prod.db, prod.db-wal, prod.db-shm 있으면 WAL 정상
curl -I https://<domain>/api/v1/health      # 헬스 라우트 있다면
```

## 리뷰 군집화 (Python 배치 계산기)

리뷰 군집화(분석 탭 "리뷰 주제")는 저장된 임베딩을 **Python**(UMAP→HDBSCAN→c-TF-IDF)으로
계산한다. Node 단일 인스턴스라 호스트에 python3 + 패키지가 필요(임베딩 endpoint 요구와 동급).
**미설치여도 서버는 정상** — 군집화만 graceful skip 되고 분석 탭 섹션이 안 뜰 뿐. 연구·알고리즘
배경은 `apps/friendly/research/review-clustering/README.md`.

### 최초 1회 설치

```bash
# python3 (대부분 기본 설치). venv 권장 — base 오염 방지.
python3 -m venv /home/samplepcb/cluster-venv
/home/samplepcb/cluster-venv/bin/pip install -r apps/friendly/scripts/requirements-cluster.txt
# 의존성: numpy, scikit-learn, umap-learn, hdbscan (torch 불필요 — bertopic 패키지 안 씀)
```

`.env` 에 venv 의 python 경로 지정(미지정 시 PATH 의 `python3`):

```env
CLUSTER_PYTHON_BIN=/home/samplepcb/cluster-venv/bin/python
# 자동 군집화(요약 종료 훅) on/off. 기본 on.
CLUSTER_AUTO_ENABLED=true
# (선택) 자동 재군집 게이트·파라미터 — 기본값으로 충분.
# CLUSTER_GATE_PCT=0.2   CLUSTER_GATE_MIN=20   CLUSTER_MIN_SIZE=8   CLUSTER_ASPECT_WEIGHT=0.5
```

### 검증 (배포 후)

```bash
pnpm --filter friendly probe:cluster-health   # numpy/sklearn/umap/hdbscan 도달 확인
```

### 운영 흐름

- **스키마**: 군집 테이블은 일반 마이그레이션에 포함 — 재배포의 `migrate deploy` 가 처리(별도 작업 없음).
- **임베딩 선행**: 군집화는 enrich(임베딩)된 리뷰가 있어야 한다 — review-search 의 임베딩 endpoint 설정이
  먼저 되어 있어야 함(해당 README 참고).
- **자동**: 새로 크롤·요약된 식당은 요약 종료 후 **조건부 자동 군집화**(첫 군집이거나 리뷰가 충분히 늘었을 때만).
- **수동 백필**: 기존 식당은 어드민 `/admin/review-search` 하단 **"식당별 군집 상태"** 에서 enrich 후
  식당별 "군집화" / "미군집 일괄" 로 채운다.

## 주의

- **cluster 모드 금지** — SQLite 다중 프로세스 쓰기 시 `SQLITE_BUSY` 다발 (PM2 cluster 모드 — 리뷰 군집화와 무관)
- 빌드는 **서버에서 직접** — `sharp`, `@prisma/client` 같은 native 의존성이 OS별로 다름
- `.env` 변경 후 반드시 `pm2 reload friendly --update-env`
- Playwright 버전 올라가면 `playwright install chromium` 다시 실행
- 리뷰 군집화는 python3 + 패키지 필요(위 섹션) — 미설치 시 군집만 skip(서버는 정상)
