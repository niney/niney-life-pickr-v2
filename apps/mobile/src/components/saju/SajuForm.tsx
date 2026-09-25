import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { SajuBirthInputType, SajuProfileType } from '@repo/api-contract';
import { SAJU_DISCLAIMER, sameSajuBirth, useSajuProfileStore, useSajuProfiles, type SajuSaveRequest, type SajuSession } from '@repo/shared';
import { SAJU_SUPPORTED_YEARS, daysInMonth, lunarMonthLength } from '@repo/utils';
import { PickerField, type PickerOption } from './SajuPicker';
import { CheckRow, Glass, Icon, Muted, PrimaryButton, SegButton, TextButton, Wrap } from './sajuUi';
import { SERIF, SJ, gold, ink, salmon, white } from './sajuTokens';

// 입력 폼 — 웹 SajuForm 과 같은 구성. 상단 모드 토글 "내 사주 / 우리 궁합". 내 사주: 생년월일(양/음력·윤달)·시각(모름
// 허용)·성별·고급 옵션(진태양시·야자시) + 프로필 칩·저장. 우리 궁합: 나 + 상대 두 사람 → 결과 화면.
// 검증 메시지는 세션(리듀서 submit / submitPair)이 준다.

type ProfileChip = { id: string; label: string; birth: SajuBirthInputType; primary: boolean; local: boolean };

const MONTHS: ReadonlyArray<PickerOption<number>> = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` }));
const HOURS: ReadonlyArray<PickerOption<number | null>> = [{ value: null, label: '모름' }, ...Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${String(h).padStart(2, '0')}시` }))];
const MINUTES: ReadonlyArray<PickerOption<number>> = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: `${String(i * 5).padStart(2, '0')}분` }));

/** 연도 칸 — 지우고 다시 쓰는 중간 상태('' · '19')를 허용하려고 글자를 따로 들고, 바깥 값이 바뀌면(프로필 칩) 맞춘다. */
const YearField = ({ year, onYear, label }: { year: number; onYear: (y: number) => void; label: string }) => {
  const [text, setText] = useState(String(year));
  const [synced, setSynced] = useState(year);
  if (year !== synced) {
    setSynced(year);
    setText(String(year));
  }
  const invalid = text.length === 4 && (year < SAJU_SUPPORTED_YEARS.from || year > SAJU_SUPPORTED_YEARS.to);
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={(t) => {
        const digits = t.replace(/\D/g, '').slice(0, 4);
        const y = Number(digits) || 0;
        setText(digits);
        setSynced(y);
        onYear(y);
      }}
      keyboardType="number-pad"
      maxLength={4}
      placeholder="1990"
      placeholderTextColor={ink(0.3)}
      style={[styles.input, invalid && { borderColor: salmon(0.6) }]}
    />
  );
};

const FieldLabel = ({ text, dim = false }: { text: string; dim?: boolean }) => <Text style={[styles.fieldLabel, dim && { color: ink(0.35) }]}>{text}</Text>;

/** 생년월일시·성별 입력 묶음 — 나·상대 공용. prefix 는 접근성 이름 앞에 붙는다('상대 년'). */
const BirthFields = ({ input, onChange, prefix = '' }: { input: SajuBirthInputType; onChange: (patch: Partial<SajuBirthInputType>) => void; prefix?: string }) => {
  const monthDays = input.calendar === 'lunar' ? (lunarMonthLength(input.year, input.month, input.leapMonth) ?? 30) : daysInMonth(input.year, input.month);
  const days: ReadonlyArray<PickerOption<number>> = Array.from({ length: monthDays }, (_, i) => ({ value: i + 1, label: `${i + 1}일` }));
  const hasLeap = input.calendar === 'lunar' && lunarMonthLength(input.year, input.month, true) !== null;
  const L = (s: string) => `${prefix}${s}`;
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        {(['solar', 'lunar'] as const).map((c) => (
          <SegButton key={c} flex label={c === 'solar' ? '양력' : '음력'} active={input.calendar === c} onPress={() => onChange({ calendar: c, leapMonth: false })} accessibilityLabel={L(c === 'solar' ? '양력' : '음력')} />
        ))}
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <FieldLabel text="년" />
          <YearField year={input.year} onYear={(year) => onChange({ year })} label={L('년')} />
        </View>
        <View style={styles.cell}>
          <FieldLabel text="월" />
          <PickerField label={L('월')} value={input.month} options={MONTHS} onChange={(month) => onChange({ month, leapMonth: false })} />
        </View>
        <View style={styles.cell}>
          <FieldLabel text="일" />
          <PickerField label={L('일')} value={Math.min(input.day, monthDays)} options={days} columns={7} onChange={(day) => onChange({ day })} />
        </View>
      </View>
      {input.calendar === 'lunar' ? <CheckRow label={hasLeap ? '윤달' : '윤달 (이 해엔 윤달이 없어요)'} checked={input.leapMonth} disabled={!hasLeap} onChange={(leapMonth) => onChange({ leapMonth })} /> : null}
      <View style={[styles.row, { alignItems: 'flex-end' }]}>
        <View style={styles.cell}>
          <FieldLabel text="시" />
          <PickerField
            label={L('시')}
            value={input.hour}
            options={HOURS}
            columns={5}
            onChange={(hour) => onChange({ hour, minute: hour === null ? null : (input.minute ?? 0) })}
          />
        </View>
        <View style={styles.cell}>
          <FieldLabel text="분" dim={input.hour === null} />
          <PickerField label={L('분')} value={input.minute ?? 0} options={MINUTES} disabled={input.hour === null} onChange={(minute) => onChange({ minute })} />
        </View>
        <View style={[styles.row, { gap: 4 }]}>
          {(['M', 'F'] as const).map((g) => (
            <SegButton key={g} label={g === 'M' ? '남' : '여'} active={input.gender === g} onPress={() => onChange({ gender: g })} accessibilityLabel={L(g === 'M' ? '남' : '여')} />
          ))}
        </View>
      </View>
    </View>
  );
};

const ProfileChips = ({ profiles, activeId, onPick, onRemove }: { profiles: ProfileChip[]; activeId: string | null; onPick: (p: ProfileChip) => void; onRemove: (id: string) => void }) =>
  profiles.length === 0 ? null : (
    <Wrap gap={6}>
      {profiles.map((p) => {
        const active = activeId === p.id;
        return (
          <View key={p.id} style={[styles.chip, active ? { borderColor: SJ.gold, backgroundColor: gold(0.15) } : null]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${p.label} 불러오기`} onPress={() => onPick(p)} hitSlop={4} style={styles.chipMain}>
              <Text style={{ fontSize: 12, color: active ? SJ.cream : ink(0.72) }}>
                {p.label}
                {p.primary ? <Text style={{ color: SJ.gold }}> ★</Text> : null}
              </Text>
            </Pressable>
            {p.local ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${p.label} 삭제`} onPress={() => onRemove(p.id)} hitSlop={6} style={styles.chipSide}>
                <Icon name="close" size={12} color={ink(0.45)} />
              </Pressable>
            ) : (
              <View style={styles.chipSide}>
                <Text style={{ fontSize: 10, color: ink(0.4) }}>계정</Text>
              </View>
            )}
          </View>
        );
      })}
    </Wrap>
  );

export const SajuForm = ({ session, onSubmit }: { session: SajuSession; onSubmit: (save: SajuSaveRequest) => void }) => {
  const { mode, isMember, birth: input, partner, partnerLabel } = session;
  const localProfiles = useSajuProfileStore((s) => s.profiles);
  const localPrimaryId = useSajuProfileStore((s) => s.primaryId);
  const removeLocalProfile = useSajuProfileStore((s) => s.remove);
  // 회원은 서버 프로필(나·가족), 게스트는 기기 로컬 프로필을 칩으로.
  const serverProfiles = useSajuProfiles();
  const profiles: ProfileChip[] = isMember
    ? (serverProfiles.data?.items ?? []).map((p: SajuProfileType) => ({ id: p.id, label: p.label, birth: p.birth, primary: p.isPrimary, local: false }))
    : localProfiles.map((p) => ({ id: p.id, label: p.label, birth: p.birth, primary: p.id === localPrimaryId, local: true }));
  const [advanced, setAdvanced] = useState(false);
  const [save, setSave] = useState(true);
  const [label, setLabel] = useState('나');
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [activePartnerProfile, setActivePartnerProfile] = useState<string | null>(null);

  const applyProfile = (p: ProfileChip) => {
    setActiveProfile(p.id);
    setLabel(p.label);
    session.setInput({ ...p.birth });
  };
  const applyPartnerProfile = (p: ProfileChip) => {
    setActivePartnerProfile(p.id);
    session.setPartnerLabel(p.label);
    session.patchPartner({ ...p.birth });
  };
  // 프로필을 고른 뒤 입력을 바꾸면 "새 사람" 으로 본다(렌더 중 파생).
  const active = profiles.find((p) => p.id === activeProfile) ?? null;
  const pickedProfileId = active && sameSajuBirth(active.birth, input) ? active.id : null;
  const pair = mode === 'pair';
  const error = pair ? session.pairError : session.state.error;

  return (
    <Glass style={styles.card}>
      <View style={styles.row}>
        {(['self', 'pair'] as const).map((m) => (
          <SegButton key={m} flex label={m === 'self' ? '내 사주' : '우리 궁합'} active={mode === m} onPress={() => session.setMode(m)} />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>{pair ? '두 사람의 사주를 맞춰 볼게요' : '언제 태어나셨나요?'}</Text>
        <Muted size={12} dim={0.6}>
          {pair ? '나와 상대의 생년월일로 두 원국의 어울림을 봐요. 상대 정보는 서버에 남지 않아요.' : '생년월일과 시각으로 사주팔자를 세워요. 시간을 모르면 세 기둥으로 봐요.'}
        </Muted>
      </View>

      {pair ? <Text style={[styles.who, { color: SJ.gold }]}>나</Text> : null}
      <ProfileChips profiles={profiles} activeId={activeProfile} onPick={applyProfile} onRemove={removeLocalProfile} />
      <BirthFields input={input} onChange={session.setInput} />

      {pair ? (
        <>
          <View style={styles.partnerHead}>
            <Text style={[styles.who, { color: SJ.salmon }]}>상대</Text>
            <TextInput accessibilityLabel="상대 호칭" value={partnerLabel} maxLength={20} onChangeText={session.setPartnerLabel} placeholder="호칭" placeholderTextColor={ink(0.3)} style={[styles.input, { width: 120, height: 34 }]} />
          </View>
          <ProfileChips profiles={profiles} activeId={activePartnerProfile} onPick={applyPartnerProfile} onRemove={removeLocalProfile} />
          <BirthFields input={partner} onChange={session.patchPartner} prefix="상대 " />
          <PrimaryButton label="궁합 보기" icon="heart" onPress={session.submitPair} style={{ marginTop: 4 }} />
        </>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced((a) => !a)} hitSlop={6} style={styles.advancedToggle}>
            <Icon name={advanced ? 'chevron-up' : 'chevron-down'} size={14} color={ink(0.5)} />
            <Text style={{ fontSize: 12, color: ink(0.55) }}>고급 설정</Text>
          </Pressable>
          {advanced ? (
            <View style={styles.advanced}>
              <CheckRow label="진태양시 보정 — 서울 기준 30분(서머타임 땐 90분)을 되돌려요. 국내 만세력 기본값" checked={input.options.solarTimeCorrection} onChange={(v) => session.setInput({ options: { ...input.options, solarTimeCorrection: v } })} />
              <CheckRow label="야자시 — 밤 11시 이후를 당일 일주로 봐요(기본은 다음날)" checked={input.options.lateRatHour} onChange={(v) => session.setInput({ options: { ...input.options, lateRatHour: v } })} />
            </View>
          ) : null}

          {!pickedProfileId ? (
            <View style={styles.saveRow}>
              <CheckRow label={isMember ? '이 계정에 저장' : '이 기기에 저장'} checked={save} onChange={setSave} />
              {save ? <TextInput accessibilityLabel="이름" value={label} maxLength={20} onChangeText={setLabel} placeholderTextColor={ink(0.3)} style={[styles.input, { width: 110, height: 34 }]} /> : null}
            </View>
          ) : null}

          <PrimaryButton label="사주 세우기" icon="star-four-points" onPress={() => onSubmit({ enabled: !pickedProfileId && save, label: label.trim() || '나', profileId: pickedProfileId })} style={{ marginTop: 4 }} />
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Muted size={11} dim={0.45} style={{ textAlign: 'center' }}>
        {SAJU_DISCLAIMER}
      </Muted>
      {isMember && !pair ? (
        <View style={styles.memberRow}>
          <Muted dim={0.55}>풀이는 자동 저장돼요 ·</Muted>
          <TextButton label="내 사주 기록" color={SJ.gold} onPress={() => router.push('/saju-c/me' as never)} />
        </View>
      ) : null}
    </Glass>
  );
};

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, gap: 4 },
  title: { fontFamily: SERIF, fontSize: 18, fontWeight: '700', color: SJ.cream, lineHeight: 25 },
  who: { fontSize: 12, fontWeight: '700' },
  fieldLabel: { fontSize: 12, color: ink(0.7) },
  input: { borderWidth: 1, borderColor: white(0.15), backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 9, paddingHorizontal: 10, height: 40, fontSize: 14, color: SJ.cream },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: white(0.15), borderRadius: 999 },
  chipMain: { paddingLeft: 12, paddingRight: 8, paddingVertical: 5 },
  chipSide: { paddingLeft: 6, paddingRight: 9, paddingVertical: 5, borderLeftWidth: 1, borderLeftColor: white(0.12) },
  partnerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: white(0.1), paddingTop: 12, marginTop: 4 },
  advancedToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  advanced: { gap: 8, borderWidth: 1, borderColor: white(0.1), borderRadius: 9, padding: 10 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  error: { textAlign: 'center', fontSize: 12, color: SJ.salmon },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
});
