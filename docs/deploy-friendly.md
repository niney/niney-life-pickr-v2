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

## 점검 명령

```bash
pm2 status
pm2 logs friendly --lines 50
ls apps/friendly/data/                      # prod.db, prod.db-wal, prod.db-shm 있으면 WAL 정상
curl -I https://<domain>/api/v1/health      # 헬스 라우트 있다면
```

## 주의

- **cluster 모드 금지** — SQLite 다중 프로세스 쓰기 시 `SQLITE_BUSY` 다발
- 빌드는 **서버에서 직접** — `sharp`, `@prisma/client` 같은 native 의존성이 OS별로 다름
- `.env` 변경 후 반드시 `pm2 reload friendly --update-env`
- Playwright 버전 올라가면 `playwright install chromium` 다시 실행
