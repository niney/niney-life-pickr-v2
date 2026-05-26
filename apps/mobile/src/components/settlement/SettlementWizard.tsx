import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  useRestaurantPublic,
  useSettlement,
  useSettlementDraftAutoSync,
  useSettlementDraftHydrate,
  useSettlementDraftStore,
  useTheme,
  type DraftRound,
  type Theme,
} from '@repo/shared';
import { Step1Participants } from './Step1Participants';
import { Step2Rounds } from './Step2Rounds';
import { Step3Edit } from './Step3Edit';
import { Step4Review } from './Step4Review';

export type StepKey = 'participants' | 'rounds' | 'edit' | 'review';

interface Props {
  // 1차 식당 prefill. 식당 상세 → 정산 진입 시 채워지고, /settlement/new 같은
  // 일반 진입에선 null.
  placeId?: string | null;
  // 편집 모드 식별자. 현재 셸은 create 만 지원하며 #78 에서 hydrate 추가.
  editingId?: string | null;
}

// 정산 wizard 셸 — Step1~4 의 오케스트레이션. step state 와 draftStore 와이어업,
// 서버 임시저장(autoSync) / hydrate, 상단 stepper 까지 담당하고 각 단계 UI 는
// Step* 컴포넌트에 위임. 웹의 SettlementNewPage 와 동일한 흐름의 RN 버전.
export const SettlementWizard = ({ placeId = null, editingId = null }: Props) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const isEdit = Boolean(editingId);

  const draft = useSettlementDraftStore();
  const startFor = useSettlementDraftStore((s) => s.startFor);
  const startFromScratch = useSettlementDraftStore((s) => s.startFromScratch);
  const resetDraft = useSettlementDraftStore((s) => s.reset);

  const firstPlaceDetail = useRestaurantPublic(placeId);
  // 편집 모드: 저장된 세션을 fetch 해서 draft 로 hydrate.
  const session = useSettlement(isEdit ? (editingId ?? null) : null);

  const [step, setStep] = useState<StepKey>('participants');

  // create 진입 시 store 초기화. 같은 1차 식당이면 startFor 가 보존,
  // 식당 비어 있으면 startFromScratch 가 기존 draft 보존.
  useEffect(() => {
    if (isEdit) return; // 편집은 아래 hydrate effect 에서 처리
    if (placeId) {
      const name = firstPlaceDetail.data?.name ?? '';
      startFor(placeId, name);
    } else {
      startFromScratch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, firstPlaceDetail.data?.name, isEdit]);

  // 편집 hydrate — 세션이 도착하면 draft 를 그 값으로 한 번 덮어쓴다.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!isEdit) return;
    if (hydrated) return;
    if (!session.data) return;
    const s = session.data;
    resetDraft();
    const participantsDraft = s.participants.map((p) => ({
      clientId: `p-${p.id}`,
      name: p.name,
      nickname: p.nickname,
      excludeAlcohol: p.excludeAlcohol,
      excludeNonAlcohol: p.excludeNonAlcohol,
      excludeSide: p.excludeSide,
      contactId: p.contactId ?? undefined,
    }));
    const dbIdToClientId = new Map(
      s.participants.map((p) => [p.id, `p-${p.id}`]),
    );
    const roundsDraft: DraftRound[] = s.rounds.map((r) => ({
      clientId: `r-${r.id}`,
      placeId: r.restaurantPlaceId,
      placeName: r.restaurantName,
      source: r.source,
      items: r.items.map((it) => ({
        clientId: `i-${it.id}`,
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        amount: it.amount,
        category: it.category,
        matchedMenuName: it.matchedMenuName,
      })),
      // 편집 모드에선 영수증 토큰은 서버 응답에 없음. 다시 올리지 않는 한 null.
      receiptImageToken: null,
      receiptPreviewUrl: r.receiptPreviewUrl,
      totalAmount: r.totalAmount,
      warning: r.warning,
      attendances: r.attendees.map((a) => ({
        participantClientId: dbIdToClientId.get(a.participantId) ?? '',
        attended: a.attended,
        excludeAlcoholOverride: a.excludeAlcoholOverride,
        excludeNonAlcoholOverride: a.excludeNonAlcoholOverride,
        excludeSideOverride: a.excludeSideOverride,
      })),
      discountAmount: r.discountAmount,
      discountCategory: r.discountCategory,
      categoryAdjustments: r.categoryAdjustments
        ? Object.fromEntries(
            Object.entries(r.categoryAdjustments)
              .filter(([, v]) => v != null)
              .map(([cat, v]) => [
                cat,
                {
                  leftoverParticipantClientId:
                    dbIdToClientId.get(v!.leftoverParticipantId) ?? '',
                  roundUnit: v!.roundUnit,
                },
              ]),
          )
        : null,
    }));
    useSettlementDraftStore.setState({
      participants: participantsDraft,
      rounds: roundsDraft,
    });
    setHydrated(true);
  }, [isEdit, session.data, hydrated, resetDraft]);

  // 서버 draft 자동 sync (로그인 시).
  const draftHydrate = useSettlementDraftHydrate(!isEdit ? placeId : null);
  const autoSync = useSettlementDraftAutoSync({
    placeId,
    placeNameHint:
      firstPlaceDetail.data?.name ?? draft.rounds[0]?.placeName ?? null,
    hydrated: !isEdit && draftHydrate.hydrated,
    initialDraftId: draftHydrate.matched?.id ?? null,
    enabled: !isEdit,
  });

  // 헤더 라벨용 식당명.
  const headerRestaurant = useMemo(() => {
    if (isEdit && session.data) return session.data.restaurantName;
    if (placeId && firstPlaceDetail.data) return firstPlaceDetail.data.name;
    if (draft.rounds[0]?.placeName) return draft.rounds[0].placeName;
    if (placeId && firstPlaceDetail.isLoading) return '불러오는 중…';
    return '';
  }, [
    isEdit,
    session.data,
    placeId,
    firstPlaceDetail.data,
    firstPlaceDetail.isLoading,
    draft.rounds,
  ]);

  const handleHeaderBack = useCallback(() => {
    // 스텝 안에서의 뒤로가기는 각 Step 컴포넌트의 onBack 으로 처리.
    // 헤더 back 은 wizard 자체 종료 — 식당 진입은 식당 상세로, 일반 진입은
    // 뒤로 navigate. expo-router 의 router.back() 이 스택 한 칸 뒤로.
    router.back();
  }, [router]);

  // 편집 hydrate 중에는 로딩 표시 — 아직 store 가 빈 상태로 step1 이 비어
  // 보이는 깜빡임 방지.
  if (isEdit && !hydrated) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '정산 수정' }} />
        <View
          style={[styles.center, { backgroundColor: theme.colors.bg }]}
        >
          <ActivityIndicator color={theme.colors.text} />
        </View>
      </>
    );
  }

  // place 진입인데 식당 404 면 더 진행 불가.
  if (!isEdit && placeId && !firstPlaceDetail.isLoading && !firstPlaceDetail.data) {
    return (
      <>
        <Stack.Screen options={{ headerShown: true, title: '정산하기' }} />
        <View style={[styles.center, { backgroundColor: theme.colors.bg }]}>
          <Text style={[styles.errorText, { color: theme.colors.danger }]}>
            식당 정보를 불러오지 못했습니다.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: headerRestaurant
            ? `${isEdit ? '정산 수정' : '정산하기'} · ${headerRestaurant}`
            : isEdit
              ? '정산 수정'
              : '정산하기',
        }}
      />
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <View
          style={[
            styles.stepperWrap,
            {
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceAlt,
            },
          ]}
        >
          <Stepper
            step={step}
            participantsCount={draft.participants.length}
            rounds={draft.rounds}
            onJump={setStep}
            theme={theme}
          />
          {!isEdit && (
            <AutoSyncBadge
              status={autoSync.status}
              savedAt={autoSync.savedAt}
              theme={theme}
            />
          )}
        </View>

        <View style={styles.body}>
          {step === 'participants' && (
            <Step1Participants onNext={() => setStep('rounds')} />
          )}
          {step === 'rounds' && (
            <Step2Rounds
              onBack={() => setStep('participants')}
              onNext={() => setStep('edit')}
            />
          )}
          {step === 'edit' && (
            <Step3Edit
              onBack={() => setStep('rounds')}
              onNext={() => setStep('review')}
            />
          )}
          {step === 'review' && (
            <Step4Review
              onBack={() => setStep('edit')}
              editingId={editingId}
              fromDraftId={autoSync.draftId}
            />
          )}
        </View>
      </View>
      {/* handleHeaderBack 는 추후 헤더 좌측 버튼에서 호출. 현재는 Stack 의 기본
          back 동작이 그 역할 — 향후 커스텀 헤더에서 hook 으로 활용한다. */}
      {false && <Pressable onPress={handleHeaderBack} />}
    </>
  );
};

// 작은 자동저장 상태 라벨. saved 만 시간 같이, 비로그인(disabled) 는 숨김.
const AutoSyncBadge = ({
  status,
  savedAt,
  theme,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'disabled';
  savedAt: Date | null;
  theme: Theme;
}) => {
  if (status === 'disabled' || (status === 'idle' && !savedAt)) return null;
  let label = '';
  if (status === 'saving') label = '저장 중…';
  else if (status === 'error') label = '저장 실패';
  else if (savedAt) {
    const hh = String(savedAt.getHours()).padStart(2, '0');
    const mm = String(savedAt.getMinutes()).padStart(2, '0');
    label = `임시저장됨 · ${hh}:${mm}`;
  }
  return (
    <Text
      style={{
        fontSize: 11,
        marginTop: 4,
        color:
          status === 'error' ? theme.colors.danger : theme.colors.textMuted,
        textAlign: 'right',
      }}
    >
      {label}
    </Text>
  );
};

const STEPS: { key: StepKey; label: string; short: string }[] = [
  { key: 'participants', label: '인원', short: '1' },
  { key: 'rounds', label: '차수', short: '2' },
  { key: 'edit', label: '편집', short: '3' },
  { key: 'review', label: '결과', short: '4' },
];

// 게이팅 — 웹 SettlementNewPage 의 canJumpTo 와 동일.
const canJumpTo = (
  target: StepKey,
  participantsCount: number,
  rounds: DraftRound[],
): boolean => {
  switch (target) {
    case 'participants':
      return true;
    case 'rounds':
      return participantsCount > 0;
    case 'edit':
      return rounds.length > 0 && rounds.every((r) => r.source !== null);
    case 'review':
      return rounds.length > 0 && rounds.every((r) => r.items.length > 0);
  }
};

interface StepperProps {
  step: StepKey;
  participantsCount: number;
  rounds: DraftRound[];
  onJump: (key: StepKey) => void;
  theme: Theme;
}

const Stepper = ({
  step,
  participantsCount,
  rounds,
  onJump,
  theme,
}: StepperProps) => (
  <View style={{ flexDirection: 'row', gap: 4 }}>
    {STEPS.map((s) => {
      const isActive = s.key === step;
      const enabled = canJumpTo(s.key, participantsCount, rounds);
      return (
        <Pressable
          key={s.key}
          accessibilityRole="button"
          accessibilityState={{
            selected: isActive,
            disabled: !enabled || isActive,
          }}
          disabled={!enabled || isActive}
          onPress={() => onJump(s.key)}
          style={({ pressed }) => [
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingVertical: 8,
              paddingHorizontal: 8,
              borderRadius: 8,
              backgroundColor: isActive
                ? theme.colors.primary
                : pressed && enabled
                  ? theme.colors.surfaceAlt
                  : 'transparent',
              opacity: !enabled && !isActive ? 0.5 : 1,
            },
          ]}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: isActive
                ? theme.colors.primaryText
                : enabled
                  ? theme.colors.text
                  : theme.colors.textMuted,
            }}
          >
            {s.short}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: isActive
                ? theme.colors.primaryText
                : enabled
                  ? theme.colors.text
                  : theme.colors.textMuted,
            }}
          >
            {s.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1 },
    stepperWrap: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    body: { flex: 1 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    errorText: { fontSize: 14, textAlign: 'center' },
    // theme 참조 표시 유지 (lint 회피).
    _placeholder: { color: theme.colors.text },
  });

// loading 표시는 화면 진입 직후 잠깐 — 정적 export 로는 안 쓰임. 향후 hydrate
// 진행 중일 때 호출 예정 (#78 edit 모드).
export const WizardLoading = () => {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
      }}
    >
      <ActivityIndicator color={theme.colors.text} />
    </View>
  );
};
