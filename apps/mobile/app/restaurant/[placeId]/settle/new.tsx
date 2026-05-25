import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  useAuthStore,
  useRestaurantPublic,
  useSettlementDraftStore,
  useTheme,
} from '@repo/shared';
import { Step1Participants } from '~/components/settlement/Step1Participants';
import { Step2Source } from '~/components/settlement/Step2Source';
import { Step3Edit } from '~/components/settlement/Step3Edit';
import { Step4Review } from '~/components/settlement/Step4Review';

type StepKey = 'participants' | 'source' | 'edit' | 'review';

const STEP_INDEX: Record<StepKey, number> = {
  participants: 1,
  source: 2,
  edit: 3,
  review: 4,
};

// 정산 입력 다단계. 단일 라우트 + 로컬 step state — 새로고침 시 1단계로
// 돌아가지만 draftStore 가 입력값을 보존(앱은 AsyncStorage). 하드웨어 백 버튼
// (안드로이드) 도 step 백을 우선.
export default function SettlementNewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { placeId = '' } = useLocalSearchParams<{ placeId: string }>();
  const detail = useRestaurantPublic(placeId);
  const draft = useSettlementDraftStore();
  const token = useAuthStore((s) => s.token);

  const [step, setStep] = useState<StepKey>('participants');

  // 비로그인은 로그인 화면으로. replace 라 settle/new 가 백스택에 안 남는다.
  useEffect(() => {
    if (!token) router.replace('/(auth)/login' as never);
  }, [token, router]);

  // 식당이 바뀌면 새 draft. 같은 식당이면 진행 중인 입력 보존.
  useEffect(() => {
    if (!placeId) return;
    draft.startFor(placeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  const handleBack = useCallback(() => {
    if (step === 'source') setStep('participants');
    else if (step === 'edit') setStep('source');
    else if (step === 'review') setStep('edit');
    else router.back();
  }, [step, router]);

  // 안드로이드 하드웨어 백 — 라우트가 닫히기 전에 step 백을 먼저 시도.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'participants') return false; // 기본 동작(라우트 back)
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [step, handleBack]);

  if (!placeId) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `정산하기 · ${detail.data?.name ?? ''}`.trim(),
          headerBackTitle: '뒤로',
          headerRight: () => (
            <Text style={[styles.stepIndicator, { color: theme.colors.textMuted }]}>
              {STEP_INDEX[step]}/4
            </Text>
          ),
        }}
      />
      {/* iOS 는 padding 동작이 헤더 높이까지 정확히 맞춰 input 을 키보드 위로 밀어
          올림. Android 는 windowSoftInputMode=adjustResize 가 기본이라 height 면
          충분. ScrollView 의 automaticallyAdjustKeyboardInsets(iOS) 가 카드 입력
          포커스 시 자동 스크롤도 처리해 안전망 두 겹. */}
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {detail.isLoading && !detail.data ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : !detail.data ? (
          <View style={styles.center}>
            <Text style={{ color: theme.colors.danger }}>
              식당 정보를 불러오지 못했습니다.
            </Text>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.scrollContent}
          >
            {step === 'participants' && (
              <Step1Participants onNext={() => setStep('source')} />
            )}
            {step === 'source' && (
              <Step2Source
                placeId={placeId}
                onBack={() => setStep('participants')}
                onProceedToEdit={() => setStep('edit')}
              />
            )}
            {step === 'edit' && (
              <Step3Edit
                menus={detail.data.menus}
                onBack={() => setStep('source')}
                onNext={() => setStep('review')}
              />
            )}
            {step === 'review' && (
              <Step4Review placeId={placeId} onBack={() => setStep('edit')} />
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  scrollContent: { paddingBottom: 32 },
  stepIndicator: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12 },
});
