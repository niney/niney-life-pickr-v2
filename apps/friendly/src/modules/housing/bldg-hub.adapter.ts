// 건축HUB 건축물대장정보 어댑터 — 국토교통부, data.go.kr 15134735(1613000/BldRgstHubService). HTTPS GET,
// serviceKey + 대지 위치(sigunguCd 5·bjdongCd 5·platGbCd 1·bun 4·ji 4 — 전부 PNU 19자리에서 잘라 낸다)
// + pageNo/numOfRows, _type=json. 집값 단지 속성 보강(load:housing-buildings)만 쓴다 — 라우트 없음.
// 오퍼레이션 2개:
//   recap  getBrRecapTitleInfo  총괄표제부 — 대지 단위 한 행: 총주차수(totPkngCnt)·세대수(hhldCnt)·주건축물수
//                               (mainBldCnt)·사용승인일(useAprDay YYYYMMDD)·도로명주소(newPlatPlc)·연면적(totArea)·
//                               주차 세부(indrAutoUtcnt·oudrAutoUtcnt·indrMechUtcnt·oudrMechUtcnt)·호수(hoCnt)
//   title  getBrTitleInfo       표제부 — 동(건물) 단위 행들: 지상/지하층수(grndFlrCnt/ugrndFlrCnt)·구조(strctCdNm)·
//                               주용도(mainPurpsCdNm)·승강기(rideUseElvtCnt·emgenUseElvtCnt)·세대수·동명(dongNm)·
//                               사용승인일·도로명주소·주차 4종
// 필드명은 공공데이터포털 활용명세(15134735) 기준. 프로브(2026-08-30)에선 키 미등록(30)이라 실응답을 못 봤다 —
// 활용신청 뒤 `load:housing-buildings --probe` 로 필드 인벤토리를 확인한다(items 버릇은 datago-json 이 흡수).
// PNU 11번째 자리(1 대지·2 산) → platGbCd(0 대지·1 산) 변환에 주의.

import { DataGoApiError, DataGoAuthError, fetchDataGoJson, type DataGoCallOptions } from './datago-json.adapter.js';

export const BLDG_HUB_BASE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService';
export type BldgHubOp = 'recap' | 'title';
export const BLDG_HUB_OP_PATH: Record<BldgHubOp, string> = {
  recap: 'getBrRecapTitleInfo',
  title: 'getBrTitleInfo',
};

export { DataGoApiError as BldgHubApiError, DataGoAuthError as BldgHubApiAuthError };

// 표제부는 동마다 한 행 — 대단지(50동+)도 한 페이지에 오게 넉넉히. 상한을 두면 totalCount 로 이어 받는다.
export const BLDG_HUB_PAGE_SIZE = 100;
const MAX_PAGES = 10;

export interface BldgPnuParams {
  sigunguCd: string;
  bjdongCd: string;
  // '0' 대지 · '1' 산.
  platGbCd: string;
  bun: string;
  ji: string;
}

// PNU 19자리 → 건축물대장 조회 파라미터. 형식이 아니면 null.
export const bldgParamsFromPnu = (pnu: string | null | undefined): BldgPnuParams | null => {
  const s = (pnu ?? '').trim();
  if (!/^\d{19}$/.test(s)) return null;
  const gb = s.charAt(10);
  return {
    sigunguCd: s.slice(0, 5),
    bjdongCd: s.slice(5, 10),
    platGbCd: gb === '2' ? '1' : '0',
    bun: s.slice(11, 15),
    ji: s.slice(15, 19),
  };
};

export interface BldgHubFetchOptions extends DataGoCallOptions {
  pageSize?: number;
  maxPages?: number;
}

export interface BldgHubRecords {
  items: Record<string, unknown>[];
  totalCount: number;
  // 나간 호출 수(페이지 수).
  calls: number;
  requestUrl: string;
}

// 한 대지의 총괄표제부/표제부 행 전량 — totalCount 까지 순차 페이징.
export const fetchBldgRecords = async (op: BldgHubOp, params: BldgPnuParams, opts: BldgHubFetchOptions): Promise<BldgHubRecords> => {
  const pageSize = opts.pageSize ?? BLDG_HUB_PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const items: Record<string, unknown>[] = [];
  let totalCount = 0;
  let calls = 0;
  let requestUrl = '';
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetchDataGoJson(
      `${BLDG_HUB_BASE_URL}/${BLDG_HUB_OP_PATH[op]}`,
      {
        sigunguCd: params.sigunguCd,
        bjdongCd: params.bjdongCd,
        platGbCd: params.platGbCd,
        bun: params.bun,
        ji: params.ji,
        numOfRows: String(pageSize),
        pageNo: String(page),
      },
      opts,
    );
    calls += 1;
    requestUrl = res.requestUrl;
    totalCount = res.totalCount;
    items.push(...res.items);
    if (res.items.length === 0 || items.length >= totalCount) break;
  }
  return { items, totalCount, calls, requestUrl };
};
