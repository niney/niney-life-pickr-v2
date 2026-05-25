import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import type { MenuItemType } from '@repo/api-contract';
import { useTheme } from '@repo/shared';

export interface MenuPickerSheetRef {
  present(): void;
  dismiss(): void;
}

interface Props {
  menus: MenuItemType[];
  onPick(menu: MenuItemType): void;
}

// 식당 등록 메뉴에서 항목 1개 선택해 추가. 단일 선택 — 누르는 즉시 닫힘.
// imperative ref 패턴 — 부모가 sheetRef.current?.present() 로 직접 띄운다.
// open prop 기반 useEffect 는 BottomSheetModal portal 마운트 타이밍 때문에
// ref 가 null 인 채로 호출되어 시트가 안 뜨는 사고가 있어 ref 패턴으로 통일.
export const MenuPickerSheet = forwardRef<MenuPickerSheetRef, Props>(
  ({ menus, onPick }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [q, setQ] = useState('');

    useImperativeHandle(ref, () => ({
      present: () => {
        setQ('');
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const filtered = useMemo(() => {
      const term = q.trim().toLowerCase();
      if (term.length === 0) return menus;
      return menus.filter((m) => m.name.toLowerCase().includes(term));
    }, [menus, q]);

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
        snapPoints={['75%']}
        // v5 기본값이 true 라 snapPoints 와 충돌해 시트가 안 뜨는 케이스가 있어 명시 off.
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>메뉴에서 추가</Text>
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
            placeholder="메뉴 검색"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.search, { color: theme.colors.text }]}
            autoCorrect={false}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={[styles.empty, { color: theme.colors.textMuted }]}>
              {menus.length === 0 ? '등록된 메뉴가 없습니다.' : '검색 결과가 없습니다.'}
            </Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={filtered}
            keyExtractor={(m, idx) => `${m.name}-${idx}`}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item: m }) => (
              <Pressable
                onPress={() => {
                  onPick(m);
                  sheetRef.current?.dismiss();
                }}
                android_ripple={{ color: theme.colors.surfaceAlt }}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: theme.colors.surfaceAlt },
                  {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.border,
                  },
                ]}
              >
                <Text style={[styles.menuName, { color: theme.colors.text }]} numberOfLines={1}>
                  {m.name}
                </Text>
                {m.price && (
                  <Text style={[styles.price, { color: theme.colors.textMuted }]}>
                    {m.price}
                  </Text>
                )}
              </Pressable>
            )}
          />
        )}
      </BottomSheetModal>
    );
  },
);

MenuPickerSheet.displayName = 'MenuPickerSheet';

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  search: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  center: { paddingVertical: 32, alignItems: 'center' },
  empty: { fontSize: 13, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuName: { fontSize: 14, fontWeight: '500', flex: 1, minWidth: 0 },
  price: { fontSize: 12 },
});
