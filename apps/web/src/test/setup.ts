/// <reference types="@testing-library/jest-dom/vitest" />
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { server } from './msw';

// 웹 테스트 공통 setup.
//
// matcher 등록에 `@testing-library/jest-dom/vitest` 를 import 하지 않고
// expect.extend 를 직접 부른다 — 그 서브패스는 자기 위치에서 `vitest` 를
// 해석하는데, 이 리포는 web(4.x)과 friendly(2.x)가 서로 다른 vitest 를 쓰고
// pnpm 이 각자 카피를 주므로 엉뚱한 인스턴스의 expect 가 확장되어 실제 실행
// 중인 expect 에는 matcher 가 붙지 않는다("Invalid Chai property"). 여기서
// import 한 expect 는 web 기준으로 해석되므로 확실히 같은 인스턴스다.
// 타입 augmentation 만 위쪽 reference 로 따로 끌어온다(런타임 로드 없음).
expect.extend(matchers);

// vitest globals 를 켜지 않아 RTL 의 자동 cleanup(전역 afterEach 를 찾아 스스로
// 등록하는 방식)이 걸리지 않는다. 직접 등록해야 테스트 간 DOM 이 격리되고,
// 같은 텍스트 쿼리가 이전 렌더분까지 집어 "여러 개 매칭" 으로 깨지지 않는다.
afterEach(cleanup);

// MSW — 네트워크를 타지 않는 테스트가 대부분이라 서버가 떠 있어도 무해하고,
// onUnhandledRequest: 'error' 로 "핸들러를 안 건 요청" 을 조용한 통과 대신
// 실패로 드러낸다. 핸들러는 테스트마다 server.use() 로 등록하고 여기서 리셋.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
