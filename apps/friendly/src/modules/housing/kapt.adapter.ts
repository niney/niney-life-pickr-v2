// K-apt(공동주택관리정보시스템) 단지 정보 어댑터 — 국토교통부, data.go.kr 1613000. HTTPS GET, serviceKey +
// 쿼리스트링, _type=json. 집값 단지 속성 보강(load:housing-kapt --source=api)만 쓴다 — 라우트 없음.
// 오퍼레이션:
//   list   단지 목록제공 서비스(15057332)  AptListService3/getTotalAptList3   pageNo/numOfRows → kaptCode·kaptName·
//          as1(시도)·as2(시군구)·as3(읍면)·as4(동리)·bjdCode(법정동 10자리)
//   basic  기본 정보제공 서비스(15058453)  AptBasisInfoServiceV3/getAphusBassInfo  kaptCode → kaptAddr(법정동주소)·
//          doroJuso·codeSaleNm(분양형태)·codeHeatNm(난방)·codeAptNm(단지분류)·kaptdaCnt(세대수)·kaptDongCnt(동수)·
//          kaptUsedate(사용승인일)·kaptTopFloor·bjdCode
//   detail 상세 정보제공(같은 서비스)      AptBasisInfoServiceV3/getAphusDtlInfo   kaptCode → kaptdEcnt(승강기 대수)·
//          kaptdPcnt(지상 주차)·kaptdPcntu(지하 주차)·codeMgr·welfareFacility …
// 기본/상세 경로는 포털 페이지의 End Point(`http://apis.data.go.kr/1613000/AptBasisInfoServiceV3`, 2026-08-30 확인)
// 그대로이고, 목록 경로는 페이지에 안 보여 현행 명명 규칙으로 적었다 — 실응답은 아직 못 봤다(현재 키로 프로브하면
// 셋 다 `12 해당 오픈API 서비스가 없거나 폐기됨`: 이 제공기관은 활용신청이 없는 키에 30 대신 12 를 준다고 추정).
// 활용신청(15057332·15058453) 뒤 `load:housing-kapt --source=api --probe` 로 1콜씩 확인하고, 목록 경로가 틀리면
// KAPT_LIST_URL 만 고친다. 개발계정 일 5,000건이라 전량(단지 ≈1.9만 × 기본+상세 2콜)은 --max-calls 로 며칠에 나눈다.

import { coerceStrOrNull, intOrNull } from '../../lib/narrow.js';
import { DataGoApiError, DataGoAuthError, fetchDataGoJson, type DataGoCallOptions } from './datago-json.adapter.js';

export const KAPT_LIST_URL = 'https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3';
export const KAPT_BASIC_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfo';
export const KAPT_DETAIL_URL = 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusDtlInfo';

export { DataGoApiError as KaptApiError, DataGoAuthError as KaptApiAuthError };

// 목록 페이지 크기 — 상한은 실측 전. 게이트웨이가 줄이면 items 길이로 이어 받는다.
export const KAPT_LIST_PAGE_SIZE = 1000;
const LIST_MAX_PAGES = 200;

export interface KaptListItem {
  kaptCode: string;
  kaptName: string;
  as1: string | null;
  as2: string | null;
  as3: string | null;
  as4: string | null;
  bjdCode: string | null;
}

const str = (v: unknown): string | null => {
  const s = coerceStrOrNull(v)?.trim() ?? null;
  return s && s.length > 0 ? s : null;
};

export const narrowKaptListItem = (raw: Record<string, unknown>): KaptListItem | null => {
  const kaptCode = str(raw['kaptCode']);
  const kaptName = str(raw['kaptName']);
  if (!kaptCode || !kaptName) return null;
  return {
    kaptCode,
    kaptName,
    as1: str(raw['as1']),
    as2: str(raw['as2']),
    as3: str(raw['as3']),
    as4: str(raw['as4']),
    bjdCode: str(raw['bjdCode']),
  };
};

export interface KaptListPage {
  items: KaptListItem[];
  totalCount: number;
  requestUrl: string;
}

export const fetchKaptListPage = async (params: { pageNo: number; numOfRows: number }, opts: DataGoCallOptions): Promise<KaptListPage> => {
  const res = await fetchDataGoJson(KAPT_LIST_URL, { pageNo: String(params.pageNo), numOfRows: String(params.numOfRows) }, opts);
  return {
    items: res.items.map(narrowKaptListItem).filter((i): i is KaptListItem => i !== null),
    totalCount: res.totalCount,
    requestUrl: res.requestUrl,
  };
};

export interface FetchAllKaptListOptions extends DataGoCallOptions {
  pageSize?: number;
  maxPages?: number;
  onPage?(p: { pageNo: number; fetched: number; totalCount: number }): void;
}

// 전량 목록 — totalCount 까지 순차(동시 호출 없음).
export const fetchAllKaptList = async (opts: FetchAllKaptListOptions): Promise<{ items: KaptListItem[]; totalCount: number; calls: number }> => {
  const pageSize = opts.pageSize ?? KAPT_LIST_PAGE_SIZE;
  const items: KaptListItem[] = [];
  let totalCount = 0;
  let calls = 0;
  for (let page = 1; page <= (opts.maxPages ?? LIST_MAX_PAGES); page += 1) {
    const res = await fetchKaptListPage({ pageNo: page, numOfRows: pageSize }, opts);
    calls += 1;
    totalCount = res.totalCount;
    items.push(...res.items);
    opts.onPage?.({ pageNo: page, fetched: items.length, totalCount });
    if (res.items.length === 0 || items.length >= totalCount) break;
  }
  return { items, totalCount, calls };
};

export interface KaptBasicInfo {
  kaptCode: string;
  kaptName: string | null;
  // 법정동주소 / 도로명주소.
  kaptAddr: string | null;
  doroJuso: string | null;
  bjdCode: string | null;
  // 분양형태(분양/임대/혼합) · 난방방식 · 단지분류(아파트/주상복합…).
  codeSaleNm: string | null;
  codeHeatNm: string | null;
  codeAptNm: string | null;
  kaptdaCnt: number | null;
  kaptDongCnt: number | null;
  // 'YYYYMMDD' 원문.
  kaptUsedate: string | null;
  kaptTopFloor: number | null;
  raw: Record<string, unknown>;
}

export const narrowKaptBasicInfo = (raw: Record<string, unknown>): KaptBasicInfo | null => {
  const kaptCode = str(raw['kaptCode']);
  if (!kaptCode) return null;
  return {
    kaptCode,
    kaptName: str(raw['kaptName']),
    kaptAddr: str(raw['kaptAddr']),
    doroJuso: str(raw['doroJuso']),
    bjdCode: str(raw['bjdCode']),
    codeSaleNm: str(raw['codeSaleNm']),
    codeHeatNm: str(raw['codeHeatNm']),
    codeAptNm: str(raw['codeAptNm']),
    kaptdaCnt: intOrNull(raw['kaptdaCnt']),
    kaptDongCnt: intOrNull(raw['kaptDongCnt']),
    kaptUsedate: str(raw['kaptUsedate']),
    kaptTopFloor: intOrNull(raw['kaptTopFloor']),
    raw,
  };
};

// 기본정보 1콜 — 0건이면 null.
export const fetchKaptBasicInfo = async (kaptCode: string, opts: DataGoCallOptions): Promise<KaptBasicInfo | null> => {
  const res = await fetchDataGoJson(KAPT_BASIC_URL, { kaptCode }, opts);
  const first = res.items[0];
  return first ? narrowKaptBasicInfo(first) : null;
};

export interface KaptDetailInfo {
  kaptCode: string;
  // 승강기 대수 / 지상·지하 주차대수.
  kaptdEcnt: number | null;
  kaptdPcnt: number | null;
  kaptdPcntu: number | null;
  raw: Record<string, unknown>;
}

export const narrowKaptDetailInfo = (raw: Record<string, unknown>): KaptDetailInfo | null => {
  const kaptCode = str(raw['kaptCode']);
  if (!kaptCode) return null;
  return {
    kaptCode,
    kaptdEcnt: intOrNull(raw['kaptdEcnt']),
    kaptdPcnt: intOrNull(raw['kaptdPcnt']),
    kaptdPcntu: intOrNull(raw['kaptdPcntu']),
    raw,
  };
};

// 상세정보 1콜 — 0건이면 null.
export const fetchKaptDetailInfo = async (kaptCode: string, opts: DataGoCallOptions): Promise<KaptDetailInfo | null> => {
  const res = await fetchDataGoJson(KAPT_DETAIL_URL, { kaptCode }, opts);
  const first = res.items[0];
  return first ? narrowKaptDetailInfo(first) : null;
};
