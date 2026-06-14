import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import {
  useRestaurantPublic,
  useSettlement,
  useSettlementDraftAutoSync,
  useSettlementDraftHydrate,
  useSettlementDraftStore,
  type DraftRound,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { Step1Participants } from './Step1Participants';
import { Step2Rounds } from './Step2Rounds';
import { Step3Edit } from './Step3Edit';
import { Step4Review } from './Step4Review';

export type StepKey = 'participants' | 'rounds' | 'edit' | 'review';

// 정산 입력 페이지 — create 와 edit 두 모드 지원.
//
// 진입 경로:
// - /restaurants/:placeId/settle/new   → create, 1차 식당 prefill
// - /me/settlements/new                → create, 식당 비어 있음 (Step2 에서 검색)
// - /restaurants/:placeId/settle/:id/edit → edit, 저장된 세션을 draft 로 복원
//
// step 은 page-local state — 새로고침 시 1단계로 돌아가지만 draftStore 가
// 입력값을 보존한다.
export const SettlementNewPage = () => {
  const { placeId, id } = useParams<{ placeId?: string; id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const draft = useSettlementDraftStore();
  const reset = useSettlementDraftStore((s) => s.reset);
  const startFor = useSettlementDraftStore((s) => s.startFor);
  const startFromScratch = useSettlementDraftStore((s) => s.startFromScratch);

  // 1차 식당이 url 로 들어왔으면 그 식당 detail 을 fetch — placeName 을
  // store 에 prefill 하려면 필요. 독립 진입(/me/settlements/new) 이면 fetch 안 함.
  const firstPlaceDetail = useRestaurantPublic(placeId ?? null);

  // 편집 모드: 저장된 세션 fetch 해 draft 로 hydrate.
  const session = useSettlement(isEdit ? (id ?? null) : null);

  const [step, setStep] = useState<StepKey>('participants');

  // create 진입 시 store 초기화 정책.
  useEffect(() => {
    if (isEdit) return; // edit hydrate effect 에서 처리
    if (placeId) {
      // 식당 detail 이 와야 placeName 까지 prefill. 일단 placeId 만으로 startFor
      // 호출하면 같은 식당 draft 는 보존 — placeName 은 detail 도착 시 갱신.
      const name = firstPlaceDetail.data?.name ?? '';
      startFor(placeId, name);
    } else {
      startFromScratch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, firstPlaceDetail.data?.name, isEdit]);

  // create 모드: 서버 draft 가 있으면 store 로 hydrate. edit 모드는 별도
  // 로직(아래) — 저장된 세션이 source of truth.
  const draftHydrate = useSettlementDraftHydrate(
    !isEdit ? (placeId ?? null) : null,
  );
  const autoSync = useSettlementDraftAutoSync({
    placeId: placeId ?? null,
    placeNameHint: firstPlaceDetail.data?.name ?? draft.rounds[0]?.placeName ?? null,
    hydrated: !isEdit && draftHydrate.hydrated,
    initialDraftId: draftHydrate.matched?.id ?? null,
    enabled: !isEdit,
  });

  // edit 모드: 세션이 도착하면 draft 로 hydrate (1번만).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!isEdit) return;
    if (hydrated) return;
    if (!session.data) return;
    const s = session.data;
    // 새로 draft 만들고 마스터 + rounds 채우기.
    reset();
    // store API 가 setRounds/setParticipants 같은 bulk setter 가 없어서
    // 직접 state 를 만들어 zustand setState 로 한 번에. 이 시점엔 모든 round
    // 의 attendances 가 마스터 참여자와 1:1 매칭되어 있어야 동기화 OK.
    const participantsDraft = s.participants.map((p) => ({
      clientId: `p-${p.id}`,
      name: p.name,
      nickname: p.nickname,
      excludeAlcohol: p.excludeAlcohol,
      excludeNonAlcohol: p.excludeNonAlcohol,
      excludeSide: p.excludeSide,
      contactId: p.contactId ?? undefined,
    }));
    // id → clientId 매핑 (round.attendees 가 db id 로 참조 중).
    const dbIdToClientId = new Map(
      s.participants.map((p) => [p.id, `p-${p.id}`]),
    );
    const roundsDraft: DraftRound[] = s.rounds.map((r) => ({
      clientId: `r-${r.id}`,
      placeId: r.restaurantPlaceId,
      placeName: r.restaurantName,
      source: r.source,
      items: r.items.map((it) => ({
        clientId: `i-${it.id}`,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        amount: it.amount,
        category: it.category,
        matchedMenuName: it.matchedMenuName,
      })),
      // 서버가 소유자 응답에 receiptImageToken 을 돌려주므로 그대로 복원 —
      // 재저장(full replace)에도 영수증이 보존된다. (응답에 토큰이 없던 옛
      // 데이터는 null 이라 그 경우만 사용자가 다시 올려야 함.)
      receiptImageToken: r.receiptImageToken ?? null,
      receiptPreviewUrl: r.receiptPreviewUrl,
      totalAmount: r.totalAmount,
      warning: r.warning,
      attendances: r.attendees.map((a) => ({
        participantClientId: dbIdToClientId.get(a.participantId) ?? '',
        attended: a.attended,
        excludeAlcoholOverride: a.excludeAlcoholOverride,
        excludeNonAlcoholOverride: a.excludeNonAlcoholOverride,
        excludeSideOverride: a.excludeSideOverride,
      })),
      discountAmount: r.discountAmount,
      discountCategory: r.discountCategory,
      // 응답 categoryAdjustments 는 leftoverParticipantIds(db) → ClientIds 로 변환.
      categoryAdjustments: r.categoryAdjustments
        ? Object.fromEntries(
            Object.entries(r.categoryAdjustments)
              .filter(([, v]) => v != null)
              .map(([cat, v]) => [
                cat,
                {
                  leftoverParticipantClientIds: v!.leftoverParticipantIds
                    .map((id) => dbIdToClientId.get(id))
                    .filter((id): id is string => !!id),
                  roundUnit: v!.roundUnit,
                },
              ]),
          )
        : null,
      // 세부 분배 그룹 — itemIndexes 는 정렬된 items 의 인덱스이므로 위에서
      // 만든 `i-<id>` clientId 로, 멤버는 participantId → clientId 로 복원.
      groupSplits:
        r.groupSplits && r.groupSplits.length > 0
          ? r.groupSplits
              .map((g, gi) => ({
                clientId: `g-${r.id}-${gi}`,
                label: g.label,
                category: g.category,
                itemClientIds: g.itemIndexes
                  .map((idx) => r.items[idx]?.id)
                  .filter((itemId): itemId is string => Boolean(itemId))
                  .map((itemId) => `i-${itemId}`),
                mode: g.mode,
                members: g.members
                  .map((m) => ({
                    participantClientId: dbIdToClientId.get(m.participantId) ?? '',
                    glasses: m.glasses,
                  }))
                  .filter((m) => m.participantClientId),
              }))
              .filter((g) => g.itemClientIds.length > 0)
          : null,
    }));
    useSettlementDraftStore.setState({
      participants: participantsDraft,
      rounds: roundsDraft,
    });
    setHydrated(true);
    // 편집 진입은 보통 곧장 항목 편집/검토로 — 참여자부터 보는 것도 가능.
  }, [isEdit, session.data, hydrated, reset]);

  const handleBack = useCallback(() => {
    if (step === 'rounds') setStep('participants');
    else if (step === 'edit') setStep('rounds');
    else if (step === 'review') setStep('edit');
    else {
      // step==='participants' 의 뒤로가기. edit 모드는 결과 페이지로, create 는
      // 식당 상세로 (또는 history).
      if (isEdit && id && placeId) {
        navigate(`/restaurants/${placeId}/settle/${id}`);
      } else if (placeId) {
        navigate(`/restaurants/${placeId}`);
      } else {
        navigate('/me/settlements');
      }
    }
  }, [step, navigate, placeId, id, isEdit]);

  // 헤더 식당 라벨.
  const headerRestaurant = useMemo(() => {
    if (isEdit && session.data) return session.data.restaurantName;
    if (placeId && firstPlaceDetail.data) return firstPlaceDetail.data.name;
    if (draft.rounds[0]?.placeName) return draft.rounds[0].placeName;
    return placeId
      ? firstPlaceDetail.isLoading
        ? '불러오는 중…'
        : ''
      : '';
  }, [isEdit, session.data, placeId, firstPlaceDetail.data, firstPlaceDetail.isLoading, draft.rounds]);

  // edit 모드 hydrate 대기 — 데이터 없으면 로딩.
  if (isEdit && !hydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="mr-2 size-4 animate-spin" />
        <span className="text-sm text-muted-foreground">불러오는 중…</span>
      </main>
    );
  }

  // create 인데 placeId 가 url 에 있지만 식당이 못 와도 (404) 진행 불가.
  if (!isEdit && placeId && !firstPlaceDetail.isLoading && !firstPlaceDetail.data) {
    return (
      <main className="p-8 text-center text-sm text-destructive">
        식당 정보를 불러오지 못했습니다.
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            aria-label="뒤로"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex-1 truncate text-sm font-semibold">
            {isEdit ? '정산 수정' : '정산하기'}
            {headerRestaurant ? ` · ${headerRestaurant}` : ''}
            {draft.rounds.length > 1 && ` 외 ${draft.rounds.length - 1}곳`}
          </div>
          {!isEdit && <AutoSyncBadge status={autoSync.status} savedAt={autoSync.savedAt} />}
        </div>
        <Stepper
          step={step}
          participantsCount={draft.participants.length}
          rounds={draft.rounds}
          onJump={setStep}
        />
      </header>

      <div className="flex-1 px-4 py-6">
        {step === 'participants' && (
          <Step1Participants
            // 참여자 → 항상 차수(rounds) 단계로. round 가 이미 prefill 돼 있어도
            // 사용자가 차수 구성을 한 번 확인하고 넘어가게 한다.
            onNext={() => setStep('rounds')}
          />
        )}
        {step === 'rounds' && (
          <Step2Rounds onBack={() => setStep('participants')} onNext={() => setStep('edit')} />
        )}
        {step === 'edit' && (
          <Step3Edit onBack={() => setStep('rounds')} onNext={() => setStep('review')} />
        )}
        {step === 'review' && (
          <Step4Review
            onBack={() => setStep('edit')}
            editingId={isEdit ? id : undefined}
            fromDraftId={autoSync.draftId}
          />
        )}
      </div>
    </main>
  );
};

// 헤더에 붙는 작은 자동저장 상태 표시. saved 만 시간 같이 — saving/error/idle/
// disabled 는 라벨만. 비로그인(disabled)은 숨김.
const AutoSyncBadge = ({
  status,
  savedAt,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'disabled';
  savedAt: Date | null;
}) => {
  if (status === 'disabled' || (status === 'idle' && !savedAt)) return null;
  const label = (() => {
    if (status === 'saving') return '저장 중…';
    if (status === 'error') return '저장 실패';
    if (savedAt) {
      const hh = String(savedAt.getHours()).padStart(2, '0');
      const mm = String(savedAt.getMinutes()).padStart(2, '0');
      return `임시저장됨 · ${hh}:${mm}`;
    }
    return '';
  })();
  return (
    <span
      className={cn(
        'shrink-0 text-xs tabular-nums',
        status === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
};

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: 'participants', label: '인원', short: '1' },
  { key: 'rounds', label: '차수', short: '2' },
  { key: 'edit', label: '편집', short: '3' },
  { key: 'review', label: '결과', short: '4' },
];

// 게이팅 — 각 단계의 선행 조건이 충족되면 점프 가능.
// - participants: 항상.
// - rounds: 참여자 ≥ 1.
// - edit: 차수 ≥ 1 이고 모든 차수에 source 결정됨.
// - review: 모든 차수에 items ≥ 1.
const canJumpTo = (
  target: StepKey,
  participantsCount: number,
  rounds: DraftRound[],
): boolean => {
  switch (target) {
    case 'participants':
      return true;
    case 'rounds':
      return participantsCount > 0;
    case 'edit':
      return rounds.length > 0 && rounds.every((r) => r.source !== null);
    case 'review':
      return rounds.length > 0 && rounds.every((r) => r.items.length > 0);
  }
};

interface StepperProps {
  step: StepKey;
  participantsCount: number;
  rounds: DraftRound[];
  onJump: (key: StepKey) => void;
}

const Stepper = ({ step, participantsCount, rounds, onJump }: StepperProps) => (
  <nav
    aria-label="정산 단계"
    className="flex items-center gap-1 border-t bg-muted/30 px-2 py-1.5"
  >
    {STEPS.map((s) => {
      const isActive = s.key === step;
      const enabled = canJumpTo(s.key, participantsCount, rounds);
      return (
        <button
          key={s.key}
          type="button"
          disabled={!enabled || isActive}
          aria-current={isActive ? 'step' : undefined}
          onClick={() => onJump(s.key)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : enabled
                ? 'text-foreground hover:bg-accent'
                : 'cursor-not-allowed text-muted-foreground opacity-50',
          )}
        >
          <span className="tabular-nums">{s.short}</span>
          <span>{s.label}</span>
        </button>
      );
    })}
  </nav>
);
