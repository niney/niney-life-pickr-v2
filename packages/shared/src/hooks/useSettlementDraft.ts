import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SettlementDraftType,
  UpsertSettlementDraftInputType,
} from '@repo/api-contract';
import { settlementDraftApi } from '../api/settlement-draft.api.js';
import {
  useSettlementDraftStore,
  type DraftParticipant,
  type DraftRound,
} from '../stores/settlementDraftStore.js';
import { useAuthStore } from '../stores/authStore.js';

// 정산 입력의 서버 임시저장 hook 들. 자동 저장(debounce)으로 다기기 동기화.
// 로그인 시에만 동작 — 비로그인은 기존 settlementDraftStore 의 sessionStorage
// 만 사용.

const KEY = ['settlement-draft'] as const;

export const useListSettlementDrafts = (enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => settlementDraftApi.list(),
    enabled,
    // 같은 사용자가 다른 기기에서 편집 중일 수 있어 stale 시간을 짧게.
    staleTime: 30_000,
  });

export const useUpsertSettlementDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertSettlementDraftInputType) =>
      settlementDraftApi.upsert(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'list'] }),
  });
};

export const useDeleteSettlementDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settlementDraftApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'list'] }),
  });
};

export type DraftAutoSyncStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'disabled';

export interface DraftAutoSyncResult {
  status: DraftAutoSyncStatus;
  savedAt: Date | null;
  // 서버 draft 의 id — 정산 저장 시 fromDraftId 로 넘겨 서버가 함께 삭제.
  draftId: string | null;
}

// store 의 participants + rounds 만 직렬화. 다른 필드(차수 메타 등)는
// SettlementDraft 모델에 포함되지만 store 자체 외 다른 항목은 현재 없음.
const snapshotPayload = (
  s: { participants: DraftParticipant[]; rounds: DraftRound[] },
): string =>
  JSON.stringify({ participants: s.participants, rounds: s.rounds });

// 자동 저장 — store 변경을 debounce 후 upsert. 로그인 + hydrated 일 때만 활성.
// hydrate 완료 시점에 baseline 을 잡아 두고, 그 뒤 진짜 변경이 있을 때만 저장.
export const useSettlementDraftAutoSync = (opts: {
  placeId: string | null;
  placeNameHint: string | null;
  // useSettlementDraftHydrate 가 끝났는지. false 면 자동 저장은 보류.
  hydrated: boolean;
  // hydrate 가 발견한 기존 draft 의 id — 첫 저장 전에도 fromDraftId 로 쓸 수
  // 있게 미리 알려준다. 새 진입이면 null.
  initialDraftId?: string | null;
  enabled?: boolean;
  debounceMs?: number;
}): DraftAutoSyncResult => {
  const {
    placeId,
    placeNameHint,
    hydrated,
    initialDraftId = null,
    enabled = true,
    debounceMs = 3000,
  } = opts;
  const isAuthed = useAuthStore((s) => !!s.token);
  const upsert = useUpsertSettlementDraft();
  const [status, setStatus] = useState<DraftAutoSyncStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  // initialDraftId 가 hydrate 후에 들어오면 한 번 동기화.
  useEffect(() => {
    if (initialDraftId && !draftId) setDraftId(initialDraftId);
  }, [initialDraftId, draftId]);
  const lastSavedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // upsert 는 매 render 마다 새 객체라 의존 배열에 두면 effect 가 반복 마운트
  // 된다 — ref 로 우회하고 effect 는 placeId/auth/hydrated 만 추적.
  const upsertRef = useRef(upsert);
  upsertRef.current = upsert;
  const placeIdRef = useRef(placeId);
  placeIdRef.current = placeId;
  const placeNameHintRef = useRef(placeNameHint);
  placeNameHintRef.current = placeNameHint;

  useEffect(() => {
    if (!enabled || !isAuthed || !hydrated) {
      setStatus('disabled');
      return;
    }
    setStatus('idle');
    // 마운트 시점 baseline — 사용자가 실제로 편집하기 전까진 저장 안 함.
    lastSavedRef.current = snapshotPayload(useSettlementDraftStore.getState());

    const unsub = useSettlementDraftStore.subscribe((s) => {
      const next = snapshotPayload(s);
      if (next === lastSavedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const toSave = next; // closure 시점 값
        setStatus('saving');
        try {
          const res = await upsertRef.current.mutateAsync({
            placeId: placeIdRef.current,
            placeNameHint: placeNameHintRef.current,
            payload: JSON.parse(toSave),
          });
          lastSavedRef.current = toSave;
          setDraftId(res.id);
          setSavedAt(new Date());
          setStatus('saved');
        } catch {
          setStatus('error');
        }
      }, debounceMs);
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      unsub();
    };
  }, [enabled, isAuthed, hydrated, debounceMs]);

  return { status, savedAt, draftId };
};

export interface DraftHydrateResult {
  // 서버 조회 완료 (성공/실패 모두 포함). 자동 저장 활성화 신호.
  hydrated: boolean;
  // hydrate 에 실제로 사용된 draft (있으면). 자동 저장 hook 에 draftId 초기값
  // 으로 줘서 저장 후 정산 완료 시 fromDraftId 로 넘긴다.
  matched: SettlementDraftType | null;
}

// 진입 시 서버 draft 가 있으면 store 를 그 값으로 overwrite. list 한 번만
// fetch 하고 끝.
export const useSettlementDraftHydrate = (
  placeId: string | null,
): DraftHydrateResult => {
  const isAuthed = useAuthStore((s) => !!s.token);
  const list = useListSettlementDrafts(isAuthed);
  const [hydrated, setHydrated] = useState(false);
  const [matched, setMatched] = useState<SettlementDraftType | null>(null);

  // 한 placeId(식당 컨텍스트)에 대해 단 한 번만 hydrate. 자동 저장이 list 를
  // invalidate→refetch 하면 list.data 가 새 참조로 와 effect 가 다시 돌지만,
  // 같은 컨텍스트라면 store 를 다시 덮어쓰지 않는다 — 저장 in-flight 중 사용자
  // 입력을 옛 서버 스냅샷이 밀어내는 좁은 레이스 + 저장마다 store 전역 리렌더
  // 방지. placeId 가 바뀌면(다른 식당 진입) 다시 hydrate 허용.
  const hydratedForRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (hydratedForRef.current === placeId) return;
    if (!isAuthed) {
      hydratedForRef.current = placeId;
      setHydrated(true);
      return;
    }
    if (list.isLoading) return;
    if (list.isError) {
      // 서버 실패 → sessionStorage 만 사용하는 모드로 진행.
      hydratedForRef.current = placeId;
      setHydrated(true);
      return;
    }
    const items = list.data?.items ?? [];
    const found =
      items.find((d) => (d.placeId ?? '') === (placeId ?? '')) ?? null;
    if (found && found.payload && typeof found.payload === 'object') {
      const p = found.payload as {
        participants?: unknown;
        rounds?: unknown;
      };
      useSettlementDraftStore.setState((prev) => ({
        ...prev,
        ...(Array.isArray(p.participants)
          ? { participants: p.participants as DraftParticipant[] }
          : {}),
        ...(Array.isArray(p.rounds)
          ? { rounds: p.rounds as DraftRound[] }
          : {}),
      }));
    }
    hydratedForRef.current = placeId;
    setMatched(found);
    setHydrated(true);
  }, [isAuthed, list.isLoading, list.isError, list.data, placeId]);

  return { hydrated, matched };
};
