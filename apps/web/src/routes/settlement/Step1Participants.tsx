import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, UserRoundPlus, X } from 'lucide-react';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementDraftStore } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { useSettlementPrefsStore } from '~/stores/settlementPrefsStore';
import { ContactPickerDialog } from './ContactPickerDialog';
import { ContactSuggestions } from './ContactSuggestions';

interface Props {
  onNext: () => void;
}

// 첫 단계 — 정산에 참여할 사람 입력. 한 행 = 한 명.
//
// 입력 UX: 기본은 단일 필드("이름")만 보임. 같은 이름의 다른 사람을 구분해야
// 하거나 단골에서 별칭이 같이 채워진 경우엔 "+ 별칭" 으로 두 번째 input 을
// 펼친다. 이렇게 하면 95% 단순 케이스는 한 칸으로 끝, 충돌·중복 케이스만
// 두 칸으로 명시한다.
//
// 자동완성은 이름 input 에서만 띄우지만 server 검색은 name + nickname 둘 다
// 매칭 — 사용자가 별칭("길동이")만 기억해 입력해도 기존 단골이 잡힌다.
export const Step1Participants = ({ onNext }: Props) => {
  const participants = useSettlementDraftStore((s) => s.participants);
  const addParticipant = useSettlementDraftStore((s) => s.addParticipant);
  const addParticipantsAndCompact = useSettlementDraftStore(
    (s) => s.addParticipantsAndCompact,
  );
  const updateParticipant = useSettlementDraftStore((s) => s.updateParticipant);
  const removeParticipant = useSettlementDraftStore((s) => s.removeParticipant);

  // 단골 픽 없이 직접 추가하는 새 행의 기본 exclude 값. 사용자가 매번 같은
  // 옵션을 반복 체크하는 부담을 줄이려는 목적. 단골에서 추가하면 단골값이
  // 우선이라 이 기본값은 무시된다.
  const newExcludes = useSettlementPrefsStore((s) => s.newParticipantExcludes);
  const setNewExclude = useSettlementPrefsStore(
    (s) => s.setNewParticipantExclude,
  );

  const [submitAttempt, setSubmitAttempt] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 어느 행의 이름 input 이 focus 인지 — 자동완성 드롭다운을 그 행에만 보여
  // 주기 위해 1개만 추적. blur 가 풀리면 null. 직접 단골을 고른 직후엔
  // 드롭다운을 다시 띄우지 않도록 null 로 리셋.
  const [focusedClientId, setFocusedClientId] = useState<string | null>(null);
  // 별칭 칸을 사용자가 명시적으로 펼친 행. nickname 이 채워진 행은 자동으로
  // 두 칸 모드라 이 Set 와 무관하게 노출.
  const [aliasOpened, setAliasOpened] = useState<Set<string>>(new Set());

  // 행마다 이름 input ref 보관 — Enter 로 새 행을 추가한 직후 그 행의 input
  // 으로 focus 를 옮기는 데 사용. participants 가 동적이라 Map 으로 관리.
  const nameRefs = useRef(new Map<string, HTMLInputElement | null>());
  // 다음 render 후 focus 할 행. effect 가 ref 로 focus 호출 후 null 로 리셋.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocusId) return;
    const el = nameRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, participants]);

  const toggleAlias = (clientId: string, open: boolean) => {
    setAliasOpened((cur) => {
      const next = new Set(cur);
      if (open) next.add(clientId);
      else next.delete(clientId);
      return next;
    });
  };

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

  // Enter: 마지막 행이면 새 참여자 추가 + 그 행으로 focus 이동, 중간 행이면
  // 다음 기존 행으로 focus 만 이동 (Tab 보조). 안전 규칙:
  // - 한글 IME 조립 중인 Enter (compositionend ↔ keydown race) 는 무시
  // - 빈 행에선 새 행 추가 안 함 (preventDefault 만 — 폼 submit 사고 방지)
  //
  // 자동완성 드롭다운은 클릭으로만 픽 (키보드 네비 미지원). Enter 가 드롭다운
  // 픽 의미가 아니므로 dropdown 열림 상태에서도 그대로 새 행 동작. 서버가
  // normalizedKey 로 contact 매칭하므로 contactId 힌트 없이 새 행으로 가도
  // 같은 단골과 자동 매칭된다.
  const handleRowEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowClientId: string,
    _isAliasInput: boolean,
  ) => {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const idx = participants.findIndex((p) => p.clientId === rowClientId);
    const p = participants[idx];
    if (!p) return;
    const nm = (p.name ?? '').trim();
    const nick = (p.nickname ?? '').trim();
    if (nm.length === 0 && nick.length === 0) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const isLast = idx === participants.length - 1;
    if (isLast) {
      const newId = addParticipant({
        name: '',
        nickname: '',
        ...newExcludes,
      });
      setPendingFocusId(newId);
    } else {
      const nextId = participants[idx + 1]?.clientId;
      if (nextId) setPendingFocusId(nextId);
    }
  };

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    participants.forEach((p) => {
      const nm = (p.name ?? '').trim();
      const nick = (p.nickname ?? '').trim();
      if (nm.length === 0 && nick.length === 0) {
        // 단일 필드 모드를 가정한 자연스러운 메시지. 별칭만 채워도 통과는
        // 한다 (기존 검증 유지).
        map.set(p.clientId, '이름을 입력해 주세요.');
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
          누구끼리 나눌까요? 한 사람당 한 줄로 추가하세요. 같은 이름이 두 명이면 "+ 별칭" 으로
          구분할 수 있고, 술/안주 등 특이사항은 체크박스로 표시하면 해당 카테고리는 그 사람을
          제외하고 나눠 부담합니다.
        </p>
      </div>

      {/* 새로 추가하는 행의 기본 exclude — 단골에서 픽한 행은 단골값이 우선
          이라 영향 없음. 자주 쓰는 옵션을 한 번 체크해 두면 매번 반복 안 해도
          된다. localStorage 라 다음 정산까지 유지. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium">새 행 기본:</span>
        <DefaultExcludeToggle
          label="주류 안 함"
          checked={newExcludes.excludeAlcohol}
          onChange={(v) => setNewExclude('excludeAlcohol', v)}
        />
        <DefaultExcludeToggle
          label="비주류 안 함"
          checked={newExcludes.excludeNonAlcohol}
          onChange={(v) => setNewExclude('excludeNonAlcohol', v)}
        />
        <DefaultExcludeToggle
          label="안주 안 먹음"
          checked={newExcludes.excludeSide}
          onChange={(v) => setNewExclude('excludeSide', v)}
        />
      </div>

      <div className="space-y-3">
        {participants.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 참여자가 없습니다. 아래 버튼으로 추가하세요.
          </div>
        )}
        {participants.map((p, idx) => {
          const err = errors.get(p.clientId);
          // nickname 이 비어있지 않으면 항상 두 칸 모드. 사용자가 명시적으로
          // 펼친 행도 마찬가지. 둘 다 아니면 단일 필드만.
          const hasNickname = (p.nickname ?? '').trim().length > 0;
          const showAlias = hasNickname || aliasOpened.has(p.clientId);
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

              {/* 단일 필드 모드 (기본) — 별칭 칸이 펼쳐진 상태면 두 칸 grid. */}
              <div
                className={
                  showAlias
                    ? 'mt-2 grid gap-2 sm:grid-cols-2'
                    : 'mt-2 flex items-start gap-2'
                }
              >
                <Field label="이름">
                  {/* 자동완성 드롭다운을 input 바로 아래에 absolute 배치하기 위해
                      relative wrapper. 단골 검색은 nickname 도 매칭하므로 사용자가
                      별칭만 알고 있어도 기존 단골이 잡힌다. */}
                  <div className="relative">
                    <Input
                      type="text"
                      value={p.name ?? ''}
                      placeholder={showAlias ? '홍길동' : '홍길동 또는 길동이'}
                      ref={(el) => {
                        // 행이 사라지면 Map 에서 제거. 같은 clientId 의 input 이
                        // 다시 마운트되면 새 ref 로 덮어쓴다.
                        if (el) nameRefs.current.set(p.clientId, el);
                        else nameRefs.current.delete(p.clientId);
                      }}
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
                      onKeyDown={(e) => handleRowEnter(e, p.clientId, false)}
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

                {showAlias ? (
                  <Field label="별칭">
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={p.nickname ?? ''}
                        placeholder="길동이"
                        onKeyDown={(e) => handleRowEnter(e, p.clientId, true)}
                        onChange={(e) =>
                          updateParticipant(p.clientId, {
                            nickname: e.target.value,
                            contactId: undefined,
                          })
                        }
                      />
                      {/* nickname 이 비어 있을 때만 접을 수 있게 — 값이 있는데
                          접으면 입력값이 안 보이는 게 헷갈리므로. */}
                      {!hasNickname && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label="별칭 칸 닫기"
                          onClick={() => toggleAlias(p.clientId, false)}
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  </Field>
                ) : (
                  // 단일 필드 모드의 "+ 별칭" 토글. 같은 이름이 둘 있어 구분이
                  // 필요할 때만 사용자가 명시적으로 펼친다.
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-5 h-9 shrink-0 gap-1 text-xs text-muted-foreground"
                    onClick={() => toggleAlias(p.clientId, true)}
                  >
                    <Plus className="size-3" />
                    별칭
                  </Button>
                )}
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
                ...newExcludes,
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
  <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
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

// 새 행 기본값 row 의 칩 — 메인 ExcludeToggle 보다 작고 회색조.
const DefaultExcludeToggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) => (
  <label className="flex cursor-pointer items-center gap-1">
    <input
      type="checkbox"
      className="size-3.5"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className={checked ? 'text-foreground' : ''}>{label}</span>
  </label>
);
