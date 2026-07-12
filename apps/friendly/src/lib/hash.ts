import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

// 타이밍 세이프 더미 해시 — 존재하지 않는 이메일로 로그인 시도해도 동일 비용의
// bcrypt 비교를 돌려 응답시간 차이로 이메일 열거하는 것을 막는다. 모듈 로드 시 1회 계산.
export const DUMMY_PASSWORD_HASH: string = bcrypt.hashSync(
  'life-pickr-timing-safe-dummy',
  ROUNDS,
);
