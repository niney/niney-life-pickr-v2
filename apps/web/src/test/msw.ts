import { setupServer } from 'msw/node';

// 웹 테스트 공용 MSW 서버. lifecycle(listen/reset/close)은 setup.ts 가 잡고,
// 핸들러는 각 테스트가 server.use() 로 그 테스트에 필요한 것만 등록한다.
//
// 기본 핸들러를 두지 않는 건 의도다 — setup 의 onUnhandledRequest: 'error' 와
// 짝을 이뤄 "이 테스트가 어떤 요청을 기대하는지" 가 항상 테스트 안에 적히고,
// 예상 못 한 호출은 조용히 통과하는 대신 즉시 실패한다.
export const server = setupServer();
