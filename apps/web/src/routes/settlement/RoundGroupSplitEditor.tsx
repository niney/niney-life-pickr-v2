import { useMemo, useState } from 'react';
import { Check, Minus, Plus, Trash2, Wand2 } from 'lucide-react';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  isEligibleGroupMember,
  isGroupableCategory,
  suggestItemGroups,
  useSettlementDraftStore,
  type DraftItem,
  type DraftItemGroup,
  type DraftParticipant,
  type DraftRound,
  type GroupableCategoryType,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

// 세부 분배 에디터 — 주류/음료 풀에서 소주·맥주 같은 항목 그룹을 떼어내
// 그룹 멤버끼리 균등 또는 잔수(정수 가중치)로 나눈다.
//
// 구조는 두 구역: '그룹 정의'(항목 묶음·모드)와 '누가 마셨나' 매트릭스
// (행=사람, 열=그룹). 멤버십·잔수 입력은 매트릭스 한 곳으로 일원화 —
// 정산은 보통 "영희는 뭐 마셨어?" 처럼 사람 단위로 묻기 때문에, 한 줄이
// 한 사람의 음주 전체가 되게 한다. 기본값이 '전원 모든 그룹 포함'이라
// 사용자가 할 일은 예외(안 마신 칸) 표시뿐이다.
//
// 점진적 노출: 기본은 접혀 있고, 안 건드리면 기존 카테고리 균등 분배와 100%
// 동일하다. 첫 펼침에서 항목명 키워드로 감지한 그룹을 제안하고 원탭으로
// 생성 — silent 자동 적용 대신 제안→확인이라 오분류가 모르게 저장되지 않는다.
// 조정하면 위 분담 미리보기(Step4 calc)가 즉시 갱신된다.

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
}

const CATEGORY_LABEL: Record<GroupableCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '음료',
};

const participantLabel = (p: DraftParticipant, idx: number): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

export const RoundGroupSplitEditor = ({ round, participants }: Props) => {
  const [open, setOpen] = useState(false);
  const groups = round.groupSplits ?? [];
  const hasGroupableItems = round.items.some((it) => isGroupableCategory(it.category));
  if (!hasGroupableItems && groups.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-xs font-medium text-muted-foreground">
          세부 분배 — 소주·맥주 그룹/잔수 {groups.length > 0 && <>({groups.length})</>}
        </span>
        <span className="text-xs text-muted-foreground">{open ? '▴' : '▾'}</span>
      </button>

      {/* 접힌 상태 요약 — 설정된 그룹이 있으면 한 줄 칩으로. */}
      {!open && groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <span
              key={g.clientId}
              className="rounded-full border bg-background px-2 py-0.5 text-xs"
            >
              {g.label || labelFallback(g.category)} ·{' '}
              {g.mode === 'GLASSES' ? '잔수' : '균등'}
            </span>
          ))}
        </div>
      )}

      {open && <EditorBody round={round} participants={participants} />}
    </div>
  );
};

const labelFallback = (category: ReceiptItemCategoryType): string =>
  isGroupableCategory(category) ? CATEGORY_LABEL[category] : '그룹';

const EditorBody = ({ round, participants }: Props) => {
  const applyGroupSplits = useSettlementDraftStore((s) => s.applyGroupSplits);
  const addGroupSplit = useSettlementDraftStore((s) => s.addGroupSplit);
  const groups = round.groupSplits ?? [];

  const eligible = (category: ReceiptItemCategoryType): DraftParticipant[] =>
    participants.filter((p) =>
      isEligibleGroupMember(round, participants, p.clientId, category),
    );

  // 아직 그룹에 안 묶인 주류/음료 항목 — 수동 그룹 추가의 기본 선택.
  const groupedItemIds = new Set(groups.flatMap((g) => g.itemClientIds));
  const ungroupedOf = (category: GroupableCategoryType): DraftItem[] =>
    round.items.filter(
      (it) => it.category === category && !groupedItemIds.has(it.clientId),
    );

  const suggestions = useMemo(() => suggestItemGroups(round.items), [round.items]);

  const handleApplySuggestions = () => {
    applyGroupSplits(
      round.clientId,
      suggestions.map((s) => ({
        label: s.label,
        category: s.category,
        itemClientIds: s.itemClientIds,
        mode: 'EQUAL' as const,
        members: eligible(s.category).map((p) => ({
          participantClientId: p.clientId,
          glasses: 1,
        })),
      })),
    );
  };

  const handleAddGroup = (category: GroupableCategoryType) => {
    addGroupSplit(round.clientId, {
      label: CATEGORY_LABEL[category],
      category,
      itemClientIds: ungroupedOf(category).map((it) => it.clientId),
      mode: 'EQUAL',
      members: eligible(category).map((p) => ({
        participantClientId: p.clientId,
        glasses: 1,
      })),
    });
  };

  return (
    <div className="space-y-3">
      {/* 첫 진입 — 키워드 제안. 그룹이 이미 있으면 제안은 숨긴다. */}
      {groups.length === 0 && (
        <div className="space-y-2">
          {suggestions.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                항목명으로 이런 그룹을 만들 수 있어요:
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {suggestions.map((s) => (
                  <span
                    key={`${s.category}:${s.label}`}
                    className="rounded-full border bg-background px-2 py-0.5 text-xs"
                  >
                    {s.label} · 항목 {s.itemClientIds.length}개
                  </span>
                ))}
              </div>
              <Button type="button" size="sm" className="h-7 gap-1 text-xs" onClick={handleApplySuggestions}>
                <Wand2 className="size-3" />
                이대로 그룹 만들기
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              소주/맥주처럼 따로 나눌 항목을 그룹으로 묶고, 그룹마다 균등 또는
              잔수로 나눠보세요.
            </p>
          )}
        </div>
      )}

      {/* 그룹 정의 — 항목 묶음 + 모드. 멤버·잔수는 아래 매트릭스에서. */}
      {groups.map((g) => (
        <GroupBlock key={g.clientId} round={round} group={g} />
      ))}

      {/* 수동 그룹 추가 — 그 카테고리에 미배정 항목이 있을 때만. */}
      <div className="flex flex-wrap gap-1.5">
        {(['ALCOHOL', 'NON_ALCOHOL'] as const).map(
          (cat) =>
            ungroupedOf(cat).length > 0 && (
              <Button
                key={cat}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => handleAddGroup(cat)}
              >
                <Plus className="size-3" />
                {CATEGORY_LABEL[cat]} 그룹 추가
              </Button>
            ),
        )}
      </div>

      <MemberMatrix round={round} participants={participants} />
    </div>
  );
};

// 그룹 정의 블록 — 라벨(편집 가능) + 풀 금액 + 항목 칩 + 모드 토글 + 삭제.
const GroupBlock = ({
  round,
  group,
}: {
  round: DraftRound;
  group: DraftItemGroup;
}) => {
  const updateGroupSplit = useSettlementDraftStore((s) => s.updateGroupSplit);
  const removeGroupSplit = useSettlementDraftStore((s) => s.removeGroupSplit);

  const itemsInGroup = group.itemClientIds
    .map((id) => round.items.find((it) => it.clientId === id))
    .filter((it): it is DraftItem => Boolean(it));
  const pool = itemsInGroup.reduce((sum, it) => sum + it.amount, 0);

  // 같은 카테고리의 모든 항목 — 칩 토글로 그룹에 넣고 뺀다.
  const categoryItems = round.items.filter((it) => it.category === group.category);
  const otherGroups = (round.groupSplits ?? []).filter(
    (g) => g.clientId !== group.clientId,
  );

  const toggleItem = (itemClientId: string) => {
    if (group.itemClientIds.includes(itemClientId)) {
      updateGroupSplit(round.clientId, group.clientId, {
        itemClientIds: group.itemClientIds.filter((id) => id !== itemClientId),
      });
      return;
    }
    // 다른 그룹에 있던 항목이면 옮긴다 — 항목은 최대 1개 그룹. 옮긴 뒤 빈
    // 그룹이 되면 그 그룹은 제거.
    const from = otherGroups.find((g) => g.itemClientIds.includes(itemClientId));
    if (from) {
      const rest = from.itemClientIds.filter((id) => id !== itemClientId);
      if (rest.length === 0) removeGroupSplit(round.clientId, from.clientId);
      else updateGroupSplit(round.clientId, from.clientId, { itemClientIds: rest });
    }
    updateGroupSplit(round.clientId, group.clientId, {
      itemClientIds: [...group.itemClientIds, itemClientId],
    });
  };

  const setMode = (mode: DraftItemGroup['mode']) => {
    if (mode === group.mode) return;
    // 잔수 → 균등 전환 시 0잔 멤버는 뺀다 — 0잔(분담 0)이던 사람이 균등에서
    // 갑자기 부담하게 되는 깜짝을 막는다.
    if (mode === 'EQUAL') {
      updateGroupSplit(round.clientId, group.clientId, {
        mode,
        members: group.members.filter((m) => m.glasses > 0),
      });
      return;
    }
    updateGroupSplit(round.clientId, group.clientId, { mode });
  };

  return (
    <div className="space-y-2 rounded-md border bg-background/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={group.label}
          onChange={(e) =>
            updateGroupSplit(round.clientId, group.clientId, { label: e.target.value })
          }
          placeholder={labelFallback(group.category)}
          aria-label="그룹 이름"
          className="h-7 w-24 rounded-md border bg-background px-2 text-xs font-medium"
        />
        <span className="text-xs text-muted-foreground">
          {pool.toLocaleString('ko-KR')}원
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex overflow-hidden rounded-md border">
            {(['EQUAL', 'GLASSES'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'px-2 py-1 text-xs transition-colors',
                  group.mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent',
                )}
              >
                {m === 'EQUAL' ? '균등' : '잔수'}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-muted-foreground"
            onClick={() => removeGroupSplit(round.clientId, group.clientId)}
            aria-label="그룹 삭제"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* 항목 칩 — 같은 카테고리 항목 전체. ✓ = 이 그룹. 다른 그룹 항목을
          누르면 이쪽으로 옮겨온다. */}
      <div className="flex flex-wrap gap-1.5">
        {categoryItems.map((it) => {
          const inThis = group.itemClientIds.includes(it.clientId);
          const inOther = otherGroups.some((g) => g.itemClientIds.includes(it.clientId));
          return (
            <button
              key={it.clientId}
              type="button"
              onClick={() => toggleItem(it.clientId)}
              title={`${it.amount.toLocaleString('ko-KR')}원${inOther ? ' · 다른 그룹에서 가져오기' : ''}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                inThis
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'bg-background text-muted-foreground hover:bg-accent',
                inOther && !inThis && 'opacity-60',
              )}
            >
              {inThis && <Check className="size-3" />}
              {it.name}
            </button>
          );
        })}
      </div>
      {itemsInGroup.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          항목을 선택하세요 — 비어 있는 그룹은 저장 시 무시됩니다.
        </p>
      )}
    </div>
  );
};

// '누가 마셨나' 매트릭스 — 행=참석자, 열=그룹. 균등 그룹은 체크박스(✓=마심),
// 잔수 그룹은 셀 안 미니 스테퍼(0잔=안 마심, 흐릿하게). 자격 없는 칸(카테고리
// 제외자)은 '—' — 그날 마셨다면 '차수 특이사항: 마심'으로 풀면 칸이 열린다.
const MemberMatrix = ({ round, participants }: Props) => {
  const updateGroupSplit = useSettlementDraftStore((s) => s.updateGroupSplit);
  const groups = round.groupSplits ?? [];
  if (groups.length === 0) return null;

  const attendees = participants.filter(
    (p) =>
      round.attendances.find((a) => a.participantClientId === p.clientId)?.attended,
  );

  const memberOf = (g: DraftItemGroup, participantClientId: string) =>
    g.members.find((m) => m.participantClientId === participantClientId);

  const toggleMember = (g: DraftItemGroup, participantClientId: string) => {
    const members = memberOf(g, participantClientId)
      ? g.members.filter((m) => m.participantClientId !== participantClientId)
      : [...g.members, { participantClientId, glasses: 1 }];
    updateGroupSplit(round.clientId, g.clientId, { members });
  };

  const setGlasses = (
    g: DraftItemGroup,
    participantClientId: string,
    glasses: number,
  ) => {
    const members = memberOf(g, participantClientId)
      ? g.members.map((m) =>
          m.participantClientId === participantClientId ? { ...m, glasses } : m,
        )
      : [...g.members, { participantClientId, glasses }];
    updateGroupSplit(round.clientId, g.clientId, { members });
  };

  const poolOf = (g: DraftItemGroup): number =>
    g.itemClientIds.reduce(
      (sum, id) => sum + (round.items.find((it) => it.clientId === id)?.amount ?? 0),
      0,
    );

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">누가 마셨나</div>
      <div className="overflow-x-auto rounded-md border bg-background/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-2 py-1.5 text-left font-medium">참여자</th>
              {groups.map((g) => (
                <th key={g.clientId} className="px-2 py-1.5 text-center font-medium">
                  {g.label || labelFallback(g.category)}
                  {g.mode === 'GLASSES' && <span className="font-normal"> (잔)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attendees.map((p, idx) => (
              <tr key={p.clientId} className="border-b last:border-0">
                <td className="max-w-28 truncate px-2 py-1">
                  {participantLabel(p, idx)}
                </td>
                {groups.map((g) => {
                  const ok = isEligibleGroupMember(
                    round,
                    participants,
                    p.clientId,
                    g.category,
                  );
                  if (!ok) {
                    return (
                      <td
                        key={g.clientId}
                        className="px-2 py-1 text-center text-muted-foreground/40"
                        title={`${labelFallback(g.category)} 안 함 — '차수 특이사항'에서 바꿀 수 있어요`}
                      >
                        —
                      </td>
                    );
                  }
                  if (g.mode === 'EQUAL') {
                    return (
                      <td key={g.clientId} className="px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={Boolean(memberOf(g, p.clientId))}
                          onChange={() => toggleMember(g, p.clientId)}
                          aria-label={`${participantLabel(p, idx)} ${g.label || labelFallback(g.category)} 마심`}
                          className="size-4 cursor-pointer"
                        />
                      </td>
                    );
                  }
                  const glasses = memberOf(g, p.clientId)?.glasses ?? 0;
                  return (
                    <td key={g.clientId} className="px-1 py-1">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() =>
                            setGlasses(g, p.clientId, Math.max(0, glasses - 1))
                          }
                          disabled={glasses <= 0}
                          aria-label="잔수 줄이기"
                          className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span
                          className={cn(
                            'w-6 text-center tabular-nums',
                            glasses === 0 && 'text-muted-foreground/40',
                          )}
                        >
                          {glasses}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setGlasses(g, p.clientId, Math.min(99, glasses + 1))
                          }
                          aria-label="잔수 늘리기"
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 그룹별 분배 요약/경고 — 균등은 제외자 명시, 잔수는 잔당 금액. */}
      <div className="space-y-0.5">
        {groups.map((g) => {
          const pool = poolOf(g);
          if (pool === 0) return null;
          const label = g.label || labelFallback(g.category);
          const candidates = attendees.filter((p) =>
            isEligibleGroupMember(round, participants, p.clientId, g.category),
          );
          if (g.mode === 'EQUAL') {
            const included = candidates.filter((p) => memberOf(g, p.clientId));
            const excluded = candidates.filter((p) => !memberOf(g, p.clientId));
            if (included.length === 0) {
              return (
                <p key={g.clientId} className="text-xs text-amber-600 dark:text-amber-400">
                  {label}: 멤버가 없어 {labelFallback(g.category)} 전체 균등으로
                  계산됩니다.
                </p>
              );
            }
            return (
              <p key={g.clientId} className="text-xs text-muted-foreground">
                {label}: {included.length}명 균등 · 인당 약{' '}
                {Math.floor(pool / included.length).toLocaleString('ko-KR')}원
                {excluded.length > 0 && (
                  <>
                    {' '}·{' '}
                    {excluded
                      .map((p) => participantLabel(p, participants.indexOf(p)))
                      .join('·')}{' '}
                    빠짐
                  </>
                )}
              </p>
            );
          }
          const totalGlasses = candidates.reduce(
            (sum, p) => sum + (memberOf(g, p.clientId)?.glasses ?? 0),
            0,
          );
          if (totalGlasses === 0) {
            return (
              <p key={g.clientId} className="text-xs text-amber-600 dark:text-amber-400">
                {label}: 잔수가 모두 0 — 그룹 멤버끼리 균등으로 계산됩니다.
              </p>
            );
          }
          return (
            <p key={g.clientId} className="text-xs text-muted-foreground">
              {label}: 총 {totalGlasses}잔 · 1잔 약{' '}
              {Math.floor(pool / totalGlasses).toLocaleString('ko-KR')}원
            </p>
          );
        })}
      </div>
    </div>
  );
};
