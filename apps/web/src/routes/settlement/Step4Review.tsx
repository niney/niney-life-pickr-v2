import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Coins, Loader2, Save } from 'lucide-react';
import {
  calculateMultiRoundShares,
  effectiveExcludes,
  type ReceiptItemCategoryType,
} from '@repo/api-contract';
import {
  ApiError,
  useCreateSettlement,
  useSettlementDraftStore,
  useUpdateSettlement,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { RoundExceptionsEditor } from './RoundExceptionsEditor';
import { RoundDiscountEditor } from './RoundDiscountEditor';
import { RoundCategoryAdjuster } from './RoundCategoryAdjuster';
import { CopyCheck } from 'lucide-react';

interface Props {
  onBack: () => void;
  // 편집 모드면 PUT, create 모드면 POST. id 가 있으면 편집.
  editingId?: string;
  // 자동저장된 서버 draft id — 저장 성공 시 서버가 같은 트랜잭션에서 함께
  // 삭제한다. create 모드에서만 의미 있음.
  fromDraftId?: string | null;
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '비주류',
  SIDE: '안주',
  UNCATEGORIZED: '미분류',
};

const participantName = (
  p: { name: string | null; nickname: string | null },
  idx: number,
) => {
  const nm = (p.name ?? '').trim();
  const nick = (p.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || `참여자 ${idx + 1}`;
};

// 마지막 단계 — 차수 × 참여자 참석 그리드 + 차수별 분담 + 인당 합계 + 저장.
// 서버도 같은 계산을 다시 하지만 화면에 즉시 보이도록 client 에서도 호출.
export const Step4Review = ({ onBack, editingId, fromDraftId }: Props) => {
  const draft = useSettlementDraftStore();
  const setAttendance = useSettlementDraftStore((s) => s.setAttendance);
  const create = useCreateSettlement();
  const update = useUpdateSettlement();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState<string | null>(null);

  // 차수별 effective 계산 — round override 적용된 exclude 플래그 + 차수 할인.
  // 풀 초과 등 invalid 상태에서도 미리보기는 그려야 하므로 검증은 calculator
  // 내부 max(0) 클램프에 맡긴다 (저장은 zod refine 으로 한 번 더 차단).
  const calc = useMemo(() => {
    return calculateMultiRoundShares({
      participantCount: draft.participants.length,
      rounds: draft.rounds.map((r) => ({
        items: r.items.map((it) => ({ amount: it.amount, category: it.category })),
        attendees: r.attendances
          .filter((a) => a.attended)
          .map((a) => {
            const master =
              draft.participants.find((p) => p.clientId === a.participantClientId)!;
            const eff = effectiveExcludes(master, a);
            return {
              participantIndex: draft.participants.findIndex(
                (p) => p.clientId === a.participantClientId,
              ),
              ...eff,
            };
          }),
        discount:
          r.discountAmount != null && r.discountCategory != null && r.discountAmount > 0
            ? { amount: r.discountAmount, category: r.discountCategory }
            : null,
        // 보정의 leftoverParticipantClientId → 마스터 인덱스로 변환.
        categoryAdjustments: r.categoryAdjustments
          ? Object.fromEntries(
              Object.entries(r.categoryAdjustments)
                .filter(([, v]) => v != null)
                .map(([cat, v]) => [
                  cat,
                  {
                    leftoverParticipantIndex: draft.participants.findIndex(
                      (p) => p.clientId === v!.leftoverParticipantClientId,
                    ),
                    roundUnit: v!.roundUnit,
                  },
                ]),
            )
          : null,
      })),
    });
  }, [draft.participants, draft.rounds]);

  const handleSave = async () => {
    setError(null);
    // 모든 차수에 source 가 설정돼 있어야 한다 (Step2 게이팅에서 막혔지만 한번 더).
    for (let idx = 0; idx < draft.rounds.length; idx += 1) {
      const r = draft.rounds[idx]!;
      const label = `${idx + 1}차${r.placeName ? ` (${r.placeName})` : ''}`;
      if (!r.source) {
        setError('입력 방식이 결정되지 않은 차수가 있습니다.');
        return;
      }
      if (!r.attendances.some((a) => a.attended)) {
        setError(`${label} 에 참석자가 한 명도 없습니다.`);
        return;
      }
      if (r.discountAmount != null && r.discountCategory != null) {
        if (r.discountAmount <= 0) {
          setError(`${label} 의 할인 금액을 입력하거나 삭제하세요.`);
          return;
        }
        const pool = r.items
          .filter((it) => it.category === r.discountCategory)
          .reduce((s, it) => s + it.amount, 0);
        if (r.discountAmount > pool) {
          setError(`${label} 의 할인이 해당 카테고리 풀(${pool.toLocaleString('ko-KR')}원)을 초과합니다.`);
          return;
        }
      }
    }
    try {
      const payload = {
        rounds: draft.rounds.map((r) => ({
          restaurantPlaceId: r.placeId,
          source: r.source!,
          totalAmount: r.totalAmount,
          warning: r.warning,
          receiptImageToken: r.receiptImageToken,
          discountAmount: r.discountAmount,
          discountCategory: r.discountCategory,
          categoryAdjustments: r.categoryAdjustments,
          items: r.items.map((it) => ({
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            amount: it.amount,
            category: it.category,
            matchedMenuName: it.matchedMenuName,
          })),
          attendees: r.attendances.map((a) => ({
            participantClientId: a.participantClientId,
            attended: a.attended,
            excludeAlcoholOverride: a.excludeAlcoholOverride,
            excludeNonAlcoholOverride: a.excludeNonAlcoholOverride,
            excludeSideOverride: a.excludeSideOverride,
          })),
        })),
        participants: draft.participants.map((p) => ({
          clientId: p.clientId,
          name: p.name?.trim() || null,
          nickname: p.nickname?.trim() || null,
          excludeAlcohol: p.excludeAlcohol,
          excludeNonAlcohol: p.excludeNonAlcohol,
          excludeSide: p.excludeSide,
          ...(p.contactId ? { contactId: p.contactId } : {}),
        })),
        // create 모드에서만 — 서버가 매칭 draft 를 트랜잭션 내 삭제.
        ...(editingId ? {} : fromDraftId ? { fromDraftId } : {}),
      };
      const saved = editingId
        ? await update.mutateAsync({ id: editingId, input: payload })
        : await create.mutateAsync(payload);
      // 저장 성공 — draft 정리 (편집 모드도 마찬가지) 후 결과 페이지로.
      draft.reset();
      navigate(`/restaurants/${saved.restaurantPlaceId}/settle/${saved.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    }
  };

  const multi = draft.rounds.length > 1;
  const pending = create.isPending || update.isPending;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">분배 결과</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {multi
            ? '차수별 분담을 확인하고, 차수별 참석 체크가 맞는지 확인하세요. 저장하면 이력으로 남습니다.'
            : '참여자별 분담액입니다. 저장하면 이력으로 남아 나중에 다시 볼 수 있어요.'}
        </p>
      </div>

      {/* 차수 × 참여자 참석 그리드 — 차수가 2개 이상일 때만 노출. 1개면 모두
          참석이 default 이므로 굳이 보이지 않아도 된다. */}
      {multi && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">차수별 참석</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">참여자</th>
                  {draft.rounds.map((r, idx) => (
                    <th key={r.clientId} className="px-2 py-1.5 text-center font-medium">
                      {idx + 1}차
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.participants.map((p, pIdx) => (
                  <tr key={p.clientId} className="border-b last:border-0">
                    <td className="truncate px-2 py-1.5">{participantName(p, pIdx)}</td>
                    {draft.rounds.map((r) => {
                      const a = r.attendances.find(
                        (x) => x.participantClientId === p.clientId,
                      );
                      const attended = a?.attended ?? false;
                      return (
                        <td key={r.clientId} className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={attended}
                            onChange={(e) =>
                              setAttendance(r.clientId, p.clientId, e.target.checked)
                            }
                            className="size-4 cursor-pointer"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 참여자별 grand total 카드. 멀티 차수면 차수별 부분합도 같이. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4" />
            참여자별 분담
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {draft.participants.map((p, idx) => {
              const tags: string[] = [];
              if (p.excludeAlcohol) tags.push('주류 X');
              if (p.excludeNonAlcohol) tags.push('비주류 X');
              if (p.excludeSide) tags.push('안주 X');
              const total = calc.perParticipant[idx] ?? 0;
              return (
                <li
                  key={p.clientId}
                  className="flex items-start justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {participantName(p, idx)}
                    </div>
                    {tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {tags.map((t) => (
                          <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {multi && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {calc.perRound
                          .map((rc, rIdx) => {
                            const attended =
                              draft.rounds[rIdx]?.attendances.find(
                                (a) => a.participantClientId === p.clientId,
                              )?.attended ?? false;
                            return attended
                              ? `${rIdx + 1}차 ${(rc.shareAmounts[idx] ?? 0).toLocaleString('ko-KR')}원`
                              : `${rIdx + 1}차 불참`;
                          })
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-base font-semibold">
                    {total.toLocaleString('ko-KR')}원
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">총 합계</span>
            <span className="font-semibold">
              {calc.grandTotal.toLocaleString('ko-KR')}원
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 차수별 카드 — 차수 특이사항(차수별 exclude override) + 카테고리 풀 breakdown.
          차수가 여러 개면 2차+에 "1차와 동일" 빠른 복사 버튼. */}
      {draft.rounds.map((r, rIdx) => {
        const rc = calc.perRound[rIdx];
        if (!rc) return null;
        const isOpen = breakdownOpen === r.clientId;
        return (
          <Card key={r.clientId}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="truncate">
                  {multi ? `${rIdx + 1}차 · ` : ''}
                  {r.placeName}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {/* 2차+ 라운드에만 노출. 1차의 참석/특이사항 그대로 복사. */}
                  {rIdx > 0 && (
                    <CopyFromFirstButton
                      targetRoundClientId={r.clientId}
                      sourceRoundClientId={draft.rounds[0]!.clientId}
                    />
                  )}
                  <span className="text-sm font-normal text-muted-foreground">
                    {rc.itemsSubtotal.toLocaleString('ko-KR')}원
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 옵션 C 핵심 — 평소엔 비어 있고, 필요할 때 명시적 칩 추가. */}
              <RoundExceptionsEditor round={r} participants={draft.participants} />

              {/* 차수 할인 입력. Step3 와 같은 컴포넌트로 일관된 UX. */}
              <RoundDiscountEditor round={r} />

              {/* 분담 다듬기 — 잔여 있는 카테고리만 자동 노출. */}
              <RoundCategoryAdjuster round={r} participants={draft.participants} />

              {/* 카테고리 풀 breakdown 은 접힘. 디버깅·확인용이라 default 닫힘. */}
              <div className="border-t pt-2">
                <button
                  type="button"
                  className="w-full text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setBreakdownOpen(isOpen ? null : r.clientId)}
                >
                  카테고리별 풀 {isOpen ? '▴' : '▾'}
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {(
                      ['ALCOHOL', 'NON_ALCOHOL', 'SIDE', 'UNCATEGORIZED'] as ReceiptItemCategoryType[]
                    ).map((c) => {
                      const b = rc.poolBreakdown[c];
                      if (b.poolAmount === 0) return null;
                      return (
                        <li key={c} className="flex items-center justify-between gap-2">
                          <span>{CATEGORY_LABEL[c]}</span>
                          <span className="text-muted-foreground">
                            {b.poolAmount.toLocaleString('ko-KR')}원 · {b.participantCount}명 · 1인{' '}
                            {b.perParticipant.toLocaleString('ko-KR')}원
                          </span>
                        </li>
                      );
                    })}
                    {Object.values(rc.poolBreakdown).every((b) => b.poolAmount === 0) && (
                      <li className="text-muted-foreground">항목이 없습니다.</li>
                    )}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          이전
        </Button>
        <Button type="button" onClick={handleSave} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {editingId ? '수정 저장' : '저장'}
        </Button>
      </div>
    </section>
  );
};

// "1차와 동일" — 2차+ 라운드에서 참석/특이사항을 1차에서 한 번에 복사.
// items/source/영수증은 건드리지 않음 (그 차수의 메뉴 입력은 그대로).
// 클릭 직후 1초간 ✓ 피드백.
const CopyFromFirstButton = ({
  targetRoundClientId,
  sourceRoundClientId,
}: {
  targetRoundClientId: string;
  sourceRoundClientId: string;
}) => {
  const copyRoundAttendancesFrom = useSettlementDraftStore(
    (s) => s.copyRoundAttendancesFrom,
  );
  const [justCopied, setJustCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-xs"
      onClick={() => {
        copyRoundAttendancesFrom(targetRoundClientId, sourceRoundClientId);
        setJustCopied(true);
        window.setTimeout(() => setJustCopied(false), 1200);
      }}
      title="1차의 참석/특이사항을 그대로 복사"
    >
      <CopyCheck className="size-3" />
      {justCopied ? '복사됨' : '1차와 동일'}
    </Button>
  );
};
