import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReviewAskStore, useReviewQaReady, useTheme } from '@repo/shared';
import type { ReviewAskResultType } from '@repo/api-contract';

interface Props {
  placeId: string;
  // 완료 배너 제목에 식당명을 싣기 위해 부모(상세)가 전달.
  restaurantName?: string | null;
}

const SUGGESTED = [
  '주차 돼요?',
  '웨이팅 긴가요?',
  '대표 메뉴 뭐예요?',
  '분위기 어때요?',
  '양은 푸짐한가요?',
  '가격대 어때요?',
  '가성비 좋아요?',
  '맛없다는 평도 있어요?',
  '직원분들 친절해요?',
  '아이랑 가도 괜찮아요?',
  '데이트하기 좋아요?',
  '단체 모임 가능해요?',
  '재방문하고 싶다는 평 많아요?',
  '매운 메뉴 있어요?',
  '혼밥하기 괜찮아요?',
  '술 한잔하기 좋아요?',
  '룸(개별 공간) 있어요?',
  '매장 깨끗한가요?',
  '어떤 메뉴가 인기예요?',
  '예약 되나요?',
  // 특별 관련 주제 (상황·니치)
  '여기만의 특별한 점이 있어요?',
  '기념일에 가기 좋아요?',
  '반려동물 동반 되나요?',
  '채식 메뉴 있어요?',
  '뷰가 좋아요?',
  '사진 찍기 좋아요?',
  '콜키지 되나요?',
  '노키즈존인가요?',
  '시즌 한정 메뉴 있어요?',
];

const CONFIDENCE_LABEL: Record<ReviewAskResultType['confidence'], string> = {
  high: '신뢰도 높음',
  medium: '신뢰도 보통',
  low: '신뢰도 낮음',
  none: '정보 부족',
};

// 공개 질문(RAG) 탭 — 식당 리뷰 근거로 AI 가 답한다. 탭 진입 시에만 ready 조회
// (LLM 호출 없음), enrich 안 된 식당은 안내만. 질문은 레이트리밋되는 공개 엔드포인트.
export const AskTab = ({ placeId, restaurantName }: Props) => {
  const theme = useTheme();
  const ready = useReviewQaReady(placeId);
  // 진행 중 요청·결과는 전역 store — 탭/화면을 떠나도 살아남고, 재진입 시
  // 식당별 마지막 Q&A 가 즉시 복원된다(영속).
  const ask = useReviewAskStore((s) => s.ask);
  const setAskTabVisible = useReviewAskStore((s) => s.setAskTabVisible);
  const pending = useReviewAskStore((s) => !!s.inFlight[placeId]);
  const isError = useReviewAskStore((s) => !!s.errorByPlace[placeId]);
  const last = useReviewAskStore((s) => s.lastByPlace[placeId]);
  const isFresh = useReviewAskStore((s) => !!s.freshThisSession[placeId]);
  const [query, setQuery] = useState(last?.query ?? '');

  const result: ReviewAskResultType | null = last?.result ?? null;
  // 이번 세션에서 직접 물어본 답이 아니라 영속 복원된 '지난 답변'이면 안내.
  const isRestored = !!result && !isFresh;

  // 이 AskTab 이 화면에 있는 동안만 visible 등록 — 완료 배너 suppress 판정용.
  // RN 은 탭 전환/화면 이탈 시 이 컴포넌트가 언마운트되므로 신뢰 가능.
  useEffect(() => {
    setAskTabVisible(placeId, true);
    return () => setAskTabVisible(placeId, false);
  }, [placeId, setAskTabVisible]);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || pending) return;
    setQuery(text);
    void ask(placeId, text, restaurantName ?? null);
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
          disabled={!query.trim() || pending}
          style={[
            styles.sendBtn,
            { backgroundColor: theme.colors.primary, opacity: !query.trim() || pending ? 0.5 : 1 },
          ]}
        >
          {pending ? (
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
            disabled={pending}
            style={[styles.chip, { borderColor: theme.colors.border }]}
          >
            <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {pending && (
        <Text style={[styles.muted, { color: theme.colors.textMuted }]}>
          답변을 만드는 중이에요. 다른 화면을 봐도 완료되면 알려드릴게요.
        </Text>
      )}

      {isError && !pending && (
        <Text style={[styles.muted, { color: theme.colors.danger }]}>
          답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </Text>
      )}

      {result && !pending && (
        <View style={{ gap: 8 }}>
          {isRestored && (
            <Text style={[styles.fine, { color: theme.colors.textMuted }]}>
              지난번에 물어본 답변이에요. 다시 물어보면 최신 리뷰로 답해드려요.
            </Text>
          )}
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
