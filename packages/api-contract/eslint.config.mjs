// 순수 zod 스키마/타입 패키지 — base flat config(TS 규칙)만 사용.
import base from '@repo/config/eslint/base';

export default [
  ...base,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
