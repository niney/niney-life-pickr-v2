import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// 3D 무대의 기기 판정 — 첫 프레임 실측(Stage3DCanvas 성능 판정) 결과를 무대별로 기억해, 다음 방문부터 무대를 처음부터
// 한 가지로 연다(도중에 2D → 3D 로 바뀌지 않게). 장면 무게가 달라 사주·타로를 따로 잰다.
//   ok    3D 로 연다. 무대 자리를 비워 두고 준비될 때까지 기다린다.
//   slow  3D 를 시도하지 않는다 — GL 오류, 소프트웨어 GL(시뮬레이터), 첫 프레임들이 확실히 느림.
//         7일이 지나거나 앱 버전이 바뀌면 다시 잰다(저전력 모드 같은 일시적 원인일 수 있어서).
// 저장은 이 기기에만(AsyncStorage `lp:<scope>-stage3d:v1`). 개발 빌드의 ?stage=3d|2d 강제는 판정을 읽지도 쓰지도 않는다.

export type Stage3DScope = 'saju' | 'tarot';
export type Stage3DVerdict = 'ok' | 'slow';

const keyOf = (scope: Stage3DScope): string => `lp:${scope}-stage3d:v1`;
const SLOW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Saved {
  verdict: Stage3DVerdict;
  at: number;
  version: string;
}

const appVersion = (): string => Constants.expoConfig?.version ?? '';

// 무대별 메모리 값 — 없으면(undefined) 아직 안 읽음. 한 번 읽으면 앱 수명 동안 쓴다(다음 방문은 동기).
const cache: Partial<Record<Stage3DScope, Stage3DVerdict | null>> = {};

/** 이미 읽어 둔 판정(없으면 null, 아직 안 읽었으면 undefined) — 화면 첫 렌더에서 동기로 쓴다. */
export const peekStage3DVerdict = (scope: Stage3DScope): Stage3DVerdict | null | undefined => cache[scope];

export async function loadStage3DVerdict(scope: Stage3DScope): Promise<Stage3DVerdict | null> {
  const hit = cache[scope];
  if (hit !== undefined) return hit;
  let verdict: Stage3DVerdict | null;
  try {
    const raw = await AsyncStorage.getItem(keyOf(scope));
    const s = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    const known = s?.verdict === 'ok' || s?.verdict === 'slow';
    const expired = s?.verdict === 'slow' && Date.now() - (s.at ?? 0) > SLOW_TTL_MS;
    verdict = s && known && s.version === appVersion() && !expired ? (s.verdict as Stage3DVerdict) : null;
  } catch {
    verdict = null;
  }
  cache[scope] = verdict;
  return verdict;
}

export function saveStage3DVerdict(scope: Stage3DScope, verdict: Stage3DVerdict): void {
  cache[scope] = verdict;
  const saved: Saved = { verdict, at: Date.now(), version: appVersion() };
  AsyncStorage.setItem(keyOf(scope), JSON.stringify(saved)).catch(() => undefined);
}
