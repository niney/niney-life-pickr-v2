import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReviewAskPublic, useReviewQaReady, useTheme } from '@repo/shared';
import type { ReviewAskResultType } from '@repo/api-contract';

interface Props {
  placeId: string;
}

const SUGGESTED = ['주차 돼요?', '웨이팅 긴가요?', '대표 메뉴 뭐예요?', '분위기 어때요?'];

const CONFIDENCE_LABEL: Record<ReviewAskResultType['confidence'], string> = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
  none: '정보 부족',
};

// 공개 질문(RAG) 탭 — 식당 리뷰 근거로 AI 가 답한다. 탭 진입 시에만 ready 조회
// (LLM 호출 없음), enrich 안 된 식당은 안내만. 질문은 레이트리밋되는 공개 엔드포인트.
export const AskTab = ({ placeId }: Props) => {
  const theme = useTheme();
  const ready = useReviewQaReady(placeId);
  const askMut = useReviewAskPublic();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ReviewAskResultType | null>(null);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || askMut.isPending) return;
    setQuery(text);
    askMut.mutate(
      { placeId, query: text },
      { onSuccess: (r) => setResult(r), onError: () => setResult(null) },
    );
  };

  if (ready.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.textMuted} />
      </View>
    );
  }

  if (!ready.data?.ready) {
    return (
      <View style={styles.center}>
        <Text style={[styles.muted, { color: theme.colors.textMuted, textAlign: 'center' }]}>
          아직 이 식당은 리뷰 분석이{'\n'}준비되지 않았어요.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={{ gap: 4 }}>
        <Text style={[styles.h3, { color: theme.colors.text }]}>✨ 리뷰로 물어보기</Text>
        <Text style={[styles.muted, { color: theme.colors.textMuted }]}>
          방문자 리뷰 {ready.data.count.toLocaleString()}건을 근거로 AI 가 답합니다. 리뷰에 없는 내용은 답하지
          않아요.
        </Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => submit(query)}
          placeholder="이 식당에 대해 물어보세요"
          placeholderTextColor={theme.colors.textMuted}
          maxLength={200}
          returnKeyType="search"
          style={[
            styles.input,
            { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
          ]}
        />
        <Pressable
          onPress={() => submit(query)}
          disabled={!query.trim() || askMut.isPending}
          style={[
            styles.sendBtn,
            { backgroundColor: theme.colors.primary, opacity: !query.trim() || askMut.isPending ? 0.5 : 1 },
          ]}
        >
          {askMut.isPending ? (
            <ActivityIndicator color={theme.colors.primaryText} size="small" />
          ) : (
            <Text style={{ color: theme.colors.primaryText, fontWeight: '600' }}>질문</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.chips}>
        {SUGGESTED.map((s) => (
          <Pressable
            key={s}
            onPress={() => submit(s)}
            disabled={askMut.isPending}
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {askMut.isError && (
        <Text style={[styles.muted, { color: theme.colors.danger }]}>
          답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </Text>
      )}

      {result && !askMut.isPending && (
        <View style={{ gap: 8 }}>
          <View style={[styles.answerBox, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Text style={[styles.badge, { color: theme.colors.textMuted }]}>
              {CONFIDENCE_LABEL[result.confidence]}
            </Text>
            <Text style={[styles.answer, { color: theme.colors.text }]}>{result.answer}</Text>
          </View>

          {result.verification?.applied && result.verification.dropped.length > 0 && (
            <Text style={[styles.fine, { color: theme.colors.textMuted }]}>
              ※ 근거가 부족한 내용 {result.verification.dropped.length}건은 답변에서 제외했어요.
            </Text>
          )}

          {result.citations.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={[styles.muted, { color: theme.colors.textMuted }]}>
                근거 리뷰 {result.citations.length}건
              </Text>
              {result.citations.map((c, i) => (
                <View key={c.reviewId} style={[styles.cite, { borderColor: theme.colors.border }]}>
                  <Text style={[styles.fine, { color: theme.colors.textMuted }]}>
                    [{i + 1}]{c.rating != null ? ` ★ ${c.rating}` : ''}
                  </Text>
                  <Text style={[styles.citeBody, { color: theme.colors.text }]}>{c.body}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={[styles.fine, { color: theme.colors.textMuted }]}>
            AI 가 리뷰를 요약한 답변으로, 실제와 다를 수 있어요.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  center: { padding: 32, alignItems: 'center', justifyContent: 'center', gap: 8 },
  h3: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 12, lineHeight: 17 },
  fine: { fontSize: 11, lineHeight: 16 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  sendBtn: { borderRadius: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 56 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12 },
  answerBox: { borderRadius: 8, padding: 12, gap: 6 },
  badge: { fontSize: 11, fontWeight: '600' },
  answer: { fontSize: 13, lineHeight: 20 },
  cite: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 3 },
  citeBody: { fontSize: 12, lineHeight: 18 },
});
