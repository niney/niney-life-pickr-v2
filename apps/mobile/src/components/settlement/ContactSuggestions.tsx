import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SettlementContactType } from '@repo/api-contract';
import { useSettlementContacts, useTheme } from '@repo/shared';

interface Props {
  // 현재 이름 input 의 값. 빈 문자열이면 listbox 자체를 숨긴다.
  query: string;
  // 부모(Step1) 가 focus 여부로 토글. 포커스 잃었을 때 결과가 잠깐 깜빡이는
  // 사고를 피하려면 부모가 microtask 늦춰 닫는 패턴이 자연스럽다.
  open: boolean;
  onPick(contact: SettlementContactType): void;
}

// 이름 input 바로 아래 inline 으로 단골 자동완성을 표시. 모바일에서 absolute
// 로 띄우면 키보드 위에 가려지거나 다른 input 을 덮어버려 더 혼란스러워서
// inline 으로 배치 — 결과가 있을 때만 자리가 생긴다.
//
// 결과는 최대 3 개. 더 많은 단골을 보고 싶을 땐 "단골에서 추가" 시트를 쓴다.
export const ContactSuggestions = ({ query, open, onPick }: Props) => {
  const theme = useTheme();
  const debounced = useDebounced(query.trim(), 200);
  const list = useSettlementContacts({
    q: debounced || undefined,
    take: 6,
  });

  // 빈 입력일 땐 리스트 자체를 숨겨 인라인 공간 차지 안 함.
  if (!open || debounced.length === 0) return null;

  const items = (list.data?.items ?? []).slice(0, 3);
  if (list.isLoading || items.length === 0) return null;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {items.map((c, i) => (
        <Pressable
          key={c.id}
          // mousedown 비유 — RN 에선 onPressIn 가 blur 보다 먼저 발동. blur 가
          // 부모에서 list 를 닫기 전에 선택을 처리해야 onPick 도달 보장.
          onPressIn={() => onPick(c)}
          android_ripple={{ color: theme.colors.surfaceAlt }}
          style={({ pressed }) => [
            styles.row,
            i > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
            },
            pressed && { backgroundColor: theme.colors.surfaceAlt },
          ]}
        >
          <View style={styles.rowMid}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {displayName(c)}
            </Text>
            <View style={styles.tagRow}>
              {c.lastExcludeAlcohol && <Tag>주류 X</Tag>}
              {c.lastExcludeNonAlcohol && <Tag>비주류 X</Tag>}
              {c.lastExcludeSide && <Tag>안주 X</Tag>}
            </View>
          </View>
          {c.useCount > 1 && (
            <Text style={[styles.count, { color: theme.colors.textMuted }]}>
              {c.useCount}회
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
};

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

const useDebounced = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  rowMid: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  count: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
