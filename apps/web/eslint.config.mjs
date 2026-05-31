// @repo/config 의 react flat config 사용. react-hooks v7 recommended 에
// React Compiler 진단 룰이 포함된다. web 은 현재 Vite babel 에 React Compiler 를
// 켜지 않았지만, 룰은 "컴파일 가능한(메모이즈 가능한) 코드인지"를 보는 것이라
// 코드 품질·향후 도입 대비로 유효하다.
import reactConfig from '@repo/config/eslint/react';

export default [
  ...reactConfig,
  {
    rules: {
      // 기존 코드에 위반이 있어 우선 warn 으로 도입(회귀 방지·가시성). 점진 정리.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/purity': 'warn',
      'no-empty': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // src 의 .js 는 tsc 가 잘못 흘린 stale 빌드 산출물(대부분 .tsx 짝이 있고
    // gitignore 됨). eslint 대상에서 제외한다.
    ignores: ['dist/**', '.turbo/**', 'node_modules/**', '**/*.js'],
  },
];
