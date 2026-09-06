// 이전 이름은 기존 기기 데이터를 이전할 때만 읽는다. 새 쓰기는 saju-g 키만 사용한다.
export const SAJU_G_LEGACY_STORAGE = {
  profiles: 'lp:saju-profiles:v1:guest',
  history: (principal: string) => `lp:saju:v1:${principal}`,
  share: (token: string) => `lp:saju-share:${token}`,
};
