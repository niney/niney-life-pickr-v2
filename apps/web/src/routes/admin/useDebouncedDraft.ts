import { useCallback, useEffect, useRef, useState } from 'react';

// 입력 초안(draft)과 적용값(applied)을 나눠 든다 — 초안은 키 입력마다 바로 바뀌어 화면에 그대로
// 보이고, 적용값은 쿼리 키 같은 "비싼 소비처"에 넘기는 값이라 입력이 멈춘 뒤에만 따라간다.
// ~/lib/useDebounced 와 달리 변경마다 반영 방식을 고른다: 직접 타이핑은 'debounce', 프리셋 선택·
// 지도 드래그처럼 한 번에 끝나는 변경은 'now'(즉시). 제출·blur 는 flush() 로 대기 중인 값을 바로
// 적용한다. 타이머는 이벤트 핸들러에서 걸고, effect 는 언마운트 시 타이머 정리(외부 시스템)에만 쓴다.
export type DraftApplyMode = 'debounce' | 'now';

export interface DebouncedDraft<T> {
  // 화면에 보이는 값 — 키 입력마다 즉시 갱신.
  draft: T;
  // 쿼리에 넘기는 값 — 'now' 또는 디바운스 만료·flush 시점에만 갱신.
  applied: T;
  // 초안을 next 로 바꾼다. 'now' 면 적용값도 즉시, 'debounce' 면 delayMs 뒤에 따라간다.
  update(next: T, mode: DraftApplyMode): void;
  // 대기 중인 값이 있으면 지금 적용한다(없으면 no-op).
  flush(): void;
}

export const useDebouncedDraft = <T,>(
  initial: T,
  delayMs: number,
  // 적용값이 바뀌는 순간마다(즉시·디바운스 만료·flush) 호출 — 페이지 오프셋 리셋 같은 동반 갱신용.
  // NoInfer — T 는 initial 에서만 추론한다(콜백 인자가 끼면 'a' 같은 리터럴 타입으로 좁혀진다).
  onApply?: (value: NoInfer<T>) => void,
): DebouncedDraft<T> => {
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  // 대기 중인 적용 — 타이머와 그때 적용할 값. flush 가 최신 초안을 stale closure 없이 읽게 ref 로 둔다.
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; value: T } | null>(null);
  // onApply 는 호출자가 매 렌더 새로 만들 수 있어 ref 로 최신만 참조(update/flush 를 안정 참조로 유지).
  const onApplyRef = useRef(onApply);
  useEffect(() => {
    onApplyRef.current = onApply;
  });

  // 언마운트 시 대기 중 타이머 정리 — 사라진 컴포넌트에 setState 하지 않게.
  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    },
    [],
  );

  const apply = useCallback((value: T) => {
    setApplied(value);
    onApplyRef.current?.(value);
  }, []);

  const update = useCallback(
    (next: T, mode: DraftApplyMode) => {
      setDraft(next);
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current = null;
      }
      if (mode === 'now') {
        apply(next);
        return;
      }
      const timer = setTimeout(() => {
        pendingRef.current = null;
        apply(next);
      }, delayMs);
      pendingRef.current = { timer, value: next };
    },
    [apply, delayMs],
  );

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    apply(pending.value);
  }, [apply]);

  return { draft, applied, update, flush };
};
