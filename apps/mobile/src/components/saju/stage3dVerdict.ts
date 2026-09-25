import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// 사주 3D 무대의 기기 판정 — 첫 프레임 실측(SajuStage3D 성능 판정) 결과를 기억해, 다음 방문부터 무대를 처음부터
// 한 가지로 연다(도중에 2D → 3D 로 바뀌지 않게).
//   ok    3D 로 연다. 원판 자리를 비워 두고 준비될 때까지 기다린다.
//   slow  3D 를 시도하지 않는다 — GL 오류, 소프트웨어 GL(시뮬레이터), 첫 프레임들이 확실히 느림.
//         7일이 지나거나 앱 버전이 바뀌면 다시 잰다(저전력 모드 같은 일시적 원인일 수 있어서).
// 저장은 이 기기에만(AsyncStorage). 개발 빌드의 ?stage=3d|2d 강제는 판정을 읽지도 쓰지도 않는다.

export type SajuStage3DVerdict = 'ok' | 'slow';

const KEY = 'lp:saju-stage3d:v1';
const SLOW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Saved {
  verdict: SajuStage3DVerdict;
  at: number;
  version: string;
}

const appVersion = (): string => Constants.expoConfig?.version ?? '';

// undefined = 아직 안 읽음. 한 번 읽으면 앱 수명 동안 메모리 값을 쓴다(다음 방문은 동기).
let cache: SajuStage3DVerdict | null | undefined;

/** 이미 읽어 둔 판정(없으면 null, 아직 안 읽었으면 undefined) — 화면 첫 렌더에서 동기로 쓴다. */
export const peekSajuStage3DVerdict = (): SajuStage3DVerdict | null | undefined => cache;

export async function loadSajuStage3DVerdict(): Promise<SajuStage3DVerdict | null> {
  if (cache !== undefined) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    const known = s?.verdict === 'ok' || s?.verdict === 'slow';
    const expired = s?.verdict === 'slow' && Date.now() - (s.at ?? 0) > SLOW_TTL_MS;
    cache = s && known && s.version === appVersion() && !expired ? (s.verdict as SajuStage3DVerdict) : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveSajuStage3DVerdict(verdict: SajuStage3DVerdict): void {
  cache = verdict;
  const saved: Saved = { verdict, at: Date.now(), version: appVersion() };
  AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch(() => undefined);
}
