// 시간대별 혼잡도 적재(10차) — odcloud 파일데이터 API(서울교통공사 1~8호선,
// 분기 갱신)를 전량 받아 SubwayCongestion 에 wide→slots JSON 으로 적재한다.
//
// 실행: pnpm --filter friendly load:subway-congestion [--dry-run]
//   --dry-run: 조회 + 리포트만(DB 미변경).
//
// serviceKey 는 DATA_GO_KR_API_KEY(data.go.kr) — 15071311 활용신청 완료. 버스 어댑터의
// toServiceKeyPart 규율(Encoding 키 raw 직결) 재사용. 조인: 역번호 4자리
// zero-pad ↔ 우리 stationCd 1차, 역명(괄호 제거) + lineId 2차.

import { PrismaClient } from '@prisma/client';
import { subwayLineName } from '@repo/utils';
import { toServiceKeyPart } from '../src/modules/bus/bus-api.adapter.js';
import {
  normalizeCongestionRow,
  type NormalizedCongestion,
} from '../src/modules/subway/subway-congestion.service.js';

const DRY_RUN = process.argv.includes('--dry-run');
const UDDI = 'uddi:93f3aca2-a46a-4e30-b797-aa1870dbfa2a';
const PER_PAGE = 2000;

const prisma = new PrismaClient();

const stripParen = (n: string): string => n.replace(/\([^)]*\)/g, '').trim();

// odcloud 전량 조회(totalCount 로 페이징). 키는 로깅 금지.
const fetchAll = async (apiKey: string): Promise<Record<string, unknown>[]> => {
  const keyPart = toServiceKeyPart(apiKey);
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let total = Infinity;
  while (rows.length < total) {
    const url = `https://api.odcloud.kr/api/15071311/v1/${UDDI}?page=${page}&perPage=${PER_PAGE}&serviceKey=${keyPart}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`odcloud 응답 ${res.status}`);
    const json = (await res.json()) as { totalCount?: number; data?: Record<string, unknown>[] };
    total = json.totalCount ?? 0;
    const data = json.data ?? [];
    rows.push(...data);
    if (data.length === 0) break;
    page += 1;
  }
  return rows;
};

const main = async (): Promise<void> => {
  const apiKey = process.env.DATA_GO_KR_API_KEY ?? '';
  if (!apiKey) {
    console.error('DATA_GO_KR_API_KEY(data.go.kr)가 비어 있습니다.');
    process.exitCode = 1;
    return;
  }
  console.log(`\n=== 혼잡도 적재 ${DRY_RUN ? '(--dry-run)' : ''} ===\n`);

  const raw = await fetchAll(apiKey);
  console.log(`odcloud 수신: ${raw.length}행`);

  // 조인 인덱스.
  const stations = await prisma.subwayStation.findMany({
    select: { id: true, lineId: true, name: true, realtimeName: true, stationCd: true },
  });
  const byCd = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const s of stations) {
    if (s.stationCd) byCd.set(`${s.lineId}|${s.stationCd}`, s.id);
    byName.set(`${s.lineId}|${s.name}`, s.id);
    byName.set(`${s.lineId}|${stripParen(s.name)}`, s.id);
    if (s.realtimeName) byName.set(`${s.lineId}|${s.realtimeName}`, s.id);
  }
  const resolveStationId = (n: NormalizedCongestion): string | null =>
    byCd.get(`${n.lineId}|${n.stationCd}`) ??
    byName.get(`${n.lineId}|${n.stationName}`) ??
    byName.get(`${n.lineId}|${stripParen(n.stationName)}`) ??
    null;

  // 정규화 + 조인.
  const seen = new Set<string>(); // (lineId, stationName, dayType, updn) 유니크
  const insertRows: {
    stationId: string | null;
    lineId: string;
    stationName: string;
    dayType: string;
    updn: string;
    slots: string;
  }[] = [];
  const lineDist = new Map<string, number>();
  const dayDist = new Map<string, number>();
  const updnDist = new Map<string, number>();
  const stationKeys = new Set<string>(); // 역 단위(조인율 계산)
  let cdHit = 0;
  let nameHit = 0;
  const unmatched = new Set<string>();
  let dropped = 0;
  let minLevel = Infinity;
  let maxLevel = -Infinity;
  let nullSlots = 0;

  for (const row of raw) {
    const n = normalizeCongestionRow(row);
    if (!n) {
      dropped += 1;
      continue;
    }
    const key = `${n.lineId}|${n.stationName}|${n.dayType}|${n.updn}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const stationId = resolveStationId(n);
    // 역 단위 조인율(dayType/updn 중복 제외).
    const sKey = `${n.lineId}|${n.stationName}`;
    if (!stationKeys.has(sKey)) {
      stationKeys.add(sKey);
      if (byCd.has(`${n.lineId}|${n.stationCd}`)) cdHit += 1;
      else if (stationId) nameHit += 1;
      else unmatched.add(`${subwayLineName(n.lineId)} ${n.stationName}(${n.stationCd})`);
    }

    lineDist.set(n.lineId, (lineDist.get(n.lineId) ?? 0) + 1);
    dayDist.set(n.dayType, (dayDist.get(n.dayType) ?? 0) + 1);
    updnDist.set(n.updn, (updnDist.get(n.updn) ?? 0) + 1);
    for (const s of n.slots) {
      if (s.level === null) nullSlots += 1;
      else {
        minLevel = Math.min(minLevel, s.level);
        maxLevel = Math.max(maxLevel, s.level);
      }
    }

    insertRows.push({
      stationId,
      lineId: n.lineId,
      stationName: n.stationName,
      dayType: n.dayType,
      updn: n.updn,
      slots: JSON.stringify(n.slots),
    });
  }

  console.log('\n[분포]');
  console.log('  호선:', [...lineDist.entries()].sort().map(([l, c]) => `${subwayLineName(l)}:${c}`).join(' '));
  console.log('  요일구분:', [...dayDist.entries()].sort().map(([d, c]) => `${d}:${c}`).join(' '));
  console.log('  상하구분(원문):', [...updnDist.entries()].sort().map(([u, c]) => `${u}:${c}`).join(' '));
  console.log(`  슬롯 값: min ${minLevel} / max ${maxLevel} / null ${nullSlots}`);
  console.log(`\n[조인] 역 ${stationKeys.size}개: 코드 ${cdHit} + 역명 ${nameHit} + 미조인 ${unmatched.size}`);
  if (unmatched.size) console.log('  미조인:', [...unmatched].join(', '));
  console.log(`\n적재 대상 행: ${insertRows.length} (매핑 불가 drop ${dropped})`);

  if (DRY_RUN) {
    console.log('\n--dry-run — DB 미변경.');
    return;
  }

  // 전량 교체 + sync 기록. createMany 는 배치가 커도 단일 트랜잭션.
  await prisma.$transaction([
    prisma.subwayCongestion.deleteMany({}),
    prisma.subwayCongestion.createMany({ data: insertRows }),
    prisma.subwayMasterSync.create({ data: { source: 'congestion', count: insertRows.length } }),
  ]);
  console.log('적재 완료 (SubwayMasterSync source=congestion 기록).');
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
