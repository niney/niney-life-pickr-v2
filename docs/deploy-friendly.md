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

같은 도메인에서 웹/API 모두 서비스 (`nlpp.easypcb.co.kr` 예시).
설정 파일: `/etc/nginx/sites-available/niney_life_pickr_v2_projects` → `sites-enabled` 에 심볼릭 링크.

```bash
chmod o+x /home/samplepcb /home/samplepcb/niney-life-pickr-v2
chmod -R o+rX /home/samplepcb/niney-life-pickr-v2/apps/web/dist
sudo certbot --nginx -d nlpp.easypcb.co.kr
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
