import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { SettlementSourceType } from '@repo/api-contract';
import { useRestaurantPublic, useSettlementDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { Step1Participants } from './Step1Participants';
import { Step2Source } from './Step2Source';
import { Step3Edit } from './Step3Edit';
import { Step4Review } from './Step4Review';

export type StepKey = 'participants' | 'source' | 'edit' | 'review';

// 정산하기 다단계 페이지. step 은 page-local state — 새로고침 시 1단계로
// 돌아가지만 draftStore 가 입력값을 보존한다. 더 큰 단계 동기화가 필요해지면
// ?step= 쿼리로 옮기는 것이 안전.
export const SettlementNewPage = () => {
  const { placeId = '' } = useParams<{ placeId: string }>();
  const navigate = useNavigate();
  const detail = useRestaurantPublic(placeId);
  const draft = useSettlementDraftStore();

  const [step, setStep] = useState<StepKey>('participants');

  // 식당이 바뀌면 새 draft 로 reset. 같은 식당이면 진행 중인 입력 보존.
  useEffect(() => {
    if (!placeId) return;
    draft.startFor(placeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  const handleBack = useCallback(() => {
    if (step === 'source') setStep('participants');
    else if (step === 'edit') setStep('source');
    else if (step === 'review') setStep('edit');
    else navigate(`/restaurants/${placeId}`);
  }, [step, navigate, placeId]);

  if (!placeId) return null;

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
            정산하기 · {detail.data?.name ?? (detail.isLoading ? '불러오는 중…' : '')}
          </div>
        </div>
        <Stepper
          step={step}
          source={draft.source}
          participantsCount={draft.participants.length}
          itemsCount={draft.items.length}
          onJump={setStep}
        />
      </header>

      {detail.isLoading && !detail.data ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> 불러오는 중…
        </div>
      ) : !detail.data ? (
        <div className="p-8 text-center text-sm text-destructive">
          식당 정보를 불러오지 못했습니다.
        </div>
      ) : (
        <div className="flex-1 px-4 py-6">
          {step === 'participants' && (
            <Step1Participants
              // 이미 한 번 입력 흐름을 마치고 참여자 편집을 위해 돌아온 경우엔
              // Step2(입력 방식 선택) 를 다시 거치지 않고 항목 편집으로 직행.
              // 그래야 영수증 사진을 다시 올리지 않아도 된다.
              onNext={() => setStep(draft.source ? 'edit' : 'source')}
            />
          )}
          {step === 'source' && (
            <Step2Source
              placeId={placeId}
              onBack={() => setStep('participants')}
              onProceedToEdit={() => setStep('edit')}
            />
          )}
          {step === 'edit' && (
            <Step3Edit
              menus={detail.data.menus}
              onBack={() => setStep('source')}
              onNext={() => setStep('review')}
            />
          )}
          {step === 'review' && (
            <Step4Review
              placeId={placeId}
              onBack={() => setStep('edit')}
            />
          )}
        </div>
      )}
    </main>
  );
};

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: 'participants', label: '인원', short: '1' },
  { key: 'source', label: '방식', short: '2' },
  { key: 'edit', label: '편집', short: '3' },
  { key: 'review', label: '결과', short: '4' },
];

// 게이팅 — 각 단계의 선행 조건이 충족되면 점프 가능. "완료된 단계만 자유롭게"
// 정책: Step N+1 은 Step N 의 산출물이 draft 에 있을 때 활성화.
const canJumpTo = (
  target: StepKey,
  source: SettlementSourceType | null,
  participantsCount: number,
  itemsCount: number,
): boolean => {
  switch (target) {
    case 'participants':
      return true;
    case 'source':
      return participantsCount > 0;
    case 'edit':
      return source != null;
    case 'review':
      return itemsCount > 0;
  }
};

interface StepperProps {
  step: StepKey;
  source: SettlementSourceType | null;
  participantsCount: number;
  itemsCount: number;
  onJump: (key: StepKey) => void;
}

const Stepper = ({ step, source, participantsCount, itemsCount, onJump }: StepperProps) => (
  <nav
    aria-label="정산 단계"
    className="flex items-center gap-1 border-t bg-muted/30 px-2 py-1.5"
  >
    {STEPS.map((s) => {
      const isActive = s.key === step;
      const enabled = canJumpTo(s.key, source, participantsCount, itemsCount);
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
