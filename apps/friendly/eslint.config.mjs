// @repo/config 의 node flat config 사용 (base + Node 글로벌).
import nodeConfig from '@repo/config/eslint/node';

export default [
  ...nodeConfig,
  {
    rules: {
      // 기존 코드(스크래핑 어댑터·개발 스크립트)에 위반이 있어 우선 warn 으로
      // 도입. 점진 정리. consistent-type-imports 는 --fix 로 대부분 해소됨.
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    ignores: ['dist/**', '.turbo/**', 'node_modules/**', 'prisma/migrations/**'],
  },
];
