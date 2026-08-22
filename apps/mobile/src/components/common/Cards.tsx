import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@repo/shared';
import type { MciGlyph } from '~/lib/weatherGlyph';

// 날씨·대기 화면 공용 조각 — 카드, 카드 머리, 상태 블록(로딩/에러/빈), 안내 띠, 값 타일.
// 웹의 AirSection/AirStateBlock/WeatherStaleNote 대응. 색은 전부 테마 토큰.

export const Card = ({ children, dim, style }: { children: ReactNode; dim?: boolean; style?: StyleProp<ViewStyle> }) => {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: dim ? 0.6 : 1 },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const CardTitle = ({ title, sub, right }: { title: string; sub?: string | null; right?: ReactNode }) => {
  const theme = useTheme();
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
};

export const StateBlock = ({
  kind,
  message,
  onRetry,
  retrying,
}: {
  kind: 'loading' | 'error' | 'empty';
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) => {
  const theme = useTheme();
  return (
    <View style={styles.state}>
      {kind === 'loading' ? (
        <>
          <ActivityIndicator color={theme.colors.textMuted} />
          <Text style={[styles.stateText, { color: theme.colors.textMuted }]}>{message ?? '불러오는 중…'}</Text>
        </>
      ) : (
        <>
          <Text style={[styles.stateText, { color: kind === 'error' ? theme.colors.danger : theme.colors.textMuted }]}>
            {message ?? (kind === 'error' ? '불러오지 못했습니다.' : '표시할 자료가 없습니다.')}
          </Text>
          {kind === 'error' && onRetry && (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              disabled={retrying}
              style={[styles.retry, { borderColor: theme.colors.border, opacity: retrying ? 0.6 : 1 }]}
            >
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>{retrying ? '재시도 중…' : '재시도'}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
};

// 안내 띠 — warn(저장본 표시 등) / muted(직전 발표분 폴백 등).
export const Note = ({ tone = 'muted', children }: { tone?: 'warn' | 'muted'; children: ReactNode }) => {
  const theme = useTheme();
  const warn = tone === 'warn';
  return (
    <View style={[styles.note, { backgroundColor: warn ? 'rgba(245,158,11,0.12)' : theme.colors.surfaceAlt }]}>
      <Text style={[styles.noteText, { color: warn ? '#b45309' : theme.colors.textMuted }]}>{children}</Text>
    </View>
  );
};

// 값 타일 — 아이콘 + 라벨 + 값(+보조).
export const Tile = ({ icon, label, value, sub }: { icon: MciGlyph; label: string; value: string; sub?: string | null }) => {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { borderColor: theme.colors.border }]}>
      <View style={styles.tileLabelRow}>
        <MaterialCommunityIcons name={icon} size={13} color={theme.colors.textMuted} />
        <Text style={[styles.tileLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.tileValue, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={[styles.tileSub, { color: theme.colors.textMuted }]}>{sub}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 11, lineHeight: 15 },
  state: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  stateText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  retry: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  note: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  noteText: { fontSize: 12, lineHeight: 17 },
  tile: { flex: 1, minWidth: '45%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileLabel: { fontSize: 11 },
  tileValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tileSub: { fontSize: 11 },
});
