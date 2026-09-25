import { isLpEmbedded, postLpEmbedMessage } from '../embedBridge.js';
import { useSajuProfileStore } from './sajuProfileStore.js';

// 사주(C) 게스트 프로필 미러 — 웹이 앱 WebView 안에서 열렸을 때 게스트 프로필 스토어(WebView localStorage)를
// 브리지 `saju-profiles` 로 앱에 흘려보낸다. 앱은 같은 모양의 스토어(AsyncStorage)를 통째로 교체해 홈
// "오늘의 운세" 카드·알림을 기기에서 계산한다. 한 방향(웹 → 앱)이고 앱 밖(일반 브라우저)에서는 아무 일도
// 하지 않는다. 회원은 서버 프로필을 쓰므로 여기서는 게스트 로컬 스토어만 다룬다.
//
// 보내는 시점: 복원이 끝난 현재 상태 한 번 + persist 복원 완료 시 + 이후 프로필/primary 변경마다.
// 복원 전(빈 상태)에는 보내지 않는다 — 앱 쪽 사본을 잠깐이라도 빈 목록으로 덮지 않게.
export const startSajuProfileMirror = (): (() => void) => {
  if (!isLpEmbedded()) return () => {};
  const post = (): void => {
    const s = useSajuProfileStore.getState();
    postLpEmbedMessage({ type: 'saju-profiles', profiles: s.profiles, primaryId: s.primaryId });
  };
  if (useSajuProfileStore.persist.hasHydrated()) post();
  const stopHydration = useSajuProfileStore.persist.onFinishHydration(() => post());
  const stopChanges = useSajuProfileStore.subscribe((state, previous) => {
    if (state.profiles !== previous.profiles || state.primaryId !== previous.primaryId) post();
  });
  return () => {
    stopHydration();
    stopChanges();
  };
};
