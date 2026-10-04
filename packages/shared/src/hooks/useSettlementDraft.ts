import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  utf8ByteLength,
  type GetSettlementDraftResultType,
  type ListSettlementDraftsResultType,
  type SettlementDraftType,
  type UpsertSettlementDraftInputType,
  type UpsertSettlementDraftResultType,
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
// 만 사용. 목록은 메타만(payload 제외), 이어쓰기 payload 는 슬롯 단건 조회로.

const KEY = ['settlement-draft'] as const;
const byPlaceKey = (placeId: string | null) => [...KEY, 'by-place', placeId ?? ''] as const;

export const useListSettlementDrafts = (enabled = true) =>
  useQuery({
    queryKey: [...KEY, 'list'],
    queryFn: () => settlementDraftApi.list(),
    enabled,
    // 같은 사용자가 다른 기기에서 편집 중일 수 있어 stale 시간을 짧게.
    staleTime: 30_000,
  });

// 이어쓰기 단건 — 진입할 때마다 서버 최신을 받는다(staleTime 0, 다른 기기 편집 반영). 저장 성공 시
// 아래 upsert 가 이 캐시를 방금 보낸 payload 로 갱신한다.
export const useSettlementDraftByPlace = (placeId: string | null, enabled = true) =>
  useQuery({
    queryKey: byPlaceKey(placeId),
    queryFn: () => settlementDraftApi.getByPlace(placeId),
    enabled,
    staleTime: 0,
  });

// 저장 결과를 캐시에 반영 — 응답은 id·updatedAt 만이라 방금 보낸 입력으로 채운다. 순수 함수로 두어 테스트한다.
export const applySavedDraft = (
  saved: UpsertSettlementDraftResultType,
  input: UpsertSettlementDraftInputType,
  prev: { list?: ListSettlementDraftsResultType; byPlace?: GetSettlementDraftResultType },
): {
  list: ListSettlementDraftsResultType | undefined;
  listHasItem: boolean;
  byPlace: GetSettlementDraftResultType;
} => {
  const placeNameHint = input.placeNameHint?.trim() || null;
  const hit = prev.list?.items.find((d) => d.id === saved.id);
  return {
    // 최신(updatedAt desc)이 맨 앞. 목록에 없던 새 슬롯이면 호출자가 무효화해 다시 받는다.
    list:
      prev.list && hit
        ? {
            items: [
              {
                ...hit,
                placeNameHint,
                updatedAt: saved.updatedAt,
                byteSize: utf8ByteLength(JSON.stringify(input.payload ?? null)),
              },
              ...prev.list.items.filter((d) => d.id !== saved.id),
            ],
          }
        : prev.list,
    listHasItem: !!hit,
    byPlace: {
      draft: {
        id: saved.id,
        placeId: input.placeId,
        placeNameHint,
        payload: input.payload,
        createdAt: prev.byPlace?.draft?.createdAt ?? saved.updatedAt,
        updatedAt: saved.updatedAt,
      },
    },
  };
};

export const useUpsertSettlementDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertSettlementDraftInputType) =>
      settlementDraftApi.upsert(input),
    // 자동저장마다 refetch 하지 않고 캐시를 국소 갱신한다 — 같은 화면 재진입 때 옛 서버 스냅샷으로
    // 되돌아가지 않게 이어쓰기 캐시를, 이력 화면이 떠 있을 때를 위해 목록 메타를.
    onSuccess: (saved, input) => {
      const listKey = [...KEY, 'list'];
      const next = applySavedDraft(saved, input, {
        list: qc.getQueryData<ListSettlementDraftsResultType>(listKey),
        byPlace: qc.getQueryData<GetSettlementDraftResultType>(byPlaceKey(input.placeId)),
      });
      qc.setQueryData(byPlaceKey(input.placeId), next.byPlace);
      if (next.listHasItem) qc.setQueryData(listKey, next.list);
      else void qc.invalidateQueries({ queryKey: listKey });
    },
  });
};

export const useDeleteSettlementDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settlementDraftApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
      // 지운 draft 가 이어쓰기 캐시에 남아 재진입 때 되살아나지 않게.
      qc.removeQueries({ queryKey: [...KEY, 'by-place'] });
    },
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

    const unsub = useSettlementDraftStore.subscribe(() => {
      // 변경마다 초안 전체를 직렬화해 비교하지 않는다 — 이 구독은 키 입력 한 번마다
      // 불린다. 여기선 타이머만 다시 걸고, 직렬화·비교는 타이머가 터질 때 그 시점의
      // 최신 상태로 한 번만 한다. 고쳤다가 되돌린 경우엔 저장할 것이 없어 요청도
      // 나가지 않는다(예전엔 되돌리기 전의 중간 상태가 그대로 저장됐다).
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const toSave = snapshotPayload(useSettlementDraftStore.getState());
        if (toSave === lastSavedRef.current) return;
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

// 진입 시 서버 draft 가 있으면 store 를 그 값으로 overwrite. 그 슬롯 하나만
// fetch 하고 끝(목록은 메타만 오므로 쓰지 않는다).
//
// `enabled: false` 면 슬롯을 부르지도, store 를 건드리지도 않는다 — 저장된 정산을
// 고치는 수정 모드용. 수정 모드는 저장된 세션이 source of truth 다. placeId 자리에
// null 을 넘기는 것으로는 꺼지지 않는다: null 은 "식당 미지정 슬롯" 이라 그 슬롯에
// 남아 있던 임시저장이 편집 중인 정산 내용을 덮어쓴다(세션이 먼저 채워지고 슬롯
// 응답이 뒤에 오면 그대로 재현).
export const useSettlementDraftHydrate = (
  placeId: string | null,
  options: { enabled?: boolean } = {},
): DraftHydrateResult => {
  const enabled = options.enabled ?? true;
  const isAuthed = useAuthStore((s) => !!s.token);
  const slot = useSettlementDraftByPlace(placeId, enabled && isAuthed);
  const [hydrated, setHydrated] = useState(false);
  const [matched, setMatched] = useState<SettlementDraftType | null>(null);

  // 한 placeId(식당 컨텍스트)에 대해 단 한 번만 hydrate. 자동 저장이 캐시를
  // 갱신하면 slot.data 가 새 참조로 와 effect 가 다시 돌지만,
  // 같은 컨텍스트라면 store 를 다시 덮어쓰지 않는다 — 저장 in-flight 중 사용자
  // 입력을 옛 서버 스냅샷이 밀어내는 좁은 레이스 + 저장마다 store 전역 리렌더
  // 방지. placeId 가 바뀌면(다른 식당 진입) 다시 hydrate 허용.
  const hydratedForRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    if (hydratedForRef.current === placeId) return;
    if (!isAuthed) {
      hydratedForRef.current = placeId;
      setHydrated(true);
      return;
    }
    // 캐시가 있어도 진입 시 다시 받는 중이면 그 결과를 기다린다(다른 기기 편집·삭제 반영).
    if (slot.isLoading || slot.isFetching) return;
    if (slot.isError) {
      // 서버 실패 → sessionStorage 만 사용하는 모드로 진행.
      hydratedForRef.current = placeId;
      setHydrated(true);
      return;
    }
    const found = slot.data?.draft ?? null;
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
  }, [enabled, isAuthed, slot.isLoading, slot.isFetching, slot.isError, slot.data, placeId]);

  // 꺼져 있는 동안엔 켜져 있던 때의 결과가 state 에 남아 있어도 내보내지 않는다.
  return enabled ? { hydrated, matched } : { hydrated: false, matched: null };
};
