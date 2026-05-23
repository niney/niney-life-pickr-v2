import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useRestaurantPublic, useSettlementDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Step1Participants } from './Step1Participants';
import { Step2Source } from './Step2Source';

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
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2.5">
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
        <StepIndicator step={step} />
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
              onNext={() => setStep('source')}
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
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              항목 편집 단계는 다음 PR 에서 구현됩니다.
            </div>
          )}
          {step === 'review' && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              결과·저장 단계는 다음 PR 에서 구현됩니다.
            </div>
          )}
        </div>
      )}
    </main>
  );
};

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'participants', label: '1. 인원' },
  { key: 'source', label: '2. 입력 방식' },
  { key: 'edit', label: '3. 항목 편집' },
  { key: 'review', label: '4. 결과' },
];

const StepIndicator = ({ step }: { step: StepKey }) => {
  const idx = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="hidden text-xs text-muted-foreground sm:block">
      {STEPS[idx]?.label} / 4
    </div>
  );
};
