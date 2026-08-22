import { describe, expect, it } from 'vitest';
import {
  FoodApiAuthError,
  FoodApiError,
  MAFRA_RECIPE_GRID,
  __foodApiInternals,
} from './food-api.adapter.js';

// 봉투 해석만 — 네트워크 없이. 실응답 형식은 0차 프로브(probe:food-api)로 확정하면 여기 픽스처를 갱신한다.
const { interpretMfdsNutrition, interpretMfdsRecipe, interpretMafra, buildMfdsNutritionUrls, buildMfdsRecipeUrls } =
  __foodApiInternals;

const http = (body: unknown, status = 200) => ({ status, rawText: typeof body === 'string' ? body : JSON.stringify(body) });

describe('food-api.adapter — URL 빌드', () => {
  it('표준데이터: Encoding 키(%XX)는 그대로, Decoding 키는 인코딩해 붙이고 requestUrl 은 마스킹', () => {
    const enc = buildMfdsNutritionUrls({ pageNo: '1', numOfRows: '10' }, 'abc%2Bdef%3D%3D');
    expect(enc.fetchUrl).toContain('serviceKey=abc%2Bdef%3D%3D&');
    expect(enc.fetchUrl).toContain('type=json');
    expect(enc.requestUrl).toContain('serviceKey=***');
    expect(enc.requestUrl).not.toContain('abc%2B');
    const dec = buildMfdsNutritionUrls({}, 'abc+def==');
    expect(dec.fetchUrl).toContain('serviceKey=abc%2Bdef%3D%3D');
  });

  it('레시피: 키는 path 세그먼트, requestUrl 은 *** 로 가린다', () => {
    const u = buildMfdsRecipeUrls(1, 1000, 'SECRET');
    expect(u.fetchUrl).toBe('http://openapi.foodsafetykorea.go.kr/api/SECRET/COOKRCP01/json/1/1000');
    expect(u.requestUrl).toBe('http://openapi.foodsafetykorea.go.kr/api/***/COOKRCP01/json/1/1000');
  });
});

describe('food-api.adapter — 표준데이터(영양성분) 봉투', () => {
  it('정상 봉투를 items/totalCount 로 푼다', () => {
    const out = interpretMfdsNutrition(
      http({
        response: {
          header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' },
          body: { items: [{ foodNm: '김치찌개_돼지고기', foodLv3Nm: '찌개 및 전골류' }], totalCount: '19495', pageNo: '1', numOfRows: '1' },
        },
      }),
      'u',
    );
    expect('result' in out).toBe(true);
    if ('result' in out) {
      expect(out.result.items).toHaveLength(1);
      expect(out.result.totalCount).toBe(19495);
    }
  });

  it('items 가 {item:[…]} 또는 단건 객체여도 배열로 정규화한다', () => {
    const wrapped = interpretMfdsNutrition(
      http({ response: { header: { resultCode: '00' }, body: { items: { item: [{ foodNm: 'a' }, { foodNm: 'b' }] }, totalCount: 2 } } }),
      'u',
    );
    expect('result' in wrapped && wrapped.result.items.length).toBe(2);
    const single = interpretMfdsNutrition(
      http({ response: { header: { resultCode: '00' }, body: { items: { foodNm: 'a' }, totalCount: 1 } } }),
      'u',
    );
    expect('result' in single && single.result.items.length).toBe(1);
  });

  it('게이트웨이 30(키 미등록)은 503 AuthError, 05(타임아웃)는 retryable 502', () => {
    const auth = interpretMfdsNutrition(
      http({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR', returnReasonCode: '30' } } }),
      'u',
    );
    expect('error' in auth).toBe(true);
    if ('error' in auth) {
      expect(auth.error).toBeInstanceOf(FoodApiAuthError);
      expect(auth.error.statusCode).toBe(503);
      expect(auth.retryable).toBe(false);
    }
    const timeout = interpretMfdsNutrition(
      http({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE TIMEOUT', returnAuthMsg: 'SERVICETIMEOUT_ERROR', returnReasonCode: '05' } } }, 504),
      'u',
    );
    expect('error' in timeout && timeout.retryable).toBe(true);
  });

  it('resultCode 03(NODATA)은 빈 결과, 그 외 코드는 오류', () => {
    const nodata = interpretMfdsNutrition(http({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' }, body: {} } }), 'u');
    expect('result' in nodata && nodata.result.items.length).toBe(0);
    const err = interpretMfdsNutrition(http({ response: { header: { resultCode: '99', resultMsg: 'UNKNOWN' }, body: {} } }), 'u');
    expect('error' in err && err.error).toBeInstanceOf(FoodApiError);
  });

  it('HTML 5xx 본문은 JSON 파싱 실패 + retryable', () => {
    const out = interpretMfdsNutrition(http('<html>502 Bad Gateway</html>', 502), 'u');
    expect('error' in out && out.retryable).toBe(true);
  });
});

describe('food-api.adapter — 식품안전나라 레시피 봉투', () => {
  it('COOKRCP01.row / total_count 를 푼다', () => {
    const out = interpretMfdsRecipe(
      http({ COOKRCP01: { total_count: '1156', row: [{ RCP_SEQ: '28', RCP_NM: '새우 두부 계란찜' }], RESULT: { MSG: '정상처리되었습니다.', CODE: 'INFO-000' } } }),
      'u',
    );
    expect('result' in out && out.result.totalCount).toBe(1156);
    expect('result' in out && out.result.items[0]?.['RCP_NM']).toBe('새우 두부 계란찜');
  });

  it('최상위 RESULT ERROR-300(인증) 은 503, INFO-200 은 빈 결과', () => {
    const auth = interpretMfdsRecipe(http({ RESULT: { MSG: '인증키가 유효하지 않습니다.', CODE: 'ERROR-300' } }), 'u');
    expect('error' in auth && auth.error).toBeInstanceOf(FoodApiAuthError);
    const empty = interpretMfdsRecipe(http({ RESULT: { MSG: '해당하는 데이터가 없습니다.', CODE: 'INFO-200' } }), 'u');
    expect('result' in empty && empty.result.items.length).toBe(0);
  });
});

describe('food-api.adapter — MAFRA 봉투', () => {
  it('Grid.row / totalCnt 를 푼다', () => {
    const out = interpretMafra(
      MAFRA_RECIPE_GRID,
      http({ [MAFRA_RECIPE_GRID]: { totalCnt: 537, startRow: 1, endRow: 1, result: { code: 'INFO-000', message: '정상 처리되었습니다.' }, row: [{ RECIPE_ID: 1, RECIPE_NM_KO: '나물비빔밥' }] } }),
      'u',
    );
    expect('result' in out && out.result.totalCount).toBe(537);
    expect('result' in out && out.result.items[0]?.['RECIPE_NM_KO']).toBe('나물비빔밥');
  });

  it('result.code 오류는 FoodApiError', () => {
    const out = interpretMafra(MAFRA_RECIPE_GRID, http({ [MAFRA_RECIPE_GRID]: { result: { code: 'ERROR-500', message: '서버 오류' }, row: [] } }), 'u');
    expect('error' in out && out.error).toBeInstanceOf(FoodApiError);
  });
});
