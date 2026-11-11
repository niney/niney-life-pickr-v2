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
    // data/ 는 git 밖(.gitignore — DB·내려받은 원본·측정용 임시 스크립트). 거기 남은 임시 .ts/.js 가 린트 오류를 내면
    // 진짜 오류가 묻힌다(2026-11-10: perf2·perf3 의 262건으로 pnpm lint 가 실패하고 있었다).
    ignores: ['dist/**', '.turbo/**', 'node_modules/**', 'prisma/migrations/**', 'data/**'],
  },
];
