// 여행로그 장소에 한국관광공사 관광정보(TourAPI, data.go.kr 15101578)의 운영 정보를 붙인다 — 카탈로그 → 맞추기 → 소개 정보.
// DATA_GO_KR_API_KEY 에 15101578 활용신청이 되어 있어야 한다(개발계정 일 1,000건 — 다 못 받으면 다음 날 다시 돌려 이어 받는다).
//
// 실행: pnpm --filter friendly sync:tour-kto [--max-calls=900] [--catalog=auto|force|skip] [--skip-intro] [--force-intro]
//                                            [--min-travelers=5] [--review=20] [--misses=N] [--closed=N] [--status]
//   --catalog      auto(기본): 유형마다 30일이 지났거나 없으면 받는다 · force: 전부 다시 · skip: 받지 않고 맞추기·소개 정보만
//   --skip-intro   소개 정보를 받지 않는다(카탈로그·맞추기까지만 — 맞춤 결과를 먼저 볼 때)
//   --force-intro  받은 소개 정보도 다시 받는다
//   --review=N     이름이 딱 맞지 않은 맞춤을 점수 낮은 순으로 N건 보여 준다(기준 검수용)
//   --misses=N     못 맞춘 장소를 방문 많은 순으로 N곳, 반경 안에서 이름이 가장 비슷한 콘텐츠와 같이 보여 준다(--misses-kind=식당 으로 유형 한정)
//   --closed=N     받은 쉬는 날 문구를 흔한 순으로 N개, 읽어 낸 쉬는 요일과 같이 보여 준다(parseKtoClosedDays 검수용)
//   --status       부르지 않고 지금 상태만
// API 가 떠 있어도 된다 — 끝나면 적재 이력이 남아 코스 프로필 캐시가 다음 요청부터 새로 만들어진다.
/* eslint-disable no-console */

import { PrismaClient } from '@prisma/client';
import { KTO_CONTENT_TYPE_LABEL } from '../src/modules/tour/kto-tour.adapter.js';
import { parseKtoClosedDays } from '../src/modules/tour/tour-kto-info.js';
import { getTourKtoStatus, listKtoNearMisses, syncTourKto, type TourKtoStatus } from '../src/modules/tour/tour-kto.service.js';

const args = process.argv.slice(2);
const opt = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const has = (name: string): boolean => args.includes(`--${name}`);
const n = (v: number): string => v.toLocaleString('ko-KR');
const prisma = new PrismaClient();

const printStatus = (s: TourKtoStatus): void => {
  const catalog = Object.entries(s.catalog)
    .map(([id, c]) => `${KTO_CONTENT_TYPE_LABEL[id] ?? id} ${n(c)}`)
    .join(' · ');
  console.log(`[카탈로그] ${catalog || '없음'}`);
  console.log(`[맞춤] 여행로그 장소 ${n(s.matchedPlaces)}곳 ↔ 콘텐츠 ${n(s.matchedContents)}개`);
  console.log(`[소개 정보] 받은 것 ${n(s.intros)}/${n(s.matchedContents)} — 이용 시간 ${n(s.withHours)} · 쉬는 날 ${n(s.withClosed)}(매주 쉬는 요일로 읽힌 것 ${n(s.weeklyClosed)})`);
};

const printReview = async (limit: number): Promise<void> => {
  if (limit <= 0) return;
  const rows = await prisma.tourPlaceKto.findMany({ where: { nameScore: { lt: 0.999 } }, orderBy: [{ nameScore: 'asc' }, { distM: 'desc' }], take: limit });
  if (rows.length === 0) return;
  const names = new Map((await prisma.tourPlace.findMany({ where: { id: { in: rows.map((r) => r.placeId) } }, select: { id: true, name: true, typeShort: true } })).map((p) => [p.id, p]));
  console.log(`\n[검수] 이름이 딱 맞지 않은 맞춤(점수 낮은 순 ${rows.length}건):`);
  for (const r of rows) {
    const p = names.get(r.placeId);
    console.log(`  ${r.nameScore.toFixed(2)} · ${String(r.distM).padStart(4)}m · ${p?.typeShort ?? '?'} ${p?.name ?? r.placeId} → ${r.title}`);
  }
};

const printMisses = async (limit: number): Promise<void> => {
  if (limit <= 0) return;
  const { unmatched, rows } = await listKtoNearMisses(prisma, { limit, kind: opt('misses-kind') ?? undefined, minTravelers: opt('min-travelers') ? Number(opt('min-travelers')) : undefined });
  console.log(`\n[검수] 못 맞춘 장소 ${n(unmatched)}곳 중 방문 많은 ${rows.length}곳 — 반경 안에서 이름이 가장 비슷한 콘텐츠:`);
  for (const r of rows) {
    console.log(`  ${r.kind} ${r.name}(${r.travelers}명) → ${r.best ? `${r.best.title} [${r.best.contentTypeId}] 이름 ${r.best.nameScore.toFixed(2)} · ${r.best.distM}m` : '반경 안에 콘텐츠 없음'}`);
  }
};

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];
const printClosed = async (limit: number): Promise<void> => {
  if (limit <= 0) return;
  const rows = await prisma.tourKtoIntro.findMany({ where: { closed: { not: null } }, select: { closed: true } });
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.closed!, (count.get(r.closed!) ?? 0) + 1);
  const tally = { weekly: 0, none: 0, unread: 0 };
  const label = (text: string): string => {
    const dows = parseKtoClosedDays(text);
    return dows === null ? '읽지 못함' : dows.length === 0 ? '매주 쉬는 요일 없음' : dows.map((d) => DOW_LABEL[d]).join('·');
  };
  for (const [text, c] of count) {
    const dows = parseKtoClosedDays(text);
    tally[dows === null ? 'unread' : dows.length === 0 ? 'none' : 'weekly'] += c;
  }
  console.log(`\n[검수] 쉬는 날 문구 ${n(rows.length)}건(서로 다른 문구 ${n(count.size)}개) — 요일을 읽음 ${n(tally.weekly)} · 매주 쉬는 요일 없음 ${n(tally.none)} · 읽지 못함 ${n(tally.unread)}`);
  for (const [text, c] of [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)) {
    console.log(`  ${String(c).padStart(4)}건 [${label(text)}] ${text.replace(/\n/g, ' / ')}`);
  }
};

const main = async (): Promise<void> => {
  console.log('\n=== 여행로그 장소 운영 정보(한국관광공사 관광정보) ===');
  if (has('status')) {
    printStatus(await getTourKtoStatus(prisma));
    await printReview(Number(opt('review') ?? 0));
    await printMisses(Number(opt('misses') ?? 0));
    await printClosed(Number(opt('closed') ?? 0));
    return;
  }
  const serviceKey = process.env.DATA_GO_KR_API_KEY ?? '';
  if (!serviceKey) {
    console.error('DATA_GO_KR_API_KEY 가 없습니다 — apps/friendly/.env 확인(15101578 활용신청 필요).');
    process.exitCode = 1;
    return;
  }
  const catalog = opt('catalog');
  const r = await syncTourKto(prisma, {
    serviceKey,
    maxCalls: Number(opt('max-calls') ?? 900),
    catalog: catalog === 'force' || catalog === 'skip' ? catalog : 'auto',
    skipIntro: has('skip-intro'),
    forceIntro: has('force-intro'),
    minTravelers: opt('min-travelers') ? Number(opt('min-travelers')) : undefined,
    onProgress: (msg) => console.log(`  ${msg} …`),
  });

  if (r.catalog) {
    const parts = Object.entries(r.catalog.byType).map(([id, t]) => `${KTO_CONTENT_TYPE_LABEL[id] ?? id} ${t.fetched !== null ? `${n(t.fetched)}건 받음` : t.skipped === 'fresh' ? '최근 것 그대로' : t.skipped === 'shrunk' ? '줄어 와서 그대로 둠' : '0건'}`);
    console.log(`\n[이번 카탈로그] ${parts.join(' · ') || '받지 못함'}`);
  }
  if (r.match) {
    const kinds = Object.entries(r.match.byKind)
      .sort((a, b) => b[1].places - a[1].places)
      .map(([kind, k]) => `${kind} ${n(k.matched)}/${n(k.places)}`);
    console.log(`[이번 맞추기] ${n(r.match.matched)}/${n(r.match.places)}곳${r.match.changed ? '' : ' (그대로)'} — ${kinds.join(' · ')}`);
  }
  if (r.intro) console.log(`[이번 소개 정보] 받을 것 ${n(r.intro.pending)} 중 ${n(r.intro.fetched)}건 받음${r.intro.failed > 0 ? ` · 실패 ${r.intro.failed}` : ''}`);
  console.log(`[호출] ${n(r.calls)}건`);
  printStatus(await getTourKtoStatus(prisma));
  await printReview(Number(opt('review') ?? 20));
  await printMisses(Number(opt('misses') ?? 0));
  await printClosed(Number(opt('closed') ?? 0));

  if (r.stopped !== 'done') {
    const why: Record<string, string> = {
      maxCalls: '호출 예산(--max-calls)이 다했습니다 — 다시 돌리면 이어 받습니다.',
      quota: '하루 한도를 다 썼습니다 — 내일 다시 돌리면 이어 받습니다.',
      auth: '키·권한 오류 — 활용신청 직후라면 게이트웨이 반영(수십 분~1시간)을 기다렸다가 다시.',
      error: '호출 오류로 멈췄습니다.',
    };
    console.log(`\n[중단] ${why[r.stopped]}${r.error ? `\n  ${r.error}` : ''}`);
  }
  if (r.stopped === 'auth' || r.stopped === 'error') process.exitCode = 1;
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
