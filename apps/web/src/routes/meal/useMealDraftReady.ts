import { useAuthStore, useMealDraftReadyPrincipal } from '@repo/shared';

// 식단 draft 를 지금 읽고 써도 되는지 — 로그인한 사용자의 draft 복원까지 끝났는지.
// 웹은 새로고침하면 /me 응답 뒤에야 draft 를 그 계정 것으로 전환한다. 그 전에 쓴 값은 저장되지
// 않고 전환이 메모리를 비울 때 함께 사라지므로, 입력 화면과 "기록으로 옮기는" 버튼은 이 값이
// true 일 때만 draft 를 건드린다.
export const useMealDraftReady = (): boolean => {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const readyPrincipal = useMealDraftReadyPrincipal();
  return userId !== null && readyPrincipal === userId;
};
