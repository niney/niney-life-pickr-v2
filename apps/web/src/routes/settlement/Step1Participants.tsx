import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSettlementDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  onNext: () => void;
}

// 첫 단계 — 정산에 참여할 사람(이름 또는 닉네임 + 카테고리 제외 플래그) 입력.
// 인원 1명 이상 + 각 행 이름/닉네임 중 하나 채워져 있을 때만 다음 단계로.
export const Step1Participants = ({ onNext }: Props) => {
  const participants = useSettlementDraftStore((s) => s.participants);
  const addParticipant = useSettlementDraftStore((s) => s.addParticipant);
  const updateParticipant = useSettlementDraftStore((s) => s.updateParticipant);
  const removeParticipant = useSettlementDraftStore((s) => s.removeParticipant);

  const [submitAttempt, setSubmitAttempt] = useState(false);

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((p) => {
      const nm = (p.name ?? '').trim();
      const nick = (p.nickname ?? '').trim();
      if (nm.length === 0 && nick.length === 0) {
        map.set(p.clientId, '이름 또는 닉네임 중 하나는 입력해 주세요.');
      }
    });
    return map;
  }, [participants]);

  const canProceed = participants.length > 0 && errors.size === 0;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">참여자</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          누구끼리 나눌까요? 이름 또는 닉네임 중 하나만 채워도 됩니다. 술/안주 등 특이사항은
          체크박스로 표시하면 해당 카테고리는 그 사람을 제외하고 나눠 부담합니다.
        </p>
      </div>

      <div className="space-y-3">
        {participants.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 참여자가 없습니다. 아래 버튼으로 추가하세요.
          </div>
        )}
        {participants.map((p, idx) => {
          const err = errors.get(p.clientId);
          return (
            <div
              key={p.clientId}
              className="rounded-lg border bg-card p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  #{idx + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="삭제"
                  onClick={() => removeParticipant(p.clientId)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="이름">
                  <Input
                    type="text"
                    value={p.name ?? ''}
                    placeholder="홍길동"
                    onChange={(e) =>
                      updateParticipant(p.clientId, { name: e.target.value })
                    }
                  />
                </Field>
                <Field label="닉네임">
                  <Input
                    type="text"
                    value={p.nickname ?? ''}
                    placeholder="길동이"
                    onChange={(e) =>
                      updateParticipant(p.clientId, { nickname: e.target.value })
                    }
                  />
                </Field>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <ExcludeToggle
                  label="주류 안 함"
                  checked={p.excludeAlcohol}
                  onChange={(v) => updateParticipant(p.clientId, { excludeAlcohol: v })}
                />
                <ExcludeToggle
                  label="비주류 안 함"
                  checked={p.excludeNonAlcohol}
                  onChange={(v) => updateParticipant(p.clientId, { excludeNonAlcohol: v })}
                />
                <ExcludeToggle
                  label="안주 안 먹음"
                  checked={p.excludeSide}
                  onChange={(v) => updateParticipant(p.clientId, { excludeSide: v })}
                />
              </div>

              {submitAttempt && err && (
                <p className="mt-2 text-xs text-destructive">{err}</p>
              )}
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            addParticipant({
              name: '',
              nickname: '',
              excludeAlcohol: false,
              excludeNonAlcohol: false,
              excludeSide: false,
            })
          }
        >
          <Plus className="size-4" />
          참여자 추가
        </Button>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          disabled={!canProceed && submitAttempt}
          onClick={() => {
            setSubmitAttempt(true);
            if (canProceed) onNext();
          }}
        >
          다음
        </Button>
      </div>
    </section>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    {children}
  </label>
);

const ExcludeToggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) => (
  <label className="flex items-center gap-1.5">
    <input
      type="checkbox"
      className="size-4"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span>{label}</span>
  </label>
);
