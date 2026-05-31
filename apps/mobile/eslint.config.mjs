// @repo/config 의 react flat config 를 그대로 사용한다.
// eslint-plugin-react-hooks v7 의 recommended 에 React Compiler 진단 룰
// (use-memo / immutability / purity / set-state-in-render /
// preserve-manual-memoization / static-components 등)이 포함되어, Compiler 가
// 메모이즈하지 못하는(bailout) 코드를 lint 단계에서 정적으로 잡아준다.
import reactConfig from '@repo/config/eslint/react';

export default [
  ...reactConfig,
  {
    rules: {
      // RN 은 에셋·조건부 네이티브 모듈을 require() 로 불러오는 게 관용적.
      '@typescript-eslint/no-require-imports': 'off',
      // React Compiler 진단 룰 — 기존 코드에 위반이 있어 우선 warn 으로 도입한다.
      // 목적은 회귀 방지(신규 코드에 경고)와 가시성 유지. 기존 코드를 강제로
      // 바꾸지 않으며, 정리되는 대로 error 로 승격하는 것을 권장한다.
      // set-state-in-effect / set-state-in-render 는 "useEffect 회피·파생 상태는
      // 렌더 중 계산" 원칙과 직결된다.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'node_modules/**',
      'babel.config.js',
      'metro.config.js',
    ],
  },
];
