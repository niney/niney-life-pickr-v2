import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  useSettlementDraftStore,
  type DraftAttendance,
  type DraftParticipant,
  type DraftRound,
  type ExcludeKey,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
}

// 차수별 exclude 옵션 편집기 — '차수 특이사항' UI.
//
// 평소엔 칩이 0개로 비어 있고 (= 모두 마스터 default 따름), '+ 추가' 로
// "<참여자>가 이 차수엔 <카테고리> <마심/안 먹음>" 같은 명시적 override 를
// 한 줄씩 누적한다. 마스터 default 와 같은 값을 추가하면 의미가 없으므로
// 표시되는 칩은 master 와 다른 override 만 (silent dedupe).
//
// 칩 ✕ 클릭 → setExcludeOverride(null) 로 마스터 default 복귀.
//
// tri-state(null/true/false) 인지부하를 사용자에게 노출하지 않는 게 핵심 —
// 평범한 사용자는 이 영역을 한 번도 안 열어보고 끝낼 수 있어야 한다.
export const RoundExceptionsEditor = ({ round, participants }: Props) => {
  const setExcludeOverride = useSettlementDraftStore((s) => s.setExcludeOverride);

  const exceptions = useMeaningfulExceptions(round, participants);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          차수 특이사항 {exceptions.length > 0 && <>({exceptions.length})</>}
        </span>
      </div>
      {exceptions.length === 0 && (
        <p className="text-xs text-muted-foreground">
          모두 마스터 설정을 따릅니다. 이 차수에만 다르면 아래에서 추가하세요.
        </p>
      )}
      {exceptions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {exceptions.map((e) => (
            <li key={`${e.participantClientId}-${e.key}`}>
              <ChipPill
                label={`${e.participantName}: ${categoryLabel(e.key)} ${valueLabel(e.key, e.value)}`}
                onRemove={() =>
                  setExcludeOverride(round.clientId, e.participantClientId, e.key, null)
                }
              />
            </li>
          ))}
        </ul>
      )}
      <AddExceptionForm round={round} participants={participants} />
    </div>
  );
};

// 추가 폼 — 닫혀 있다가 '+ 추가' 클릭 시 펼침. 추가 후 자동으로 닫힘.
const AddExceptionForm = ({
  round,
  participants,
}: {
  round: DraftRound;
  participants: DraftParticipant[];
}) => {
  const setExcludeOverride = useSettlementDraftStore((s) => s.setExcludeOverride);
  const [open, setOpen] = useState(false);
  // 첫 attended 참여자를 default. 차수에 참석자가 0명이면 폼 자체가 비활성.
  const attendedParticipants = participants.filter((p) =>
    round.attendances.find((a) => a.participantClientId === p.clientId)?.attended,
  );
  const [pid, setPid] = useState<string>(attendedParticipants[0]?.clientId ?? '');
  const [key, setKey] = useState<ExcludeKey>('excludeAlcohol');
  // value: true = '안 함/안 먹음' (exclude=true), false = '마심/먹음' (exclude=false)
  const [value, setValue] = useState<boolean>(true);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        disabled={attendedParticipants.length === 0}
        onClick={() => {
          // 폼 열 때 default 참여자를 첫 참석자로 reset.
          setPid(attendedParticipants[0]?.clientId ?? '');
          setKey('excludeAlcohol');
          setValue(true);
          setOpen(true);
        }}
      >
        <Plus className="size-3" />
        특이사항 추가
      </Button>
    );
  }

  const selectedMaster = participants.find((p) => p.clientId === pid);
  // 사용자가 master 와 같은 값을 골라도 칩은 안 보이지만, hint 로 살짝 알려주면
  // 입력 피드백이 자연스럽다.
  const masterMatch =
    selectedMaster &&
    (key === 'excludeAlcohol'
      ? selectedMaster.excludeAlcohol === value
      : key === 'excludeNonAlcohol'
        ? selectedMaster.excludeNonAlcohol === value
        : selectedMaster.excludeSide === value);

  const handleAdd = () => {
    if (!pid) return;
    setExcludeOverride(round.clientId, pid, key, value);
    setOpen(false);
  };

  return (
    <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          label="참여자"
          value={pid}
          onChange={(v) => setPid(v)}
          options={attendedParticipants.map((p, idx) => ({
            value: p.clientId,
            label: participantLabel(p, idx),
          }))}
        />
        <Select
          label="카테고리"
          value={key}
          onChange={(v) => setKey(v as ExcludeKey)}
          options={[
            { value: 'excludeAlcohol', label: '주류' },
            { value: 'excludeNonAlcohol', label: '비주류' },
            { value: 'excludeSide', label: '안주' },
          ]}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">이 차수엔</span>
          <div className="flex h-9 items-center gap-3 rounded-md border bg-background px-2 text-sm">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                checked={!value}
                onChange={() => setValue(false)}
                className="size-3.5"
              />
              {verb(key, false)}
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                checked={value}
                onChange={() => setValue(true)}
                className="size-3.5"
              />
              {verb(key, true)}
            </label>
          </div>
        </div>
      </div>
      {masterMatch && (
        <p className="text-xs text-muted-foreground">
          마스터 설정과 같아 칩은 표시되지 않습니다.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOpen(false)}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={!pid}
          onClick={handleAdd}
        >
          추가
        </Button>
      </div>
    </div>
  );
};

const ChipPill = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs',
      'border-primary/30 text-foreground',
    )}
  >
    <span>{label}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label="제거"
      className="rounded-full p-0.5 hover:bg-accent"
    >
      <X className="size-3" />
    </button>
  </span>
);

const Select = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  options: { value: string; label: string }[];
}) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

// 의미 있는 override 만 추출 — null 이거나 master 와 같은 값은 제외.
interface MeaningfulException {
  participantClientId: string;
  participantName: string;
  key: ExcludeKey;
  value: boolean; // exclude 값 (true = 안 먹음/안 함)
}

const useMeaningfulExceptions = (
  round: DraftRound,
  participants: DraftParticipant[],
): MeaningfulException[] => {
  const out: MeaningfulException[] = [];
  const pById = new Map(participants.map((p, idx) => [p.clientId, { p, idx }]));
  for (const a of round.attendances) {
    const ref = pById.get(a.participantClientId);
    if (!ref) continue;
    const name = participantLabel(ref.p, ref.idx);
    pushIfMeaningful(out, a, ref.p, name, 'excludeAlcohol', 'excludeAlcoholOverride');
    pushIfMeaningful(out, a, ref.p, name, 'excludeNonAlcohol', 'excludeNonAlcoholOverride');
    pushIfMeaningful(out, a, ref.p, name, 'excludeSide', 'excludeSideOverride');
  }
  return out;
};

const pushIfMeaningful = (
  out: MeaningfulException[],
  a: DraftAttendance,
  master: DraftParticipant,
  name: string,
  key: ExcludeKey,
  overrideKey: 'excludeAlcoholOverride' | 'excludeNonAlcoholOverride' | 'excludeSideOverride',
): void => {
  const override = a[overrideKey];
  if (override === null) return;
  // 마스터와 같은 값으로 박혀 있으면 의미 없음 — 표시 안 함.
  const masterVal =
    key === 'excludeAlcohol'
      ? master.excludeAlcohol
      : key === 'excludeNonAlcohol'
        ? master.excludeNonAlcohol
        : master.excludeSide;
  if (override === masterVal) return;
  out.push({
    participantClientId: a.participantClientId,
    participantName: name,
    key,
    value: override,
  });
};

const participantLabel = (
  p: { name: string | null; nickname: string | null },
  idx: number,
): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

const categoryLabel = (key: ExcludeKey): string => {
  if (key === 'excludeAlcohol') return '주류';
  if (key === 'excludeNonAlcohol') return '비주류';
  return '안주';
};

// 카테고리별 자연어 동사 — 술/비주류는 '마심/안 함', 안주는 '먹음/안 먹음'.
const verb = (key: ExcludeKey, exclude: boolean): string => {
  if (key === 'excludeSide') return exclude ? '안 먹음' : '먹음';
  return exclude ? '안 함' : '마심';
};

// 칩에서 보이는 값 표현 — verb 와 같음 (예: '주류 안 함').
const valueLabel = (key: ExcludeKey, exclude: boolean): string => verb(key, exclude);
