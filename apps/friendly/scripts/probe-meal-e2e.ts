// 식단 전 구간 실동작 확인 — 실제 사진 + 실제 Ollama Cloud 로 업로드 → 인식 → 저장 → 통계 →
// 추천 → 피드백까지 app.inject() 로 태운다. DB 는 인자로 받은 사본을 쓴다(운영 DB 경합 방지).
//
// 실행: pnpm --filter friendly probe:meal-e2e -- <사진폴더>
//   운영 DB 를 건드리기 싫으면 사본을 가리킨다:
//     DATABASE_URL="file:/tmp/e2e.db" pnpm --filter friendly probe:meal-e2e -- <사진폴더>
//   (사본은 `cp apps/friendly/data/prod.db /tmp/e2e.db` — 카탈로그가 있어야 매칭까지 확인된다.)
//   주의: DB 는 사본으로 가도 **사진은 실제 저장 경로**(apps/friendly/data/meal-photos/e2e-meal-user)
//   에 쌓인다. 확인이 끝나면 그 폴더를 지운다.
//
// LLM 을 실제로 부르므로 일일 한도를 소비한다. 스키마 변경·프롬프트 변경 뒤 손으로 한 번 돌려
// "앱이 하는 일" 전체가 살아 있는지 보는 용도다(단위 테스트는 FakeProvider 를 쓴다).

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { buildApp } from '../src/app.js';

const DIR = process.argv[2]!;
const USER_ID = 'e2e-meal-user';

const main = async (): Promise<void> => {
  const app = await buildApp({ logger: false });
  await app.ready();

  await app.prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: 'e2e@meal.local', passwordHash: 'x', role: 'USER' },
  });
  const auth = { authorization: `Bearer ${app.jwt.sign({ userId: USER_ID, email: 'e2e@meal.local', role: 'USER' })}` };

  const files = (await readdir(DIR)).filter((f) => ['.jpg', '.jpeg', '.png'].includes(extname(f).toLowerCase())).sort();
  const targets = files.slice(0, 2);
  console.log(`사진 ${targets.length}장: ${targets.join(', ')}\n`);

  // ① 업로드 (multipart)
  const tokens: string[] = [];
  for (const file of targets) {
    const buf = await readFile(join(DIR, file));
    const boundary = '----e2e';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file}"\r\nContent-Type: image/jpeg\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/photos',
      headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([head, buf, tail]),
    });
    const body = res.json<{ token: string; byteSize: number; width: number }>();
    console.log(`① 업로드 ${file} → ${res.statusCode} token=${body.token.slice(0, 8)}… ${Math.round(body.byteSize / 1024)}KB ${body.width}px`);
    tokens.push(body.token);
  }

  // ② 인식 (실제 비전 LLM)
  const t0 = Date.now();
  const rec = await app.inject({
    method: 'POST',
    url: '/api/v1/meals/recognize',
    headers: auth,
    payload: { photoTokens: tokens, slot: 'dinner' },
  });
  console.log(`\n② 인식 → ${rec.statusCode} (${Date.now() - t0}ms)`);
  if (rec.statusCode !== 200) {
    console.log('   실패:', rec.body.slice(0, 300));
    await app.close();
    return;
  }
  const recognized = rec.json<{
    dishes: { name: string; matchedName: string | null; foodId: string | null; dishType: string | null; isMain: boolean; confidence: number; candidates: { name: string }[] }[];
    model: string;
    warning: string | null;
  }>();
  console.log(`   모델 ${recognized.model} · 음식 ${recognized.dishes.length}개 · 경고: ${recognized.warning ?? '-'}`);
  for (const d of recognized.dishes) {
    console.log(
      `   - ${d.name}${d.isMain ? '' : '(반찬)'} conf ${d.confidence} · 카탈로그 ${d.matchedName ?? '미매칭'}${d.dishType ? ` (${d.dishType})` : ''} · 후보 ${d.candidates.map((c) => c.name).join('/') || '-'}`,
    );
  }

  // ③ 저장
  const now = new Date();
  const save = await app.inject({
    method: 'POST',
    url: '/api/v1/meals',
    headers: auth,
    payload: {
      eatenAt: now.toISOString(),
      eatenDate: now.toISOString().slice(0, 10),
      slot: 'dinner',
      mealType: 'home',
      source: 'photo',
      items: recognized.dishes.map((d) => ({
        name: d.matchedName ?? d.name,
        foodId: d.foodId,
        dishType: d.dishType as never,
        isMain: d.isMain,
        confidence: d.confidence,
        source: 'recognized' as const,
      })),
      photoTokens: tokens,
      recognition: { model: recognized.model, version: 2, dishes: recognized.dishes },
    },
  });
  const entry = save.json<{ id: string; items: { name: string; dishType: string | null }[]; photos: unknown[] }>();
  console.log(`\n③ 저장 → ${save.statusCode} id=${entry.id.slice(0, 8)}… 항목 ${entry.items.length} 사진 ${entry.photos.length}`);

  // ④ 목록·통계
  const list = await app.inject({ method: 'GET', url: '/api/v1/meals?limit=5', headers: auth });
  const stats = await app.inject({
    method: 'GET',
    url: `/api/v1/meals/stats?from=${now.toISOString().slice(0, 10)}&to=${now.toISOString().slice(0, 10)}`,
    headers: auth,
  });
  const st = stats.json<{ entryCount: number; itemCount: number; byDishType: { label: string; count: number }[] }>();
  console.log(
    `\n④ 목록 ${list.statusCode} (${list.json<{ items: unknown[] }>().items.length}건) · 통계 ${stats.statusCode}: ${st.entryCount}끼/${st.itemCount}항목 · ${st.byDishType.map((b) => `${b.label} ${b.count}`).join(', ')}`,
  );

  // ⑤ 추천 (실제 텍스트 LLM)
  const t1 = Date.now();
  const reco = await app.inject({
    method: 'POST',
    url: '/api/v1/meals/recommendations',
    headers: auth,
    payload: { targetDate: now.toISOString().slice(0, 10), targetSlot: 'lunch', mealType: 'dining_out', force: false },
  });
  console.log(`\n⑤ 추천 → ${reco.statusCode} (${Date.now() - t1}ms)`);
  if (reco.statusCode === 200) {
    const r = reco.json<{
      id: string;
      status: string;
      model: string | null;
      summary: string;
      notice: string | null;
      items: { name: string; reason: string; tags: string[]; score: number; lastEatenDate: string | null }[];
    }>();
    console.log(`   ${r.status} · 모델 ${r.model ?? '-'} · "${r.summary}"${r.notice ? ` · ${r.notice}` : ''}`);
    for (const it of r.items) {
      console.log(`   - ${it.name} (score ${it.score}${it.tags.length ? `, ${it.tags.join('/')}` : ''}) — ${it.reason}`);
    }

    // ⑥ 캐시 재요청 + 피드백
    const t2 = Date.now();
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/meals/recommendations',
      headers: auth,
      payload: { targetDate: now.toISOString().slice(0, 10), targetSlot: 'lunch', mealType: 'dining_out', force: false },
    });
    const cachedSame = again.json<{ id: string }>().id === r.id;
    console.log(`\n⑥ 캐시 재요청 → ${again.statusCode} (${Date.now() - t2}ms) 같은 추천 재사용: ${cachedSame}`);

    const fb = await app.inject({
      method: 'POST',
      url: `/api/v1/meals/recommendations/${r.id}/feedback`,
      headers: auth,
      payload: { rating: 1, pickedName: r.items[0]?.name ?? null },
    });
    console.log(`   피드백 → ${fb.statusCode} ${JSON.stringify(fb.json<{ feedback: unknown }>().feedback)}`);
  } else {
    console.log('   실패:', reco.body.slice(0, 300));
  }

  await app.close();
};

void main();
