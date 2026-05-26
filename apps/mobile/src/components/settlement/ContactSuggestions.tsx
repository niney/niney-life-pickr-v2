import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementContacts, useTheme, type Theme } from '@repo/shared';

interface Props {
  // 사용자가 입력 중인 이름. 닉네임도 같이 매칭된다.
  query: string;
  // 부모(Step1)가 focused row 기준으로 토글.
  open: boolean;
  onPick: (contact: SettlementContactType) => void;
}

// 자동완성 — focused 한 이름 input 바로 아래에 인라인으로 펼친다.
// 웹은 absolute 드롭다운이지만 RN ScrollView 안에서 absolute 는 클리핑 등
// 문제가 잦아 인라인 펼침이 안전. 250ms 디바운스 후 GET /me/contacts?q=.
export const ContactSuggestions = ({ query, open, onPick }: Props) => {
  const theme = useTheme();
  const debounced = useDebounced(query.trim(), 250);
  const list = useSettlementContacts({
    q: debounced || undefined,
    take: 10,
  });

  if (!open) return null;

  const items = list.data?.items ?? [];

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      {list.isLoading ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={theme.colors.text} />
          <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>
            단골 찾는 중…
          </Text>
        </View>
      ) : items.length === 0 ? (
        <Text style={[styles.statusText, { color: theme.colors.textMuted, padding: 8 }]}>
          {debounced
            ? `"${debounced}" 에 일치하는 단골이 없습니다`
            : '아직 단골이 없습니다 — 정산을 저장하면 자동 적립됩니다'}
        </Text>
      ) : (
        items.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            // RN 은 web 의 onMouseDown/onBlur race 가 없어 단순 onPress 로 충분.
            onPress={() => onPick(c)}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              },
            ]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.itemName, { color: theme.colors.text }]} numberOfLines={1}>
                {displayName(c)}
              </Text>
              <View style={styles.tagRow}>
                {c.lastExcludeAlcohol && <ContactTag theme={theme}>주류 X</ContactTag>}
                {c.lastExcludeNonAlcohol && <ContactTag theme={theme}>비주류 X</ContactTag>}
                {c.lastExcludeSide && <ContactTag theme={theme}>안주 X</ContactTag>}
                {!c.lastExcludeAlcohol &&
                  !c.lastExcludeNonAlcohol &&
                  !c.lastExcludeSide && <ContactTag theme={theme}>기본</ContactTag>}
              </View>
            </View>
            {c.useCount > 1 && (
              <Text
                style={[
                  styles.useCount,
                  {
                    color: theme.colors.textMuted,
                    backgroundColor: theme.colors.surfaceAlt,
                  },
                ]}
              >
                {c.useCount}회
              </Text>
            )}
          </Pressable>
        ))
      )}
    </View>
  );
};

const ContactTag = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: Theme;
}) => (
  <Text
    style={{
      fontSize: 10,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      color: theme.colors.textMuted,
      backgroundColor: theme.colors.surfaceAlt,
    }}
  >
    {children}
  </Text>
);

export const displayName = (c: SettlementContactType): string => {
  const nm = (c.name ?? '').trim();
  const nick = (c.nickname ?? '').trim();
  if (nm && nick) return `${nm} (${nick})`;
  return nm || nick || '(이름 없음)';
};

// 입력값을 N ms 뒤 안정값으로 늦춰 반환.
const useDebounced = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  statusText: { fontSize: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  itemName: { fontSize: 13, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  useCount: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
