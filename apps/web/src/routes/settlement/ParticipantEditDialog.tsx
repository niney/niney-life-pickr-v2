import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Users, X } from 'lucide-react';
import type { SettlementParticipantType } from '@repo/api-contract';
import { ApiError, useUpdateSettlementParticipants } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

interface Props {
  open: boolean;
  sessionId: string;
  initial: SettlementParticipantType[];
  onClose(): void;
  // 저장 성공 시 호출 — 호출자는 보통 다이얼로그 닫기만. 갱신된 세션 데이터는
  // useUpdateSettlementParticipants 의 onSuccess 가 캐시에 이미 반영해 둔다.
  onSaved?(): void;
}

interface EditRow {
  clientId: string;
  name: string;
  nickname: string;
  excludeAlcohol: boolean;
  excludeNonAlcohol: boolean;
  excludeSide: boolean;
}

const newClientId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const toRow = (p: SettlementParticipantType): EditRow => ({
  clientId: p.id,
  name: p.name ?? '',
  nickname: p.nickname ?? '',
  excludeAlcohol: p.excludeAlcohol,
  excludeNonAlcohol: p.excludeNonAlcohol,
  excludeSide: p.excludeSide,
});

// 저장된 정산의 참여자/옵션을 수정하는 다이얼로그. items 는 건드리지 않고
// participants 배열만 PATCH. 서버가 받아 calculateShares 로 shareAmount 재계산.
// Step1Participants 와 달리 단골 자동완성/모달은 이 다이얼로그에서는 생략 —
// 이미 한 번 저장된 세션이라 단골 적립도 끝났고, 이름·옵션 정정이 주 용도라
// UI 를 단순하게 유지.
export const ParticipantEditDialog = ({
  open,
  sessionId,
  initial,
  onClose,
  onSaved,
}: Props) => {
  const update = useUpdateSettlementParticipants();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [submitAttempt, setSubmitAttempt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그가 열릴 때마다 현재 참여자로 초기화. 외부 prop(initial) 동기화 →
  // useEffect 가 맞다.
  useEffect(() => {
    if (!open) return;
    setRows(initial.map(toRow));
    setSubmitAttempt(false);
    setError(null);
  }, [open, initial]);

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !update.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, update.isPending]);

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.name.trim().length === 0 && r.nickname.trim().length === 0) {
        map.set(r.clientId, '이름 또는 닉네임 중 하나는 입력해 주세요.');
      }
    });
    return map;
  }, [rows]);

  if (!open) return null;

  const updateRow = (clientId: string, patch: Partial<EditRow>) => {
    setRows((cur) => cur.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setRows((cur) => [
      ...cur,
      {
        clientId: newClientId(),
        name: '',
        nickname: '',
        excludeAlcohol: false,
        excludeNonAlcohol: false,
        excludeSide: false,
      },
    ]);
  };
  const removeRow = (clientId: string) => {
    setRows((cur) => cur.filter((r) => r.clientId !== clientId));
  };

  const canSave = rows.length > 0 && errors.size === 0;

  const handleSave = async () => {
    setSubmitAttempt(true);
    if (!canSave) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: sessionId,
        input: {
          participants: rows.map((r) => ({
            name: r.name.trim() || null,
            nickname: r.nickname.trim() || null,
            excludeAlcohol: r.excludeAlcohol,
            excludeNonAlcohol: r.excludeNonAlcohol,
            excludeSide: r.excludeSide,
          })),
        },
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="참여자 수정"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={update.isPending ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 rounded-t-lg bg-background p-4 shadow-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4" />
            참여자 수정
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={update.isPending}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          참여자와 제외 옵션만 수정합니다. 항목·금액은 그대로 유지되고 분담액만 자동으로 다시 계산돼요.
        </p>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {rows.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              참여자가 없습니다. 아래 버튼으로 추가하세요.
            </div>
          )}
          {rows.map((r, idx) => {
            const err = errors.get(r.clientId);
            return (
              <div
                key={r.clientId}
                className="rounded-lg border bg-card p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">#{idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="삭제"
                    onClick={() => removeRow(r.clientId)}
                    disabled={update.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="이름">
                    <Input
                      type="text"
                      value={r.name}
                      placeholder="홍길동"
                      onChange={(e) => updateRow(r.clientId, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="닉네임">
                    <Input
                      type="text"
                      value={r.nickname}
                      placeholder="길동이"
                      onChange={(e) => updateRow(r.clientId, { nickname: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  <ExcludeToggle
                    label="주류 안 함"
                    checked={r.excludeAlcohol}
                    onChange={(v) => updateRow(r.clientId, { excludeAlcohol: v })}
                  />
                  <ExcludeToggle
                    label="비주류 안 함"
                    checked={r.excludeNonAlcohol}
                    onChange={(v) => updateRow(r.clientId, { excludeNonAlcohol: v })}
                  />
                  <ExcludeToggle
                    label="안주 안 먹음"
                    checked={r.excludeSide}
                    onChange={(v) => updateRow(r.clientId, { excludeSide: v })}
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
            onClick={addRow}
            disabled={update.isPending}
          >
            <Plus className="size-4" />
            참여자 추가
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={update.isPending}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={update.isPending || (submitAttempt && !canSave)}
          >
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            저장
          </Button>
        </div>
      </div>
    </div>
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
