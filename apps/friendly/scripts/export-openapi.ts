// 외부용 API 문서 추출 — 실제 앱을 띄워(listen 없음) @fastify/swagger 스펙을 받아 어드민을 빼고
// docs/api/ 에 쓴다. 다른 프로젝트가 이 파일들을 참고/코드 생성에 쓴다(가이드: docs/api/README.md).
//   - docs/api/openapi.json : OpenAPI 3 (공개 + 로그인 라우트, 어드민·HTML 미리보기 제외)
//   - docs/api/endpoints.md : 태그별 엔드포인트 색인(메서드·경로·인증·레이트리밋·입력)
// 라우트·스키마를 바꾸면 다시 돌린다:  pnpm --filter friendly export:openapi
// 인증 수준(x-auth)·레이트리밋(x-rate-limit)은 plugins/swagger.ts 의 transform 이 싣는다.
/* eslint-disable no-console */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/api');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type Param = { name: string; in: string; required?: boolean };
type Operation = {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Param[];
  requestBody?: unknown;
  'x-auth'?: 'public' | 'optional' | 'user' | 'admin';
  'x-rate-limit'?: { max: number | 'dynamic'; timeWindow: string };
};
type Spec = {
  openapi: string;
  info: Record<string, unknown>;
  servers?: unknown[];
  tags?: unknown[];
  paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  components?: unknown;
};

const app = await buildApp({ logger: false });
await app.ready();
const full = app.swagger() as unknown as Spec;
await app.close();

// 공개 API 만 — /api/v1 밖(공유 미리보기 HTML·robots·sitemap·well-known)과 어드민 제외.
const paths: Spec['paths'] = {};
for (const url of Object.keys(full.paths).sort()) {
  if (!url.startsWith('/api/v1/')) continue;
  const ops: Spec['paths'][string] = {};
  for (const m of METHODS) {
    const op = full.paths[url]?.[m];
    if (op && op['x-auth'] !== 'admin') ops[m] = op;
  }
  if (Object.keys(ops).length) paths[url] = ops;
}

const origin = env.PUBLIC_ORIGIN.replace(/\/+$/, '');
const spec: Spec = {
  openapi: full.openapi,
  info: {
    title: 'Life Pickr API',
    version: String(full.info.version ?? '0.0.1'),
    description:
      '공개 + 로그인 사용자 API(어드민 제외). 인증·CORS·레이트리밋·에러 형식은 docs/api/README.md. ' +
      'x-auth: public | optional(Bearer 있으면 회원 혜택) | user(Bearer 필수). x-rate-limit: 라우트별 한도(없으면 IP당 분당 1000).',
  },
  servers: [{ url: origin }],
  paths,
  components: full.components,
};

// ── endpoints.md ─────────────────────────────────────────────────────────────
const windowLabel = (w: string): string =>
  ({ '1 minute': '분', '1 hour': '시간', '1 day': '일' })[w] ?? w;
const rateLabel = (rl: Operation['x-rate-limit']): string =>
  rl ? `${rl.max === 'dynamic' ? '설정값' : rl.max}/${windowLabel(rl.timeWindow)}` : '';
const inputLabel = (op: Operation): string => {
  const params = (op.parameters ?? []).filter((p) => p.in === 'query' || p.in === 'header');
  const parts = params.map((p) => `${p.in === 'header' ? 'header ' : ''}\`${p.name}\`${p.required ? '*' : ''}`);
  if (op.requestBody) parts.push('body');
  return parts.join(', ');
};
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const authKey = (op: Operation): keyof typeof AUTH_LABEL =>
  op['x-auth'] === 'user' || op['x-auth'] === 'optional' ? op['x-auth'] : 'public';

const byTag = new Map<string, Array<{ method: string; url: string; op: Operation }>>();
let total = 0;
const AUTH_LABEL = { public: '공개', optional: '선택', user: '로그인' } as const;
const authCount = { public: 0, optional: 0, user: 0 };
for (const [url, ops] of Object.entries(paths)) {
  for (const m of METHODS) {
    const op = ops[m];
    if (!op) continue;
    total++;
    authCount[authKey(op)]++;
    const tag = op.tags?.[0] ?? '(untagged)';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag)!.push({ method: m.toUpperCase(), url, op });
  }
}

const lines: string[] = [
  '# Life Pickr API 엔드포인트 색인',
  '',
  '> **자동 생성 — 직접 수정하지 말 것.** `pnpm --filter friendly export:openapi` 로 다시 만든다.',
  '> 인증·CORS·에러·한도 설명은 [README.md](README.md), 스키마 전체는 [openapi.json](openapi.json).',
  '',
  `- 기준 URL: \`${origin}\` (경로에 \`/api/v1\` 포함)`,
  `- 엔드포인트 ${total}개 — 공개 ${authCount.public} · 선택 인증 ${authCount.optional} · 로그인 ${authCount.user}. 어드민(\`/api/v1/admin/**\`)은 제외.`,
  '- 인증: `공개` = 토큰 불필요, `선택` = 토큰 없이도 되고 있으면 회원으로 처리(한도·자동 저장 등), `로그인` = `Authorization: Bearer <token>` 필수.',
  '- 한도: 라우트별 IP당 요청 수. 빈 칸은 전역 백스톱(IP당 분당 1000). `설정값` = 어드민 설정(usage-quota)에서 결정.',
  '- 입력: 쿼리 파라미터(`*` 필수), `header` = 요청 헤더, `body` = JSON 본문. 경로 파라미터는 경로에 `:name` 형태로 표시.',
  '',
];
for (const tag of [...byTag.keys()].sort()) {
  const rows = byTag.get(tag)!;
  lines.push(`## ${tag}`, '', '| 메서드 | 경로 | 인증 | 한도 | 입력 | 설명 |', '|---|---|---|---|---|---|');
  for (const { method, url, op } of rows) {
    const path = url.replace(/\{(\w+)\}/g, ':$1');
    const desc = op.summary ?? op.description ?? '';
    lines.push(
      `| ${method} | \`${path}\` | ${AUTH_LABEL[authKey(op)]} | ${rateLabel(op['x-rate-limit'])} | ${cell(inputLabel(op))} | ${cell(desc)} |`,
    );
  }
  lines.push('');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'openapi.json'), `${JSON.stringify(spec, null, 2)}\n`);
writeFileSync(join(OUT_DIR, 'endpoints.md'), lines.join('\n'));
console.log(`docs/api — ${total}개 엔드포인트(공개 ${authCount.public}, 선택 ${authCount.optional}, 로그인 ${authCount.user}), 태그 ${byTag.size}개`);
process.exit(0);
