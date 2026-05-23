import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { MenuItemType, ReceiptItemCategoryType } from '@repo/api-contract';
import { settlementExtractionApi, useSettlementDraftStore, type DraftItem } from '@repo/shared';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { MenuPickerDialog } from './MenuPickerDialog';

interface Props {
  menus: MenuItemType[];
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

// 영수증 분기에서 추출된 prefill 또는 직접 입력으로 시작된 빈 리스트를
// 편집하는 단계. 항목 합계 + (영수증 분기) 총액 vs 합계 경고 + 다음 단계.
export const Step3Edit = ({ menus, onBack, onNext }: Props) => {
  const items = useSettlementDraftStore((s) => s.items);
  const updateItem = useSettlementDraftStore((s) => s.updateItem);
  const removeItem = useSettlementDraftStore((s) => s.removeItem);
  const addItem = useSettlementDraftStore((s) => s.addItem);
  const source = useSettlementDraftStore((s) => s.source);
  const totalAmount = useSettlementDraftStore((s) => s.totalAmount);
  const warning = useSettlementDraftStore((s) => s.warning);
  const receiptPreviewUrl = useSettlementDraftStore((s) => s.receiptPreviewUrl);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitAttempt, setSubmitAttempt] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (it.amount || 0), 0),
    [items],
  );

  const subtotalMismatch =
    source === 'RECEIPT' && totalAmount != null && Math.abs(subtotal - totalAmount) >= 1;

  const handleAddBlank = () => {
    addItem({
      name: '',
      unitPrice: null,
      quantity: 1,
      amount: 0,
      category: 'UNCATEGORIZED',
      matchedMenuName: null,
    });
  };

  const handlePickMenu = (menu: MenuItemType) => {
    const price = parsePrice(menu.price);
    addItem({
      name: menu.name,
      unitPrice: price,
      quantity: 1,
      amount: price ?? 0,
      category: 'UNCATEGORIZED',
      matchedMenuName: menu.name,
    });
  };

  const canProceed =
    items.length > 0 && items.every((it) => it.name.trim().length > 0 && it.amount > 0);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">항목 편집</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {source === 'RECEIPT'
            ? '영수증에서 추출한 항목입니다. 빠뜨리거나 잘못된 항목은 직접 수정하세요.'
            : '메뉴를 추가하고 가격을 입력하세요.'}
        </p>
      </div>

      {source === 'RECEIPT' && receiptPreviewUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">영수증 미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceiptPreviewImage url={receiptPreviewUrl} />
          </CardContent>
        </Card>
      )}

      {(warning || subtotalMismatch) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {warning && <p>{warning}</p>}
            {subtotalMismatch && (
              <p>
                항목 합계 {subtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
                {totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            항목이 없습니다. 아래 버튼으로 추가하세요.
          </div>
        )}
        {items.map((it, idx) => (
          <ItemRow
            key={it.clientId}
            item={it}
            index={idx}
            onUpdate={(patch) => updateItem(it.clientId, patch)}
            onRemove={() => removeItem(it.clientId)}
            invalid={submitAttempt && (it.name.trim().length === 0 || it.amount <= 0)}
          />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          메뉴에서 추가
        </Button>
        <Button type="button" variant="outline" onClick={handleAddBlank}>
          <Plus className="size-4" />
          직접 입력으로 추가
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
        <span className="text-sm">합계</span>
        <span className="text-base font-semibold">
          {subtotal.toLocaleString('ko-KR')}원
        </span>
      </div>

      <div className="flex justify-between pt-2">
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

      <MenuPickerDialog
        open={pickerOpen}
        menus={menus}
        onClose={() => setPickerOpen(false)}
        onPick={(menu) => {
          handlePickMenu(menu);
          setPickerOpen(false);
        }}
      />
    </section>
  );
};

interface ItemRowProps {
  item: DraftItem;
  index: number;
  onUpdate(patch: Partial<DraftItem>): void;
  onRemove(): void;
  invalid: boolean;
}

const ItemRow = ({ item, index, onUpdate, onRemove, invalid }: ItemRowProps) => {
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
