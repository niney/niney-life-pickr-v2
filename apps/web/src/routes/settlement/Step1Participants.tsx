import { useMemo, useState } from 'react';
import { Plus, Trash2, UserRoundPlus } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { ContactPickerDialog } from './ContactPickerDialog';
import { ContactSuggestions } from './ContactSuggestions';

interface Props {
  onNext: () => void;
}

// 첫 단계 — 정산에 참여할 사람(이름 또는 닉네임 + 카테고리 제외 플래그) 입력.
// 인원 1명 이상 + 각 행 이름/닉네임 중 하나 채워져 있을 때만 다음 단계로.
export const Step1Participants = ({ onNext }: Props) => {
  const participants = useSettlementDraftStore((s) => s.participants);
  const addParticipant = useSettlementDraftStore((s) => s.addParticipant);
  const addParticipantsAndCompact = useSettlementDraftStore(
    (s) => s.addParticipantsAndCompact,
  );
  const updateParticipant = useSettlementDraftStore((s) => s.updateParticipant);
  const removeParticipant = useSettlementDraftStore((s) => s.removeParticipant);

  const [submitAttempt, setSubmitAttempt] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 어느 행의 이름 input 이 focus 인지 — 자동완성 드롭다운을 그 행에만 보여
  // 주기 위해 1개만 추적. blur 가 풀리면 null. 직접 단골을 고른 직후엔
  // 드롭다운을 다시 띄우지 않도록 null 로 리셋.
  const [focusedClientId, setFocusedClientId] = useState<string | null>(null);

  // 단골을 자동완성에서 고르면 그 row 의 모든 입력값을 단골 값으로 채운다.
  // contactId 는 서버 hint 용으로 같이 보존(서버는 결국 normalizedKey 로 다시
  // 매칭하지만, 그래도 hint 가 있으면 의도를 명시).
  const pickContact = (clientId: string, c: SettlementContactType) => {
    updateParticipant(clientId, {
      name: c.name ?? '',
      nickname: c.nickname ?? '',
      excludeAlcohol: c.lastExcludeAlcohol,
      excludeNonAlcohol: c.lastExcludeNonAlcohol,
      excludeSide: c.lastExcludeSide,
      contactId: c.id,
    });
    setFocusedClientId(null);
  };

  // 모달에서 다중 선택 추가. 이미 추가된 단골 식별용으로 contactId 와
  // normalizedKey 두 세트 — 자동완성 안 거치고 같은 이름을 직접 타이핑한
  // 행도 중복 후보에서 제외된다.
  const existingContactIds = useMemo(
    () =>
      new Set(
        participants
          .map((p) => p.contactId)
          .filter((id): id is string => !!id),
      ),
    [participants],
  );
  const existingKeys = useMemo(
    () =>
      new Set(
        participants.map((p) =>
          normalizeContactKey(p.name ?? null, p.nickname ?? null),
        ),
      ),
    [participants],
  );

  const handleBulkAdd = (picked: SettlementContactType[]) => {
    addParticipantsAndCompact(
      picked.map((c) => ({
        name: c.name ?? '',
        nickname: c.nickname ?? '',
        excludeAlcohol: c.lastExcludeAlcohol,
        excludeNonAlcohol: c.lastExcludeNonAlcohol,
        excludeSide: c.lastExcludeSide,
        contactId: c.id,
      })),
    );
  };

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
                  {/* 자동완성 드롭다운을 input 바로 아래에 absolute 배치하기 위해
                      relative wrapper. 닉네임 input 은 검색어로는 작동하지만
                      드롭다운 자체는 이름 input 쪽에서만 띄운다 — 화면 1줄에
                      두 개를 띄우면 어수선해서. */}
                  <div className="relative">
                    <Input
                      type="text"
                      value={p.name ?? ''}
                      placeholder="홍길동"
                      onFocus={() => setFocusedClientId(p.clientId)}
                      // blur 가 mousedown 보다 늦게 발동하도록 microtask 늦춤 —
                      // ContactSuggestions 의 onMouseDown 이 먼저 잡혀 클릭이
                      // 정상 처리된다.
                      onBlur={() => {
                        window.setTimeout(() => {
                          setFocusedClientId((cur) =>
                            cur === p.clientId ? null : cur,
                          );
                        }, 0);
                      }}
                      onChange={(e) =>
                        // 사용자가 이름을 직접 바꾸면 자동완성 매핑은 끊긴다.
                        // contactId 는 server hint 이고, normalizedKey 가 달라
                        // 지면 어차피 새 contact 가 만들어지므로 hint 도 같이
                        // 클리어해 의도를 명시.
                        updateParticipant(p.clientId, {
                          name: e.target.value,
                          contactId: undefined,
                        })
                      }
                    />
                    <ContactSuggestions
                      query={p.name ?? ''}
                      open={focusedClientId === p.clientId}
                      onPick={(c) => pickContact(p.clientId, c)}
                    />
                  </div>
                </Field>
                <Field label="닉네임">
                  <Input
                    type="text"
                    value={p.nickname ?? ''}
                    placeholder="길동이"
                    onChange={(e) =>
                      updateParticipant(p.clientId, {
                        nickname: e.target.value,
                        contactId: undefined,
                      })
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

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPickerOpen(true)}
          >
            <UserRoundPlus className="size-4" />
            단골에서 추가
          </Button>
        </div>
      </div>

      <ContactPickerDialog
        open={pickerOpen}
        existingContactIds={existingContactIds}
        existingKeys={existingKeys}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleBulkAdd}
      />

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

// 서버 settlement.service.normalizeContactKey 와 동일 정의 — 사용자가
// 자동완성 안 거치고 같은 이름을 직접 타이핑한 경우도 단골 모달에서
// 중복으로 인식하기 위해 사용.
const normalizeContactKey = (
  name: string | null,
  nickname: string | null,
): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
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
