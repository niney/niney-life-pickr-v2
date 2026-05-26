import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ReceiptItemCategoryType } from '@repo/api-contract';
import {
  settlementExtractionApi,
  useRestaurantPublic,
  useSettlementDraftStore,
  useTheme,
  type DraftItem,
  type DraftRound,
  type Theme,
} from '@repo/shared';
import { MenuPickerSheet, parseMenuPrice } from './MenuPickerSheet';
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

// Step3 — 차수별 항목 확인/편집. 메뉴 매칭 시트(#74)·할인(#75) 은 후속.
export const Step3Edit = ({ onBack, onNext }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const rounds = useSettlementDraftStore((s) => s.rounds);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitAttempt, setSubmitAttempt] = useState(false);

  const safeIdx = Math.min(activeIdx, Math.max(0, rounds.length - 1));
  const active = rounds[safeIdx];

  // 진행 가능 — 모든 차수의 항목이 1개 이상, 이름·금액이 유효해야. 할인이
  // 활성화돼 있으면 (1) 양수 (2) 카테고리 풀 ≥ 할인금액.
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
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <Text style={styles.h2}>항목 편집</Text>
          <Text style={styles.body}>
            차수마다 항목과 가격을 확인·수정하세요. 영수증 자동 추출본은 그대로
            쓰거나 옆에서 칸 수정할 수 있습니다.
          </Text>
        </View>

        {rounds.length > 1 && (
          <View style={[styles.tabBar, { backgroundColor: theme.colors.surfaceAlt }]}>
            {rounds.map((r, idx) => {
              const isActive = idx === safeIdx;
              const invalid =
                r.items.length === 0 ||
                r.items.some(
                  (it) => it.name.trim().length === 0 || it.amount <= 0,
                );
              return (
                <Pressable
                  key={r.clientId}
                  accessibilityRole="button"
                  onPress={() => setActiveIdx(idx)}
                  style={({ pressed }) => [
                    styles.tab,
                    {
                      backgroundColor: isActive
                        ? theme.colors.primary
                        : pressed
                          ? theme.colors.surface
                          : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isActive
                        ? theme.colors.primaryText
                        : theme.colors.text,
                    }}
                  >
                    {idx + 1}차
                    {submitAttempt && invalid ? ' !' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {active && (
          <RoundEditor
            key={active.clientId}
            round={active}
            showInvalid={submitAttempt}
            theme={theme}
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.ghostButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>
            이전
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitAttempt && !canProceed}
          onPress={() => {
            setSubmitAttempt(true);
            if (canProceed) onNext();
          }}
          style={({ pressed }) => [
            styles.primaryButton,
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
              styles.primaryButtonText,
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
    </View>
  );
};

interface RoundEditorProps {
  round: DraftRound;
  showInvalid: boolean;
  theme: Theme;
}

const RoundEditor = ({ round, showInvalid, theme }: RoundEditorProps) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const addRoundItem = useSettlementDraftStore((s) => s.addRoundItem);
  const updateRoundItem = useSettlementDraftStore((s) => s.updateRoundItem);
  const removeRoundItem = useSettlementDraftStore((s) => s.removeRoundItem);

  // 메뉴 픽 시트 — 차수의 식당 메뉴를 가져와 보여준다. 차수마다 placeId 가
  // 달라도 활성 차수 detail 만 매번 fetch — react-query 캐시가 같은 식당 진입
  // 시 reuse 한다.
  const detail = useRestaurantPublic(round.placeId);
  const menus = detail.data?.menus ?? [];
  const [menuPickerOpen, setMenuPickerOpen] = useState(false);

  // 항목 메뉴명 input ref Map — Enter 로 새 항목 추가 후 그 행 focus 이동.
  // 행이 unmount 되면 Map 에서 자동 정리.
  const nameRefs = useRef(new Map<string, TextInput | null>());
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFocusId) return;
    const ref = nameRefs.current.get(pendingFocusId);
    if (ref) {
      ref.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, round.items]);

  // Enter / "다음" 키: 마지막 항목이면 새 빈 항목 추가 + 그 행 메뉴명 focus.
  // 중간 항목이면 다음 항목 focus. 빈 이름이면 무시.
  const handleItemSubmit = (itemClientId: string) => {
    const idx = round.items.findIndex((it) => it.clientId === itemClientId);
    const it = round.items[idx];
    if (!it) return;
    if (it.name.trim().length === 0) return;
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

  const subtotal = useMemo(
    () => round.items.reduce((sum, it) => sum + (it.amount || 0), 0),
    [round.items],
  );

  const subtotalMismatch =
    round.source === 'RECEIPT' &&
    round.totalAmount != null &&
    Math.abs(subtotal - round.totalAmount) >= 1;

  return (
    <View style={{ gap: 12 }}>
      {round.source === 'RECEIPT' && round.receiptPreviewUrl && (
        <View style={styles.card}>
          <Text style={[styles.cardLabel, { color: theme.colors.textMuted }]}>
            {round.placeName} · 영수증 미리보기
          </Text>
          <ReceiptPreviewImage url={round.receiptPreviewUrl} theme={theme} />
        </View>
      )}

      {(round.warning || subtotalMismatch) && (
        <View
          style={[
            styles.warnBanner,
            { backgroundColor: theme.colors.dangerBg, borderColor: theme.colors.danger },
          ]}
        >
          {round.warning && (
            <Text style={[styles.warnText, { color: theme.colors.text }]}>
              ⚠ {round.warning}
            </Text>
          )}
          {subtotalMismatch && (
            <Text style={[styles.warnText, { color: theme.colors.text }]}>
              ⚠ 항목 합계 {subtotal.toLocaleString('ko-KR')}원 — 영수증 총액{' '}
              {round.totalAmount?.toLocaleString('ko-KR')}원과 일치하지 않습니다.
            </Text>
          )}
        </View>
      )}

      {round.items.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={[styles.body, { textAlign: 'center' }]}>
            항목이 없습니다. 아래 버튼으로 추가하세요.
          </Text>
        </View>
      )}

      {round.items.map((it, idx) => (
        <ItemRow
          key={it.clientId}
          item={it}
          index={idx}
          isLast={idx === round.items.length - 1}
          onUpdate={(patch) =>
            updateRoundItem(round.clientId, it.clientId, patch)
          }
          onRemove={() => removeRoundItem(round.clientId, it.clientId)}
          onSubmit={() => handleItemSubmit(it.clientId)}
          nameRef={(el) => {
            if (el) nameRefs.current.set(it.clientId, el);
            else nameRefs.current.delete(it.clientId);
          }}
          invalid={showInvalid && (it.name.trim().length === 0 || it.amount <= 0)}
          theme={theme}
        />
      ))}

      <View style={styles.addRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            addRoundItem(round.clientId, {
              name: '',
              unitPrice: null,
              quantity: 1,
              amount: 0,
              category: 'UNCATEGORIZED',
              matchedMenuName: null,
            })
          }
          style={({ pressed }) => [
            styles.addButton,
            {
              borderColor: theme.colors.border,
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={[styles.addButtonText, { color: theme.colors.text }]}>
            + 항목 추가
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMenuPickerOpen(true)}
          style={({ pressed }) => [
            styles.addButton,
            {
              borderColor: theme.colors.border,
              borderStyle: 'solid',
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : theme.colors.surfaceAlt,
            },
          ]}
        >
          <Text style={[styles.addButtonText, { color: theme.colors.text }]}>
            🍽 메뉴에서
          </Text>
        </Pressable>
      </View>

      <MenuPickerSheet
        open={menuPickerOpen}
        menus={menus}
        onClose={() => setMenuPickerOpen(false)}
        onPick={(menu) => {
          const price = parseMenuPrice(menu.price);
          addRoundItem(round.clientId, {
            name: menu.name,
            unitPrice: price,
            quantity: 1,
            amount: price ?? 0,
            category: 'UNCATEGORIZED',
            matchedMenuName: menu.name,
          });
        }}
      />

      <View
        style={[
          styles.discountWrap,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <RoundDiscountEditor round={round} />
      </View>

      <View
        style={[
          styles.subtotalRow,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.subtotalLabel, { color: theme.colors.text }]}>
          차수 합계
        </Text>
        <Text style={[styles.subtotalValue, { color: theme.colors.text }]}>
          {(subtotal - (round.discountAmount ?? 0)).toLocaleString('ko-KR')}원
          {round.discountAmount ? (
            <Text style={{ fontSize: 11, fontWeight: '400', color: theme.colors.textMuted }}>
              {` (${subtotal.toLocaleString('ko-KR')} − ${round.discountAmount.toLocaleString('ko-KR')})`}
            </Text>
          ) : null}
        </Text>
      </View>
    </View>
  );
};

interface ItemRowProps {
  item: DraftItem;
  index: number;
  isLast: boolean;
  onUpdate: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
  onSubmit: () => void;
  nameRef: (el: TextInput | null) => void;
  invalid: boolean;
  theme: Theme;
}

const ItemRow = ({
  item,
  index,
  isLast,
  onUpdate,
  onRemove,
  onSubmit,
  nameRef,
  invalid,
  theme,
}: ItemRowProps) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      style={[
        styles.itemCard,
        {
          borderColor: invalid ? theme.colors.danger : theme.colors.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardIndex, { color: theme.colors.textMuted }]}>
          #{index + 1}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제"
          onPress={onRemove}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceAlt
                : 'transparent',
            },
          ]}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: 16 }}>🗑</Text>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          메뉴명
        </Text>
        <TextInput
          ref={nameRef}
          value={item.name}
          placeholder="예: 카스 500ml"
          placeholderTextColor={theme.colors.textMuted}
          onChangeText={(v) => onUpdate({ name: v })}
          returnKeyType={isLast ? 'done' : 'next'}
          onSubmitEditing={onSubmit}
          style={styles.input}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          카테고리
        </Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => {
            const sel = item.category === c;
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                onPress={() => onUpdate({ category: c })}
                style={({ pressed }) => [
                  styles.catChip,
                  {
                    borderColor: sel ? theme.colors.primary : theme.colors.border,
                    backgroundColor: sel
                      ? theme.colors.primary
                      : pressed
                        ? theme.colors.surfaceAlt
                        : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: sel ? theme.colors.primaryText : theme.colors.text,
                  }}
                >
                  {CATEGORY_LABEL[c]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.priceGrid}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>
            단가 (원, 선택)
          </Text>
          <TextInput
            value={item.unitPrice == null ? '' : String(item.unitPrice)}
            placeholder="0"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            onChangeText={(v) => {
              if (v === '') {
                onUpdate({ unitPrice: null });
                return;
              }
              const n = Number(v.replace(/[^0-9]/g, ''));
              onUpdate({ unitPrice: Number.isFinite(n) ? n : null });
            }}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>
            수량 (선택)
          </Text>
          <TextInput
            value={item.quantity == null ? '' : String(item.quantity)}
            placeholder="1"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="numeric"
            onChangeText={(v) => {
              if (v === '') {
                onUpdate({ quantity: null });
                return;
              }
              const n = Number(v.replace(/[^0-9]/g, ''));
              onUpdate({
                quantity: Number.isFinite(n) && n > 0 ? n : null,
              });
            }}
            style={styles.input}
          />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          라인 합계 (원)
        </Text>
        <TextInput
          value={String(item.amount ?? 0)}
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
          onChangeText={(v) => {
            const n = Number(v.replace(/[^0-9]/g, ''));
            onUpdate({
              amount: Number.isFinite(n) && n > 0 ? n : 0,
            });
          }}
          style={styles.input}
        />
      </View>

      {item.matchedMenuName && (
        <Text style={[styles.matchedText, { color: theme.colors.textMuted }]}>
          등록 메뉴 매칭: {item.matchedMenuName}
        </Text>
      )}
    </View>
  );
};

// 영수증 미리보기 — preview 라우트는 JWT 필요해서 일반 <Image src> 직접 호출
// 불가. fetch 로 blob 받아 base64 data URL 로 변환해 Image 의 source 로.
const ReceiptPreviewImage = ({ url, theme }: { url: string; theme: Theme }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = url.split('/').pop() ?? '';
    (async () => {
      try {
        const blob = await settlementExtractionApi.previewBlob(token);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (cancelled) return;
          if (typeof reader.result === 'string') setDataUrl(reader.result);
          else setError('미리보기 변환 실패');
        };
        reader.onerror = () => {
          if (!cancelled) setError('미리보기 변환 실패');
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '미리보기 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <Text style={{ fontSize: 12, color: theme.colors.danger }}>{error}</Text>
    );
  }
  if (!dataUrl) {
    return (
      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
        미리보기 불러오는 중…
      </Text>
    );
  }
  return (
    <Image
      source={{ uri: dataUrl }}
      style={{
        width: '100%',
        height: 240,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceAlt,
      }}
      resizeMode="contain"
    />
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.bg },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },
    h2: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    body: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
    tabBar: {
      flexDirection: 'row',
      gap: 4,
      padding: 4,
      borderRadius: 8,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 6,
      alignItems: 'center',
    },
    card: {
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      gap: 8,
    },
    cardLabel: { fontSize: 12, fontWeight: '500' },
    warnBanner: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      gap: 4,
    },
    warnText: { fontSize: 12, lineHeight: 18 },
    emptyBox: {
      padding: 24,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderStyle: 'dashed',
    },
    itemCard: {
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.surface,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardIndex: { fontSize: 12, fontWeight: '600' },
    iconButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
    },
    label: { fontSize: 11, fontWeight: '500' },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      color: theme.colors.text,
      backgroundColor: theme.colors.bg,
    },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    catChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    priceGrid: { flexDirection: 'row', gap: 8 },
    matchedText: { fontSize: 11 },
    addRow: { flexDirection: 'row', gap: 8 },
    addButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      alignItems: 'center',
    },
    addButtonText: { fontSize: 13, fontWeight: '600' },
    discountWrap: {
      padding: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    subtotalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
    },
    subtotalLabel: { fontSize: 14 },
    subtotalValue: { fontSize: 16, fontWeight: '700' },
    footer: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.bg,
    },
    ghostButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
    },
    ghostButtonText: { fontSize: 14, fontWeight: '500' },
    primaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryButtonText: { fontSize: 15, fontWeight: '600' },
  });
