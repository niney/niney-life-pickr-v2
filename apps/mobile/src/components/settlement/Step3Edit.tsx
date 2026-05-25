import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import type { MenuItemType, ReceiptItemCategoryType } from '@repo/api-contract';
import { getApiConfig, useAuthStore, useSettlementDraftStore, useTheme } from '@repo/shared';
import type { DraftItem } from '@repo/shared';
import { MenuPickerSheet, type MenuPickerSheetRef } from './MenuPickerSheet';

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

// 3단계 — 항목 편집. 영수증에서 prefill 된 결과 또는 빈 리스트에서 시작.
// 카드 단위로 메뉴명/카테고리/단가/수량/라인합계 입력. 합계 sticky 표시.
export const Step3Edit = ({ menus, onBack, onNext }: Props) => {
  const theme = useTheme();
  const items = useSettlementDraftStore((s) => s.items);
  const updateItem = useSettlementDraftStore((s) => s.updateItem);
  const removeItem = useSettlementDraftStore((s) => s.removeItem);
  const addItem = useSettlementDraftStore((s) => s.addItem);
  const source = useSettlementDraftStore((s) => s.source);
  const totalAmount = useSettlementDraftStore((s) => s.totalAmount);
  const warning = useSettlementDraftStore((s) => s.warning);
  const receiptPreviewUrl = useSettlementDraftStore((s) => s.receiptPreviewUrl);

  const pickerRef = useRef<MenuPickerSheetRef>(null);
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
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.colors.text }]}>항목 편집</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {source === 'RECEIPT'
            ? '영수증에서 추출한 항목입니다. 빠뜨리거나 잘못된 항목은 직접 수정하세요.'
            : '메뉴를 추가하고 가격을 입력하세요.'}
        </Text>
      </View>

      {source === 'RECEIPT' && receiptPreviewUrl && (
        <ReceiptPreview url={receiptPreviewUrl} />
      )}

      {(warning || subtotalMismatch) && (
        // 디자인 토큰에 warning 색이 따로 없어 amber 톤 인라인.
        // 정산은 경고가 흔히 뜨는 영역이라 빨강(danger)은 너무 강함.
        <View style={[styles.warning, { borderColor: '#f59e0b', backgroundColor: '#fef3c7' }]}>
          {warning && <Text style={[styles.warningText, { color: '#92400e' }]}>{warning}</Text>}
          {subtotalMismatch && (
            <Text style={[styles.warningText, { color: '#92400e' }]}>
              항목 합계 {subtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
              {totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
            </Text>
          )}
        </View>
      )}

      {items.length === 0 && (
        <View
          style={[
            styles.emptyCard,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            아래 버튼으로 항목을 추가하세요.
          </Text>
        </View>
      )}

      {items.map((it, idx) => (
        <ItemCard
          key={it.clientId}
          item={it}
          index={idx}
          onUpdate={(patch) => updateItem(it.clientId, patch)}
          onRemove={() => removeItem(it.clientId)}
          invalid={submitAttempt && (it.name.trim().length === 0 || it.amount <= 0)}
        />
      ))}

      <View style={styles.addRow}>
        <Pressable
          onPress={() => pickerRef.current?.present()}
          android_ripple={{ color: theme.colors.surfaceAlt }}
          style={({ pressed }) => [
            styles.addBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
            },
          ]}
        >
          <Text style={[styles.addBtnText, { color: theme.colors.text }]}>
            메뉴에서 추가
          </Text>
        </Pressable>
        <Pressable
          onPress={handleAddBlank}
          android_ripple={{ color: theme.colors.surfaceAlt }}
          style={({ pressed }) => [
            styles.addBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
            },
          ]}
        >
          <Text style={[styles.addBtnText, { color: theme.colors.text }]}>
            직접 입력
          </Text>
        </Pressable>
      </View>

      <View
        style={[
          styles.totalBar,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
        ]}
      >
        <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>합계</Text>
        <Text style={[styles.totalValue, { color: theme.colors.text }]}>
          {subtotal.toLocaleString('ko-KR')}원
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.ghostBtn,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
            },
          ]}
        >
          <Text style={[styles.ghostText, { color: theme.colors.text }]}>이전</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setSubmitAttempt(true);
            if (canProceed) onNext();
          }}
          disabled={submitAttempt && !canProceed}
          style={({ pressed }) => [
            styles.nextBtn,
            {
              backgroundColor:
                submitAttempt && !canProceed
                  ? theme.colors.surfaceAlt
                  : pressed
                    ? theme.colors.primaryHover
                    : theme.colors.primary,
            },
          ]}
        >
          <Text
            style={[
              styles.nextText,
              {
                color:
                  submitAttempt && !canProceed
                    ? theme.colors.textMuted
                    : theme.colors.primaryText,
              },
            ]}
          >
            다음
          </Text>
        </Pressable>
      </View>

      <MenuPickerSheet ref={pickerRef} menus={menus} onPick={handlePickMenu} />
    </View>
  );
};

interface ItemCardProps {
  item: DraftItem;
  index: number;
  onUpdate(patch: Partial<DraftItem>): void;
  onRemove(): void;
  invalid: boolean;
}

const ItemCard = ({ item, index, onUpdate, onRemove, invalid }: ItemCardProps) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.itemCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: invalid ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardIndex, { color: theme.colors.textMuted }]}>
          #{index + 1}
        </Text>
        <Pressable hitSlop={8} onPress={onRemove} accessibilityLabel="항목 삭제">
          <Text style={[styles.removeBtn, { color: theme.colors.danger }]}>삭제</Text>
        </Pressable>
      </View>

      <Field label="메뉴명">
        <TextInput
          value={item.name}
          placeholder="예: 카스 500ml"
          placeholderTextColor={theme.colors.textMuted}
          onChangeText={(text) => onUpdate({ name: text })}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        />
      </Field>

      <Field label="카테고리">
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => {
            const active = item.category === c;
            return (
              <Pressable
                key={c}
                onPress={() => onUpdate({ category: c })}
                style={({ pressed }) => [
                  styles.catChip,
                  {
                    backgroundColor: active
                      ? theme.colors.primary
                      : pressed
                        ? theme.colors.surfaceAlt
                        : theme.colors.surface,
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.catChipText,
                    { color: active ? theme.colors.primaryText : theme.colors.text },
                  ]}
                >
                  {CATEGORY_LABEL[c]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>

      <View style={styles.twoColRow}>
        <View style={styles.colHalf}>
          <Field label="단가 (원, 선택)">
            <TextInput
              value={item.unitPrice == null ? '' : String(item.unitPrice)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={(text) => {
                if (text === '') return onUpdate({ unitPrice: null });
                const n = Number(text);
                onUpdate({ unitPrice: Number.isFinite(n) ? n : null });
              }}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                },
              ]}
            />
          </Field>
        </View>
        <View style={styles.colHalf}>
          <Field label="수량 (선택)">
            <TextInput
              value={item.quantity == null ? '' : String(item.quantity)}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.colors.textMuted}
              onChangeText={(text) => {
                if (text === '') return onUpdate({ quantity: null });
                const n = Number(text);
                onUpdate({
                  quantity: Number.isFinite(n) && n > 0 ? n : null,
                });
              }}
              style={[
                styles.input,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.border,
                },
              ]}
            />
          </Field>
        </View>
      </View>

      <Field label="라인 합계 (원)">
        <TextInput
          value={String(item.amount)}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          onChangeText={(text) => {
            const n = Math.max(0, Number(text) || 0);
            onUpdate({ amount: n });
          }}
          style={[
            styles.input,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        />
      </Field>

      {item.matchedMenuName && (
        <Text style={[styles.matched, { color: theme.colors.textMuted }]}>
          등록 메뉴 매칭: <Text style={{ fontWeight: '700' }}>{item.matchedMenuName}</Text>
        </Text>
      )}
    </View>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
};

// 영수증 미리보기 — 서버 preview 엔드포인트는 인증된 GET 이라 expo-image 의
// headers prop 으로 Authorization 헤더를 넘긴다. 토큰만 알면 token 인자를 그대로
// receiptPreviewUrl 에서 빼 쓴다.
const ReceiptPreview = ({ url }: { url: string }) => {
  const theme = useTheme();
  const cfg = getApiConfig();
  const token = useAuthStore((s) => s.token);
  // receiptPreviewUrl 은 server-relative (e.g. /api/v1/settlement-extraction/preview/<token>).
  // expo-image 는 절대 URL 필요 — baseUrl 을 앞에 붙임.
  const absUrl = url.startsWith('http') ? url : `${cfg.baseUrl}${url}`;
  return (
    <View
      style={[
        styles.previewCard,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.previewLabel, { color: theme.colors.textMuted }]}>
        영수증 미리보기
      </Text>
      <Image
        source={{
          uri: absUrl,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }}
        style={styles.previewImg}
        contentFit="contain"
      />
    </View>
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

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  head: { gap: 4 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  previewCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  previewLabel: { fontSize: 12, fontWeight: '600' },
  previewImg: { width: '100%', height: 200, borderRadius: 8 },
  warning: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  warningText: { fontSize: 13, lineHeight: 18 },
  emptyCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
  },
  itemCard: { borderWidth: 1, borderRadius: 12, padding: 12 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardIndex: { fontSize: 12, fontWeight: '600' },
  removeBtn: { fontSize: 13, fontWeight: '500' },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
  },
  catChipText: { fontSize: 12, fontWeight: '600' },
  twoColRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  colHalf: { flex: 1, marginTop: -10 },
  matched: { fontSize: 11, marginTop: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  addBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 8 },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
  nextBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  nextText: { fontSize: 15, fontWeight: '700' },
});
