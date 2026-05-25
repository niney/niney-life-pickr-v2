import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementContacts, useTheme } from '@repo/shared';

export interface ContactPickerSheetRef {
  present(): void;
  dismiss(): void;
}

interface Props {
  // 이미 추가된 단골을 비활성 표시하기 위한 두 세트.
  // - contactIds: 자동완성/단골 모달로 추가된 행
  // - keys: 직접 타이핑한 행이지만 normalizedKey 가 단골과 일치
  existingContactIds: Set<string>;
  existingKeys: Set<string>;
  onConfirm(picked: SettlementContactType[]): void;
}

// 정산 입력 1단계의 "단골에서 추가" 시트. 다중 선택 → 한 번에 append.
// imperative ref 패턴 — 부모가 sheetRef.current?.present() 로 직접 띄운다.
// open prop 기반 useEffect 는 BottomSheetModal portal 마운트 타이밍 때문에
// ref 가 null 인 채로 호출되어 시트가 안 뜨는 사고가 있어 ref 패턴으로 통일.
export const ContactPickerSheet = forwardRef<ContactPickerSheetRef, Props>(
  ({ existingContactIds, existingKeys, onConfirm }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [q, setQ] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const list = useSettlementContacts({
      q: q.trim() || undefined,
      take: 100,
    });

    useImperativeHandle(ref, () => ({
      present: () => {
        setQ('');
        setSelected(new Set());
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const items = list.data?.items ?? [];

    const isAlreadyAdded = useMemo(
      () => (c: SettlementContactType) => {
        if (existingContactIds.has(c.id)) return true;
        return existingKeys.has(normalizeContactKey(c.name, c.nickname));
      },
      [existingContactIds, existingKeys],
    );

    const toggle = (id: string) => {
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const handleConfirm = () => {
      const picked = items.filter((c) => selected.has(c.id));
      onConfirm(picked);
      sheetRef.current?.dismiss();
    };

    const renderBackdrop = (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['85%']}
        // v5 기본값이 true 라 snapPoints 와 충돌해 시트가 안 뜨는 케이스가 있어 명시 off.
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>단골에서 추가</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {selected.size > 0
              ? `${selected.size}명 선택됨`
              : '여러 명을 한 번에 추가할 수 있어요'}
          </Text>
        </View>

        <View
          style={[
            styles.searchWrap,
            { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
          ]}
        >
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="이름·닉네임 검색"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.search, { color: theme.colors.text }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {list.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {q.trim()
                ? `'${q.trim()}' 에 일치하는 단골이 없습니다`
                : '아직 단골이 없습니다 — 정산을 저장하면 자동으로 적립됩니다'}
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item: c }) => {
              const already = isAlreadyAdded(c);
              const checked = selected.has(c.id);
              return (
                <Pressable
                  disabled={already}
                  onPress={() => toggle(c.id)}
                  android_ripple={{ color: theme.colors.surfaceAlt }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && !already && { backgroundColor: theme.colors.surfaceAlt },
                    already && { opacity: 0.5 },
                  ]}
                >
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: checked ? theme.colors.primary : theme.colors.border,
                        backgroundColor: checked ? theme.colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {checked && (
                      <Text style={[styles.checkMark, { color: theme.colors.primaryText }]}>
                        ✓
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowMid}>
                    <Text
                      style={[styles.name, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {displayName(c)}
                    </Text>
                    <View style={styles.tagRow}>
                      {c.lastExcludeAlcohol && <Tag>주류 X</Tag>}
                      {c.lastExcludeNonAlcohol && <Tag>비주류 X</Tag>}
                      {c.lastExcludeSide && <Tag>안주 X</Tag>}
                      <Tag>{`${c.useCount}회`}</Tag>
                    </View>
                  </View>
                  {already && (
                    <Text style={[styles.already, { color: theme.colors.textMuted }]}>
                      이미 추가됨
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        )}

        <View
          style={[
            styles.footer,
            { borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        >
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            style={({ pressed }) => [
              styles.ghostBtn,
              { borderColor: theme.colors.border },
              pressed && { backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <Text style={[styles.ghostText, { color: theme.colors.text }]}>취소</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={selected.size === 0}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor:
                  selected.size === 0
                    ? theme.colors.surfaceAlt
                    : pressed
                      ? theme.colors.primaryHover
                      : theme.colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryText,
                {
                  color:
                    selected.size === 0 ? theme.colors.textMuted : theme.colors.primaryText,
                },
              ]}
            >
              추가
            </Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    );
  },
);

ContactPickerSheet.displayName = 'ContactPickerSheet';

const Tag = ({ children }: { children: string }) => {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.tag,
        { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.textMuted },
      ]}
    >
      {children}
    </Text>
  );
};

const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};

// 서버 normalizeContactKey 와 동일 — 직접 타이핑한 행이 단골과 매칭될 때
// 중복 표시용.
const normalizeContactKey = (name: string | null, nickname: string | null): string => {
  const n = (name ?? '').trim().toLowerCase();
  const k = (nickname ?? '').trim().toLowerCase();
  return `${n}|${k}`;
};

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  search: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  center: { paddingVertical: 32, alignItems: 'center' },
  empty: { fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  check: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  rowMid: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  already: { fontSize: 11 },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
  primaryBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
