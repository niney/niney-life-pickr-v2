import { describe, expect, it } from 'vitest';
import {
  isParenName,
  parseArrivalClusters,
  reconcileGroup,
  resolveObserved,
  stripParenName,
  type GroupDbRow,
  type ObservedCluster,
  type ObservedRow,
} from './subway-verify.service.js';

// 왕십리(1002/1005/1063/1075) 한 물리 역 도착 행 팩토리 — 각 행이 역 전체
// subwayList/statnList 를 병기(프로브 ⑦ 실측 구조).
const WANGSIMNI_SUBWAY_LIST = '1002,1005,1063,1075';
const WANGSIMNI_STATN_LIST = '1002000208,1005000540,1063075116,1075075210';
const wsRow = (subwayId: string, statnId: string): ObservedRow => ({
  subwayId,
  statnId,
  subwayList: WANGSIMNI_SUBWAY_LIST,
  statnList: WANGSIMNI_STATN_LIST,
  statnNm: '왕십리',
});

describe('parseArrivalClusters', () => {
  it('한 물리 역의 행들을 1클러스터로 모으고 lineToStatnId 를 채운다', () => {
    const clusters = parseArrivalClusters([
      wsRow('1002', '1002000208'),
      wsRow('1063', '1063075116'),
      wsRow('1002', '1002000208'), // 중복 행
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.lineIds).toEqual(['1002', '1005', '1063', '1075']);
    expect(clusters[0]!.lineToStatnId.get('1063')).toBe('1063075116');
    expect(clusters[0]!.lineToStatnId.get('1075')).toBe('1075075210');
  });

  it('동명이역(양평 5호선 vs 경의중앙)은 subwayList 가 달라 2클러스터로 분리', () => {
    const clusters = parseArrivalClusters([
      { subwayId: '1005', statnId: '1005000544', subwayList: '1005', statnList: '1005000544', statnNm: '양평' },
      { subwayId: '1063', statnId: '1063075120', subwayList: '1063', statnList: '1063075120', statnNm: '양평' },
    ]);
    expect(clusters).toHaveLength(2);
    const lineSets = clusters.map((c) => c.lineIds.join(','));
    expect(lineSets).toContain('1005');
    expect(lineSets).toContain('1063');
  });

  it('subwayList 가 없으면 행 자신의 subwayId 로 단일 클러스터', () => {
    const clusters = parseArrivalClusters([
      { subwayId: '1001', statnId: '1001000133', subwayList: null, statnList: null, statnNm: '소요산' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.lineIds).toEqual(['1001']);
    expect(clusters[0]!.lineToStatnId.get('1001')).toBe('1001000133');
  });
});

const cluster = (lineIds: string[], map: Record<string, string> = {}): ObservedCluster => ({
  lineIds: [...lineIds].sort(),
  lineToStatnId: new Map(Object.entries(map)),
});

describe('resolveObserved', () => {
  it('단일 클러스터가 그룹과 교집합이면 그대로 (matched)', () => {
    const sel = resolveObserved([cluster(['1002', '1077'])], new Set(['1002', '1077']));
    expect(sel.reason).toBe('matched');
    expect(sel.cluster!.lineIds).toEqual(['1002', '1077']);
  });

  it('동명이역(교집합 없는 다른 클러스터)은 배제하고 매칭 클러스터만', () => {
    // '양평' 조회로 5호선({1005})·경의중앙({1063}) 둘 다 와도, 이 그룹({1063})은
    // 경의중앙 쪽만.
    const sel = resolveObserved([cluster(['1005']), cluster(['1063'])], new Set(['1063']));
    expect(sel.reason).toBe('matched');
    expect(sel.cluster!.lineIds).toEqual(['1063']);
  });

  it('같은 물리 역이 쪼개진 클러스터(GTX-A 등)는 병합', () => {
    // 연신내: {1032}(GTX-A) + {1003,1006}(3·6호선) → 그룹과 교집합 있는 둘 다 병합.
    const sel = resolveObserved(
      [
        cluster(['1032'], { '1032': '1032000123' }),
        cluster(['1003', '1006'], { '1003': '1003000320', '1006': '1006000610' }),
      ],
      new Set(['1003', '1006', '1032']),
    );
    expect(sel.reason).toBe('matched');
    expect(sel.cluster!.lineIds).toEqual(['1003', '1006', '1032']);
    expect(sel.cluster!.lineToStatnId.get('1032')).toBe('1032000123');
  });

  it('안산선 공용구간 병합 — {1004}+{1004,1075} → 1075 편입', () => {
    const sel = resolveObserved(
      [cluster(['1004'], { '1004': '1004000450' }), cluster(['1004', '1075'], { '1075': '1075075310' })],
      new Set(['1004']),
    );
    expect(sel.cluster!.lineIds).toEqual(['1004', '1075']);
    expect(sel.cluster!.lineToStatnId.get('1075')).toBe('1075075310');
  });

  it('그룹 노선과 교집합이 하나도 없으면 unmatched (기존 매핑 유지)', () => {
    // 운정 GTX-A 그룹({1032})에 경의중앙({1063})만 관측 → 자동보정 불가.
    const sel = resolveObserved([cluster(['1063'])], new Set(['1032']));
    expect(sel.reason).toBe('unmatched');
    expect(sel.cluster).toBeNull();
  });

  it('빈 클러스터 목록 → empty', () => {
    expect(resolveObserved([], new Set(['1002'])).reason).toBe('empty');
  });
});

const lineName = (l: string): string => `L${l}`;
// 테스트 지원 노선 — 인천1호선(1069)·미지(1091)는 제외로 취급.
const isKnownLine = (l: string): boolean => l !== '1069' && l !== '1091';

describe('reconcileGroup', () => {
  it('왕십리 — 오라벨 1001 삭제 + 미보유 1063/1075 생성 + statnId 보정', () => {
    // DB: 1001(오라벨), 1002, 1005 — 1002 는 statnId 이미 정합, 1005 는 미채움.
    const dbRows: GroupDbRow[] = [
      { id: '1001:왕십리', lineId: '1001', statnId: null, realtimeName: null },
      { id: '1002:왕십리', lineId: '1002', statnId: '1002000208', realtimeName: null },
      { id: '1005:왕십리', lineId: '1005', statnId: null, realtimeName: null },
    ];
    const plan = reconcileGroup({
      name: '왕십리',
      lat: 37.561,
      lng: 127.038,
      dbRows,
      observed: cluster(['1002', '1005', '1063', '1075'], {
        '1002': '1002000208',
        '1005': '1005000540',
        '1063': '1063075116',
        '1075': '1075075210',
      }),
      realtimeName: null,
      lineName,
      isKnownLine,
    });
    expect(plan.extra).toEqual([{ id: '1001:왕십리', lineId: '1001' }]);
    expect(plan.missing.map((m) => m.lineId).sort()).toEqual(['1063', '1075']);
    // 신규 생성 행은 그룹 좌표·lineName·statnId 를 담는다.
    const m1063 = plan.missing.find((m) => m.lineId === '1063')!;
    expect(m1063).toMatchObject({
      id: '1063:왕십리',
      name: '왕십리',
      lineName: 'L1063',
      statnId: '1063075116',
      lat: 37.561,
      lng: 127.038,
    });
    // 1002 는 statnId 정합 → backfill 없음, 1005 만 채움.
    expect(plan.statnIdBackfill).toEqual([
      { id: '1005:왕십리', lineId: '1005', statnId: '1005000540' },
    ]);
  });

  it('정합 그룹(DB==관측, statnId 이미 채움) → 빈 계획', () => {
    const dbRows: GroupDbRow[] = [
      { id: '1002:강남', lineId: '1002', statnId: '1002000222', realtimeName: null },
      { id: '1077:강남', lineId: '1077', statnId: '1077000687', realtimeName: null },
    ];
    const plan = reconcileGroup({
      name: '강남',
      lat: 37.4979,
      lng: 127.0276,
      dbRows,
      observed: cluster(['1002', '1077'], {
        '1002': '1002000222',
        '1077': '1077000687',
      }),
      realtimeName: null,
      lineName,
      isKnownLine,
    });
    expect(plan.extra).toEqual([]);
    expect(plan.missing).toEqual([]);
    expect(plan.statnIdBackfill).toEqual([]);
    expect(plan.realtimeNameUpdate).toEqual([]);
  });

  it('제외/미지 노선(1069·1091)과 statnId 없는 관측은 생성하지 않는다', () => {
    // 부평 — 관측에 인천1호선(1069)·미지(1091)·statnId 없는 1067 이 섞여 옴.
    const dbRows: GroupDbRow[] = [
      { id: '1001:부평', lineId: '1001', statnId: '1001000139', realtimeName: null },
    ];
    const plan = reconcileGroup({
      name: '부평',
      lat: 37.489,
      lng: 126.724,
      dbRows,
      observed: cluster(['1001', '1069', '1091', '1067'], {
        '1001': '1001000139',
        '1069': '1069073120',
        '1091': '1091004800',
        // 1067 은 statnId 없음(오염) — 생성 금지 대상.
      }),
      realtimeName: null,
      lineName,
      isKnownLine,
    });
    // 1069/1091(제외·미지) + 1067(statnId 없음) 모두 생성 안 함 → missing 비어야.
    expect(plan.missing).toEqual([]);
    // 1069/1091 은 지원 노선이 아니라 extra(삭제)로도 잡지 않는다 — DB 엔 없으니 무관.
    expect(plan.extra).toEqual([]);
  });

  it('realtimeName 후보가 있으면 정합 행에 기록하고 삭제될 extra 는 제외', () => {
    const dbRows: GroupDbRow[] = [
      { id: '1001:왕십리(성동구청)', lineId: '1001', statnId: null, realtimeName: null },
      { id: '1002:왕십리(성동구청)', lineId: '1002', statnId: '1002000208', realtimeName: null },
    ];
    const plan = reconcileGroup({
      name: '왕십리(성동구청)',
      lat: 37.561,
      lng: 127.038,
      dbRows,
      observed: cluster(['1002'], { '1002': '1002000208' }),
      realtimeName: '왕십리', // 괄호 제거형으로 조회 성공
      lineName,
      isKnownLine,
    });
    // 1001 은 extra(삭제) → realtimeNameUpdate 제외, 1002 만 기록.
    expect(plan.realtimeNameUpdate).toEqual([{ id: '1002:왕십리(성동구청)', realtimeName: '왕십리' }]);
    expect(plan.extra).toEqual([{ id: '1001:왕십리(성동구청)', lineId: '1001' }]);
  });
});

describe('stripParenName / isParenName', () => {
  it('병기형만 재시도 대상', () => {
    expect(isParenName('왕십리(성동구청)')).toBe(true);
    expect(stripParenName('왕십리(성동구청)')).toBe('왕십리');
    expect(isParenName('강남')).toBe(false);
    expect(stripParenName('총신대입구(이수)')).toBe('총신대입구');
  });
});
