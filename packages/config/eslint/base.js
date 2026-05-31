import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TypeScript 컴파일러가 미정의 식별자를 잡으므로 no-undef 는 끈다
      // (typescript-eslint 공식 권장). RN 글로벌(__DEV__, requestAnimationFrame
      // 등) 오탐도 함께 사라진다.
      'no-undef': 'off',
    },
  },
  {
    ignores: ['dist/**', 'build/**', '.turbo/**', 'node_modules/**'],
  },
];
