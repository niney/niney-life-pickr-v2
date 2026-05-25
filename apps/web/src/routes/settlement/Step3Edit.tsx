import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  settlementExtractionApi,
  useRestaurantPublic,
  useSettlementDraftStore,
  type DraftItem,
  type DraftRound,
} from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import { MenuPickerDialog } from './MenuPickerDialog';
import { RoundDiscountEditor } from './RoundDiscountEditor';

interface Props {
  onBack: () => void;
  onNext: () => void;
}

const CATEGORY_LABEL: Record<ReceiptItemCategoryType, string> = {
  ALCOHOL: '주류',
  NON_ALCOHOL: '비주류',
  SIDE: '안주',
  UNCATEGORIZED: '미분류',
};

const CATEGORIES: ReceiptItemCategoryType[] = [
  'ALCOHOL',
  'NON_ALCOHOL',
  'SIDE',
  'UNCATEGORIZED',
];

// 항목 편집 단계 — 차수가 여러 개면 상단 탭으로 전환. 차수별로 기존 단일
// 차수 편집기와 같은 UI 를 보여준다.
export const Step3Edit = ({ onBack, onNext }: Props) => {
  const rounds = useSettlementDraftStore((s) => s.rounds);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitAttempt, setSubmitAttempt] = useState(false);

  // 차수 추가/삭제로 인덱스가 흘러내릴 수 있으니 안전 클램프.
  const safeIdx = Math.min(activeIdx, Math.max(0, rounds.length - 1));
  const active = rounds[safeIdx];

  // 모든 차수가 다음으로 갈 수 있을 때만 진행. 한 차수라도 항목 0개·누락
  // 항목·할인 풀 초과·할인 0원 활성 상태가 있으면 막는다.
  const canProceed =
    rounds.length > 0 &&
    rounds.every((r) => {
      if (r.items.length === 0) return false;
      if (r.items.some((it) => it.name.trim().length === 0 || it.amount <= 0))
        return false;
      if (r.discountAmount != null && r.discountCategory != null) {
        if (r.discountAmount <= 0) return false;
        const pool = r.items
          .filter((it) => it.category === r.discountCategory)
          .reduce((s, it) => s + it.amount, 0);
        if (r.discountAmount > pool) return false;
      }
      return true;
    });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">항목 편집</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          차수마다 항목과 가격을 확인·수정하세요. 영수증 분기는 자동으로 채워졌고, 직접 입력은
          ‘+ 메뉴에서’ 또는 ‘+ 직접 입력’ 으로 추가합니다.
        </p>
      </div>

      {rounds.length > 1 && (
        <nav
          aria-label="차수 탭"
          className="flex gap-1 overflow-x-auto rounded-md border bg-muted/30 p-1"
        >
          {rounds.map((r, idx) => {
            const isActive = idx === safeIdx;
            const discountInvalid =
              r.discountAmount != null && r.discountCategory != null
                ? r.discountAmount <= 0 ||
                  r.discountAmount >
                    r.items
                      .filter((it) => it.category === r.discountCategory)
                      .reduce((s, it) => s + it.amount, 0)
                : false;
            const invalid =
              r.items.length === 0 ||
              r.items.some((it) => it.name.trim().length === 0 || it.amount <= 0) ||
              discountInvalid;
            return (
              <button
                key={r.clientId}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={cn(
                  'flex-1 whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-accent',
                )}
              >
                {idx + 1}차
                {submitAttempt && invalid && (
                  <span className="ml-1 text-destructive">!</span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {active && (
        <RoundEditor
          key={active.clientId}
          round={active}
          showInvalid={submitAttempt}
        />
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          이전
        </Button>
        <Button
          type="button"
          onClick={() => {
            setSubmitAttempt(true);
            if (canProceed) onNext();
          }}
          disabled={submitAttempt && !canProceed}
        >
          다음
        </Button>
      </div>
    </section>
  );
};

// 한 차수의 편집기. 영수증 미리보기 + 경고 배너 + 항목 리스트 + 합계.
const RoundEditor = ({
  round,
  showInvalid,
}: {
  round: DraftRound;
  showInvalid: boolean;
}) => {
  const addRoundItem = useSettlementDraftStore((s) => s.addRoundItem);
  const updateRoundItem = useSettlementDraftStore((s) => s.updateRoundItem);
  const removeRoundItem = useSettlementDraftStore((s) => s.removeRoundItem);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 메뉴명 input ref Map — Enter 로 새 항목 추가 후 그 행에 focus 옮길 때 사용.
  const nameRefs = useRef(new Map<string, HTMLInputElement | null>());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFocusId) return;
    const el = nameRefs.current.get(pendingFocusId);
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, round.items]);

  // Enter: 마지막 항목이면 새 빈 항목 추가 + 그 행 메뉴명 focus, 중간이면
  // 다음 항목 메뉴명으로 focus 이동. 빈 이름이면 무시 (preventDefault 만).
  // 한글 IME 조립 중 Enter 도 무시.
  const handleItemNameEnter = (
    e: React.KeyboardEvent<HTMLInputElement>,
    itemClientId: string,
  ) => {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const idx = round.items.findIndex((it) => it.clientId === itemClientId);
    const it = round.items[idx];
    if (!it) return;
    if (it.name.trim().length === 0) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const isLast = idx === round.items.length - 1;
    if (isLast) {
      const newId = addRoundItem(round.clientId, {
        name: '',
        unitPrice: null,
        quantity: 1,
        amount: 0,
        category: 'UNCATEGORIZED',
        matchedMenuName: null,
      });
      if (newId) setPendingFocusId(newId);
    } else {
      const nextId = round.items[idx + 1]?.clientId;
      if (nextId) setPendingFocusId(nextId);
    }
  };

  // 메뉴 모달을 위한 식당 detail. 차수의 placeId 기준이라 1차/2차가 다른
  // 식당이면 각각 자기 메뉴를 가져온다.
  const detail = useRestaurantPublic(round.placeId);
  const menus = detail.data?.menus ?? [];

  const subtotal = useMemo(
    () => round.items.reduce((sum, it) => sum + (it.amount || 0), 0),
    [round.items],
  );

  const subtotalMismatch =
    round.source === 'RECEIPT' &&
    round.totalAmount != null &&
    Math.abs(subtotal - round.totalAmount) >= 1;

  return (
    <div className="space-y-3">
      {round.source === 'RECEIPT' && round.receiptPreviewUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{round.placeName} · 영수증 미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptPreviewImage url={round.receiptPreviewUrl} />
          </CardContent>
        </Card>
      )}

      {(round.warning || subtotalMismatch) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {round.warning && <p>{round.warning}</p>}
            {subtotalMismatch && (
              <p>
                항목 합계 {subtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
                {round.totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {round.items.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            항목이 없습니다. 아래 버튼으로 추가하세요.
          </div>
        )}
        {round.items.map((it, idx) => (
          <ItemRow
            key={it.clientId}
            item={it}
            index={idx}
            onUpdate={(patch) => updateRoundItem(round.clientId, it.clientId, patch)}
            onRemove={() => removeRoundItem(round.clientId, it.clientId)}
            invalid={showInvalid && (it.name.trim().length === 0 || it.amount <= 0)}
            nameRef={(el) => {
              if (el) nameRefs.current.set(it.clientId, el);
              else nameRefs.current.delete(it.clientId);
            }}
            onNameKeyDown={(e) => handleItemNameEnter(e, it.clientId)}
          />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          메뉴에서 추가
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            addRoundItem(round.clientId, {
              name: '',
              unitPrice: null,
              quantity: 1,
              amount: 0,
              category: 'UNCATEGORIZED',
              matchedMenuName: null,
            })
          }
        >
          <Plus className="size-4" />
          직접 입력으로 추가
        </Button>
      </div>

      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <RoundDiscountEditor round={round} />
      </div>

      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <span className="text-sm">차수 합계</span>
        <span className="text-base font-semibold">
          {(subtotal - (round.discountAmount ?? 0)).toLocaleString('ko-KR')}원
          {round.discountAmount ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({subtotal.toLocaleString('ko-KR')} − {round.discountAmount.toLocaleString('ko-KR')})
            </span>
          ) : null}
        </span>
      </div>

      <MenuPickerDialog
        open={pickerOpen}
        menus={menus}
        onClose={() => setPickerOpen(false)}
        onPick={(menu) => {
          const price = parsePrice(menu.price);
          addRoundItem(round.clientId, {
            name: menu.name,
            unitPrice: price,
            quantity: 1,
            amount: price ?? 0,
            category: 'UNCATEGORIZED',
            matchedMenuName: menu.name,
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );
};

interface ItemRowProps {
  item: DraftItem;
  index: number;
  onUpdate(patch: Partial<DraftItem>): void;
  onRemove(): void;
  invalid: boolean;
  nameRef: (el: HTMLInputElement | null) => void;
  onNameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const ItemRow = ({
  item,
  index,
  onUpdate,
  onRemove,
  invalid,
  nameRef,
  onNameKeyDown,
}: ItemRowProps) => {
  return (
    <div
      className={
        'rounded-lg border bg-card p-3 shadow-sm ' +
        (invalid ? 'border-destructive/50' : '')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="삭제"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="메뉴명">
          <Input
            type="text"
            value={item.name}
            placeholder="예: 카스 500ml"
            ref={nameRef}
            onKeyDown={onNameKeyDown}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </Field>
        <Field label="카테고리">
          <select
            value={item.category}
            onChange={(e) =>
              onUpdate({ category: e.target.value as ReceiptItemCategoryType })
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="단가 (원, 선택)">
          <Input
            type="number"
            inputMode="numeric"
            value={item.unitPrice ?? ''}
            placeholder="0"
            onChange={(e) => {
              const v = e.target.value;
              const n = v === '' ? null : Number(v);
              onUpdate({ unitPrice: Number.isFinite(n) ? n : null });
            }}
          />
        </Field>
        <Field label="수량 (선택)">
          <Input
            type="number"
            inputMode="numeric"
            value={item.quantity ?? ''}
            placeholder="1"
            onChange={(e) => {
              const v = e.target.value;
              const n = v === '' ? null : Number(v);
              onUpdate({ quantity: Number.isFinite(n) && n != null && n > 0 ? n : null });
            }}
          />
        </Field>
        <Field label="라인 합계 (원)">
          <Input
            type="number"
            inputMode="numeric"
            value={item.amount}
            onChange={(e) => onUpdate({ amount: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        {item.matchedMenuName && (
          <div className="self-end text-xs text-muted-foreground">
            등록 메뉴 매칭: <strong>{item.matchedMenuName}</strong>
          </div>
        )}
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

// 영수증 미리보기 — preview 라우트는 JWT 필요라 <img src> 직접 호출이 안 된다.
// fetch 로 blob 받아 objectURL 로 변환해 표시. 외부 시스템(브라우저 URL 캐시)
// 동기화라 useEffect 가 맞다 — unmount 시 revoke 까지 한 묶음.
const ReceiptPreviewImage = ({ url }: { url: string }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const token = url.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [url]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!objectUrl)
    return <p className="text-sm text-muted-foreground">미리보기 불러오는 중…</p>;
  return (
    <img
      src={objectUrl}
      alt="영수증"
      className="max-h-64 w-full rounded-md border object-contain"
    />
  );
};

// '15,000원', '15000', null → 숫자 또는 null.
const parsePrice = (raw: string | null): number | null => {
  if (raw == null) return null;
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
