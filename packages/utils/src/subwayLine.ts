// 수도권 전철 노선 상수 — 서울시 실시간 API 의 subwayId(4자리) 를 lineId 로
// 채택한다 (프로브 실측 2026-07-06: 도착/위치 응답의 subwayId 와 동일 체계).
// 역사마스터(subwayStationMaster)의 ROUTE 39종(경부선/과천선/분당선 등 철도
// 노선 기준)은 friendly 적재 시 이 lineId 로 접어서 저장한다 — 매핑 테이블은
// BE 전용이라 subway-master.service.ts 에 있다.
//
// positionParam 은 realtimePosition 의 path 파라미터 표기. verified 는 프로브로
// 실검증된 표기(2026-07-06, INFO-000 수신), 나머지는 관례 표기 추정 — 각 차수
// 에서 실호출로 검증되면 주석을 갱신한다.

export interface SubwayLine {
  /** 실시간 API subwayId — '1002' */
  lineId: string;
  /** 표준 표기 — '2호선' */
  name: string;
  /** 뱃지 축약 — '2', '경중', '신분당' */
  shortLabel: string;
  /** 공식 노선색 hex */
  color: string;
  /** realtimePosition path 파라미터 표기 (null = 실시간 위치 미지원/미확인) */
  positionParam: string | null;
}

export const SUBWAY_LINES: readonly SubwayLine[] = [
  { lineId: '1001', name: '1호선', shortLabel: '1', color: '#0052A4', positionParam: '1호선' },
  { lineId: '1002', name: '2호선', shortLabel: '2', color: '#00A84D', positionParam: '2호선' }, // verified
  { lineId: '1003', name: '3호선', shortLabel: '3', color: '#EF7C1C', positionParam: '3호선' },
  { lineId: '1004', name: '4호선', shortLabel: '4', color: '#00A5DE', positionParam: '4호선' },
  { lineId: '1005', name: '5호선', shortLabel: '5', color: '#996CAC', positionParam: '5호선' },
  { lineId: '1006', name: '6호선', shortLabel: '6', color: '#CD7C2F', positionParam: '6호선' },
  { lineId: '1007', name: '7호선', shortLabel: '7', color: '#747F00', positionParam: '7호선' },
  { lineId: '1008', name: '8호선', shortLabel: '8', color: '#E6186C', positionParam: '8호선' },
  { lineId: '1009', name: '9호선', shortLabel: '9', color: '#BDB092', positionParam: '9호선' }, // verified
  { lineId: '1032', name: 'GTX-A', shortLabel: 'GTX-A', color: '#9A6292', positionParam: 'GTX-A' }, // verified
  { lineId: '1063', name: '경의중앙선', shortLabel: '경중', color: '#77C4A3', positionParam: '경의중앙선' }, // verified
  { lineId: '1065', name: '공항철도', shortLabel: '공항', color: '#0090D2', positionParam: '공항철도' },
  { lineId: '1067', name: '경춘선', shortLabel: '경춘', color: '#0C8E72', positionParam: '경춘선' },
  { lineId: '1075', name: '수인분당선', shortLabel: '수인분당', color: '#FABE00', positionParam: '수인분당선' }, // verified
  { lineId: '1077', name: '신분당선', shortLabel: '신분당', color: '#D4003B', positionParam: '신분당선' }, // verified
  { lineId: '1081', name: '경강선', shortLabel: '경강', color: '#003DA5', positionParam: '경강선' },
  { lineId: '1092', name: '우이신설선', shortLabel: '우이', color: '#B7C452', positionParam: '우이신설선' }, // verified
  { lineId: '1093', name: '서해선', shortLabel: '서해', color: '#8FC31F', positionParam: '서해선' },
  // 신림선 — subwayId 1094 는 문헌 추정(프로브 미검증). 위치/도착 실관측 후 확정.
  { lineId: '1094', name: '신림선', shortLabel: '신림', color: '#6789CA', positionParam: '신림선' },
] as const;

const BY_ID = new Map(SUBWAY_LINES.map((l) => [l.lineId, l]));

export const subwayLineById = (lineId: string): SubwayLine | null => BY_ID.get(lineId) ?? null;

// 미지의 lineId(신규 노선 등)는 회색 폴백 — 뱃지/폴리라인이 죽지 않게.
export const SUBWAY_LINE_FALLBACK_COLOR = '#6B7280';
export const subwayLineColor = (lineId: string): string =>
  BY_ID.get(lineId)?.color ?? SUBWAY_LINE_FALLBACK_COLOR;
export const subwayLineName = (lineId: string): string => BY_ID.get(lineId)?.name ?? lineId;
export const subwayLineShortLabel = (lineId: string): string =>
  BY_ID.get(lineId)?.shortLabel ?? lineId;
