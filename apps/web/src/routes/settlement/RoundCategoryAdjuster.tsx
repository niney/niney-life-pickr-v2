import { useMemo } from 'react';
import { calculateMultiRoundShares, effectiveExcludes, type ReceiptItemCategoryType } from '@repo/api-contract';
import {
  draftGroupsToCalcInputs,
  useSettlementDraftStore,
  type DraftParticipant,
  type DraftRound,
} from '@repo/shared';
import { cn } from '~/lib/utils';
import { Button } from '~/components/ui/button';

// 분담 다듬기 — 카테고리×차수 단위로 1원 단위 잔여가 발생한 경우만 노출.
// 사용자가 "받을 사람" 을 고를 수 있고, round(unit) 이 인원수로 떨어지는
// unit (100/1000) 만 추천 칩 활성. 안 떨어지면 비활성(회색) + 툴팁.
//
// "받을 사람" 미선택 시 calculator 는 첫 활성자에게 잔여를 가산한다(=현재
// 동작). 사용자가 명시로 고르면 그 사람 흡수.

interface Props {
  round: DraftRound;
  participants: DraftParticipant[];
  // 이 round 의 (할인 적용 후) 카테고리별 풀 amount. UI 가 잔여 여부 판단에 사용.
  // shareAmounts 등 풀 정보는 round 자체에서 다시 계산.
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '술',
  NON_ALCOHOL: '음료',
  SIDE: '안주',
  UNCATEGORIZED: '기타',
};

const CATEGORY_ORDER: ReceiptItemCategoryType[] = [
  'SIDE',
  'ALCOHOL',
  'NON_ALCOHOL',
  'UNCATEGORIZED',
];

const ROUND_UNITS = [100, 1000] as const;

const participantLabel = (p: DraftParticipant, idx: number): string => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

export const RoundCategoryAdjuster = ({ round, participants }: Props) => {
  const setCategoryAdjustment = useSettlementDraftStore((s) => s.setCategoryAdjustment);

  // 현재 보정 적용 전 상태(잔여 판단용)와 현재 round 의 활성자/풀 amount.
  // calculateMultiRoundShares 를 한 round 만 호출해 poolBreakdown.poolAmount 와
  // perCategoryShares 정보를 얻는다.
  const info = useMemo(() => {
    const calc = calculateMultiRoundShares({
      participantCount: participants.length,
      rounds: [
        {
          items: round.items.map((it) => ({ amount: it.amount, category: it.category })),
          attendees: round.attendances
            .filter((a) => a.attended)
            .map((a) => {
              const master = participants.find((p) => p.clientId === a.participantClientId)!;
              const eff = effectiveExcludes(master, a);
              return {
                participantIndex: participants.findIndex(
                  (p) => p.clientId === a.participantClientId,
                ),
                ...eff,
              };
            }),
          discount:
            round.discountAmount != null && round.discountCategory != null && round.discountAmount > 0
              ? { amount: round.discountAmount, category: round.discountCategory }
              : null,
          // 보정 없이 raw 분배 결과로 잔여 확인.
          categoryAdjustments: null,
          // 세부 분배 그룹 반영 — 다듬기 대상은 그룹을 뺀 '나머지(균등) 풀'.
          groups: draftGroupsToCalcInputs(round, participants),
        },
      ],
    });
    return calc.perRound[0]!;
  }, [round, participants]);

  // 카테고리별 후보 행 생성: 나머지(균등) 풀>0 인 것만, 그 중 잔여 있거나
  // 사용자가 이미 보정 적용한 것만 한 줄 노출. 그룹 풀 잔여는 계산기가
  // 1원씩 자동 분산하므로 다듬을 게 없다.
  const rows = useMemo(() => {
    return CATEGORY_ORDER.flatMap((cat) => {
      const b = info.poolBreakdown[cat];
      if (!b || b.equalPoolAmount === 0 || b.participantCount === 0) return [];
      const remainder = b.equalPoolAmount - b.perParticipant * b.participantCount;
      const adj = round.categoryAdjustments?.[cat] ?? null;
      if (remainder === 0 && !adj) return [];
      return [
        {
          category: cat,
          pool: b.equalPoolAmount,
          // 그룹이 있으면 이 행의 '풀'은 그룹을 뺀 나머지 — 라벨로 구분.
          grouped: b.equalPoolAmount !== b.poolAmount,
          n: b.participantCount,
          remainder,
          perBase: b.perParticipant,
          adj,
        },
      ];
    });
  }, [info, round.categoryAdjustments]);

  if (rows.length === 0) return null;

  // 활성자(이 카테고리 풀에 참여 중인 사람) 만 leftover 후보로 보여준다.
  const activeFor = (cat: ReceiptItemCategoryType): DraftParticipant[] => {
    return participants.filter((p, idx) => {
      const att = round.attendances.find((a) => a.participantClientId === p.clientId);
      if (!att || !att.attended) return false;
      if (cat === 'UNCATEGORIZED') return true;
      const eff = effectiveExcludes(p, att);
      if (cat === 'ALCOHOL') return !eff.excludeAlcohol;
      if (cat === 'NON_ALCOHOL') return !eff.excludeNonAlcohol;
      if (cat === 'SIDE') return !eff.excludeSide;
      void idx;
      return true;
    });
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="text-xs font-medium text-muted-foreground">분담 다듬기</div>
      {rows.map((row) => {
        const candidates = activeFor(row.category);
        const currentLeftovers =
          row.adj?.leftoverParticipantClientIds ??
          (candidates[0] ? [candidates[0].clientId] : []);
        const currentUnit = row.adj?.roundUnit ?? null;
        // 잔여 R 원이면 최대 R 명까지 나눠 받을 수 있다 (R<2 면 단일=몰아주기).
        const cap = Math.max(1, row.remainder);

        const toggleLeftover = (clientId: string) => {
          let next: string[];
          if (cap <= 1) {
            next = [clientId]; // 단일 — 항상 교체(레거시 몰아주기).
          } else if (currentLeftovers.includes(clientId)) {
            if (currentLeftovers.length === 1) return; // 최소 1명은 유지.
            next = currentLeftovers.filter((id) => id !== clientId);
          } else {
            if (currentLeftovers.length >= cap) return; // 캡 도달.
            next = [...currentLeftovers, clientId];
          }
          setCategoryAdjustment(round.clientId, row.category, {
            leftoverParticipantClientIds: next,
            roundUnit: currentUnit,
          });
        };
        const toggleUnit = (unit: number | null) => {
          if (currentUnit === unit && row.adj) {
            // 같은 unit 다시 누르면 해제 → 잔여 가산 모드 (받을 사람만 유지).
            if (unit === null) {
              // 이미 잔여 가산 모드. 카테고리 보정 자체를 제거.
              setCategoryAdjustment(round.clientId, row.category, null);
              return;
            }
            setCategoryAdjustment(round.clientId, row.category, {
              leftoverParticipantClientIds: currentLeftovers,
              roundUnit: null,
            });
            return;
          }
          setCategoryAdjustment(round.clientId, row.category, {
            leftoverParticipantClientIds: currentLeftovers,
            roundUnit: unit,
          });
        };

        return (
          <div key={row.category} className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{CATEGORY_LABEL[row.category]}</span>
              <span>
                {row.grouped ? '나머지 풀' : '풀'} {row.pool.toLocaleString('ko-KR')}원 / {row.n}명 · 인당{' '}
                {row.perBase.toLocaleString('ko-KR')}원 + 잔여 {row.remainder.toLocaleString('ko-KR')}원
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                잔여 받기
                {cap >= 2 ? ` (여러 명 고르면 나눠 받음 · 최대 ${cap}명)` : ''}:
              </span>
              {candidates.map((p, i) => {
                const sel = currentLeftovers.includes(p.clientId);
                return (
                  <Button
                    key={p.clientId}
                    type="button"
                    size="sm"
                    variant={sel ? 'default' : 'outline'}
                    onClick={() => toggleLeftover(p.clientId)}
                    className="h-8 text-xs"
                  >
                    {participantLabel(p, i)}
                  </Button>
                );
              })}
              {ROUND_UNITS.map((unit) => {
                const rounded = Math.round(row.pool / unit) * unit;
                const fits = rounded % row.n === 0;
                // 추천: 보정 차액 합이 unit 이내. 인당 차이는 |원래 분담 - rounded/n|.
                // 활성자 모두 동일한 분담이라 차이의 합 = n × |기존 인당 - rounded/n|.
                const newPer = rounded / row.n;
                const diffSum = Math.abs(row.perBase - newPer) * row.n + row.remainder;
                const recommended = fits && diffSum <= unit;
                const selected = currentUnit === unit && !!row.adj;
                return (
                  <Button
                    key={unit}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    disabled={!fits}
                    title={
                      fits
                        ? `풀을 ${unit.toLocaleString('ko-KR')}원 단위로 반올림 (${rounded.toLocaleString('ko-KR')}원, 인당 ${newPer.toLocaleString('ko-KR')}원)`
                        : `${unit.toLocaleString('ko-KR')}원으로 반올림하면 인당 깔끔하게 안 나뉨`
                    }
                    onClick={() => toggleUnit(unit)}
                    className={cn('h-8 text-xs', !fits && 'opacity-50')}
                  >
                    {unit.toLocaleString('ko-KR')}원 반올림
                    {recommended && !selected && (
                      <span className="ml-1 rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                        추천
                      </span>
                    )}
                  </Button>
                );
              })}
              {row.adj && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setCategoryAdjustment(round.clientId, row.category, null)}
                >
                  되돌리기
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
