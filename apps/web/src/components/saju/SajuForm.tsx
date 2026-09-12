import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Heart, Sparkles, Trash2 } from 'lucide-react';
import type { SajuBirthInputType } from '@repo/api-contract';
import { useSajuProfileStore, useSajuProfiles, sameSajuBirth } from '@repo/shared';
import type { SajuProfileType } from '@repo/api-contract';
import { SAJU_SUPPORTED_YEARS, daysInMonth, lunarMonthLength } from '@repo/utils';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { SAJU_DISCLAIMER } from './sajuTheme';

// 입력 폼 — 상단 모드 토글 "내 사주 / 우리 궁합"(8차). 내 사주: 생년월일(양/음력·윤달)·시각(모름 허용)·성별·고급
// 옵션(진태양시·야자시) + 프로필 칩·저장. 우리 궁합: 나 + 상대 두 사람의 생년월일(상대는 프로필 칩으로도) → 결과 패널.
// 검증 메시지는 리듀서(submit)가 준다. 궁합 모드의 검증은 페이지가 utils 로 직접 한다.

export type SajuFormMode = 'self' | 'pair';

export interface SajuFormProps {
  mode: SajuFormMode;
  onMode: (mode: SajuFormMode) => void;
  input: SajuBirthInputType;
  error: string | null;
  isMember: boolean;
  onChange: (patch: Partial<SajuBirthInputType>) => void;
  /** 저장 요청 — 게스트는 기기 로컬, 회원은 계정(서버). profileId 가 있으면 이미 저장된 프로필을 골라 쓴 것이라 새로 만들지 않는다. */
  onSubmit: (save: { enabled: boolean; label: string; profileId: string | null }) => void;
  /** 궁합 모드 — 상대 입력·호칭. */
  partner: SajuBirthInputType;
  partnerLabel: string;
  onPartnerChange: (patch: Partial<SajuBirthInputType>) => void;
  onPartnerLabel: (label: string) => void;
  onSubmitPair: () => void;
}

export const glass = 'rounded-2xl border border-[#d9b65b]/15 bg-[#121218]/90 text-[#e9e2d2] shadow-2xl backdrop-blur-md';
const field =
  // scheme-dark + option 색: 크롬은 네이티브 <select> 팝업에 select 의 background/color 를 그대로 쓰므로
  // bg-black/30 이 흰 바탕과 섞여 회색 상자 + 크림 글자(저대비)가 됐다. 팝업 색을 명시해 무대 톤에 맞춘다.
  'rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[#f3e9c6] placeholder:text-[#e9e2d2]/30 focus:border-[#d9b65b] focus:outline-none' +
  ' scheme-dark [&>option]:bg-[#16130f] [&>option]:text-[#f3e9c6] [&>option:checked]:bg-[#3a2f14] [&>option:checked]:text-[#f0d27a]';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// 키 순서·옵션 기본값에 흔들리지 않는 생년월일 비교.
// 같은 사주 판정은 shared 스토어와 같은 규칙(중복 저장 방지도 같은 함수).
const sameBirth = sameSajuBirth;

type ProfileChip = { id: string; label: string; birth: SajuBirthInputType; primary: boolean; local: boolean };

/** 생년월일시·성별 입력 묶음 — 나·상대 공용. prefix 는 aria-label 앞에 붙는다('상대 년'). */
const BirthFields = ({ input, onChange, prefix = '' }: { input: SajuBirthInputType; onChange: (patch: Partial<SajuBirthInputType>) => void; prefix?: string }) => {
  const monthDays = input.calendar === 'lunar' ? (lunarMonthLength(input.year, input.month, input.leapMonth) ?? 30) : daysInMonth(input.year, input.month);
  const days = Array.from({ length: monthDays }, (_, i) => i + 1);
  const hasLeap = input.calendar === 'lunar' && lunarMonthLength(input.year, input.month, true) !== null;
  const L = (s: string) => `${prefix}${s}`;
  return (
    <>
      <div className="mt-3 flex gap-1" role="radiogroup" aria-label={L('달력')}>
        {(['solar', 'lunar'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={input.calendar === c}
            onClick={() => onChange({ calendar: c, leapMonth: false })}
            className={cn('flex-1 rounded-lg border py-1.5 text-sm transition', input.calendar === c ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/60 hover:border-white/30')}
          >
            {c === 'solar' ? '양력' : '음력'}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs text-[#e9e2d2]/70">
          년
          <input
            type="number"
            inputMode="numeric"
            aria-label={L('년')}
            min={SAJU_SUPPORTED_YEARS.from}
            max={SAJU_SUPPORTED_YEARS.to}
            value={input.year}
            onChange={(e) => onChange({ year: Number(e.target.value) })}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#e9e2d2]/70">
          월
          <select aria-label={L('월')} value={input.month} onChange={(e) => onChange({ month: Number(e.target.value), leapMonth: false })} className={field}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#e9e2d2]/70">
          일
          <select aria-label={L('일')} value={Math.min(input.day, monthDays)} onChange={(e) => onChange({ day: Number(e.target.value) })} className={field}>
            {days.map((d) => (
              <option key={d} value={d}>{d}일</option>
            ))}
          </select>
        </label>
      </div>
      {input.calendar === 'lunar' && (
        <label className={cn('mt-2 flex items-center gap-2 text-xs', hasLeap ? 'text-[#e9e2d2]/70' : 'text-[#e9e2d2]/35')}>
          <input type="checkbox" checked={input.leapMonth} disabled={!hasLeap} onChange={(e) => onChange({ leapMonth: e.target.checked })} className="accent-[#d9b65b]" />
          윤달{hasLeap ? '' : ' (이 해엔 윤달이 없어요)'}
        </label>
      )}

      <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[#e9e2d2]/70">
          시
          <select
            aria-label={L('시')}
            value={input.hour === null ? '' : input.hour}
            onChange={(e) => onChange({ hour: e.target.value === '' ? null : Number(e.target.value), minute: e.target.value === '' ? null : (input.minute ?? 0) })}
            className={field}
          >
            <option value="">모름</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
            ))}
          </select>
        </label>
        <label className={cn('flex flex-col gap-1 text-xs', input.hour === null ? 'text-[#e9e2d2]/35' : 'text-[#e9e2d2]/70')}>
          분
          <select aria-label={L('분')} disabled={input.hour === null} value={input.minute ?? 0} onChange={(e) => onChange({ minute: Number(e.target.value) })} className={field}>
            {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}분</option>
            ))}
          </select>
        </label>
        <div className="flex gap-1" role="radiogroup" aria-label={L('성별')}>
          {(['M', 'F'] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={input.gender === g}
              onClick={() => onChange({ gender: g })}
              className={cn('rounded-lg border px-3 py-2 text-sm', input.gender === g ? 'border-[#d9b65b] bg-[#d9b65b]/10 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/60 hover:border-white/30')}
            >
              {g === 'M' ? '남' : '여'}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

const ProfileChips = ({ profiles, activeId, onPick, onRemove, ariaLabel }: { profiles: ProfileChip[]; activeId: string | null; onPick: (p: ProfileChip) => void; onRemove: (id: string) => void; ariaLabel: string }) =>
  profiles.length === 0 ? null : (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={ariaLabel}>
      {profiles.map((p) => (
        <span key={p.id} className="inline-flex items-center">
          <button
            type="button"
            onClick={() => onPick(p)}
            className={cn('rounded-l-full border px-3 py-1 text-xs transition', activeId === p.id ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : 'border-white/15 text-[#e9e2d2]/70 hover:border-white/40')}
          >
            {p.label}
            {p.primary && <span className="ml-1 text-[#d9b65b]">★</span>}
          </button>
          {p.local ? (
            <button type="button" aria-label={`${p.label} 삭제`} onClick={() => onRemove(p.id)} className="rounded-r-full border border-l-0 border-white/15 px-1.5 py-1 text-[#e9e2d2]/40 hover:text-[#ffb4a2]">
              <Trash2 className="size-3" />
            </button>
          ) : (
            <span className="rounded-r-full border border-l-0 border-white/15 px-1.5 py-1 text-[10px] text-[#e9e2d2]/40">계정</span>
          )}
        </span>
      ))}
    </div>
  );

export const SajuForm = ({ mode, onMode, input, error, isMember, onChange, onSubmit, partner, partnerLabel, onPartnerChange, onPartnerLabel, onSubmitPair }: SajuFormProps) => {
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
    onChange({ ...p.birth });
  };
  const applyPartnerProfile = (p: ProfileChip) => {
    setActivePartnerProfile(p.id);
    onPartnerLabel(p.label);
    onPartnerChange({ ...p.birth });
  };
  // 프로필을 고른 뒤 입력을 바꾸면 "새 사람" 으로 본다(렌더 중 파생).
  const active = profiles.find((p) => p.id === activeProfile) ?? null;
  const activeStillMatches = !!active && sameBirth(active.birth, input);
  const pickedProfileId = activeStillMatches ? active.id : null;
  const pair = mode === 'pair';

  return (
    <section className={cn(glass, 'pointer-events-auto absolute inset-x-3 bottom-3 top-16 flex max-h-[calc(100%-4.5rem)] flex-col overflow-y-auto p-4 sm:inset-x-auto sm:left-1/2 sm:top-20 sm:w-[27rem] sm:-translate-x-1/2 lg:left-auto lg:right-8 lg:translate-x-0')} aria-label="사주 입력">
      <div className="flex gap-1" role="radiogroup" aria-label="보기 모드">
        {(['self', 'pair'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onMode(m)}
            className={cn('flex-1 rounded-lg border py-1.5 text-sm font-semibold transition', mode === m ? 'border-[#d9b65b] bg-[#d9b65b]/15 text-[#f3e9c6]' : 'border-white/10 text-[#e9e2d2]/60 hover:border-white/30')}
          >
            {m === 'self' ? '내 사주' : '우리 궁합'}
          </button>
        ))}
      </div>
      <h2 className="mt-3 font-serif-kr text-lg font-bold text-[#f3e9c6]">{pair ? '두 사람의 사주를 맞춰 볼게요' : '언제 태어나셨나요?'}</h2>
      <p className="mt-1 text-xs text-[#e9e2d2]/60">{pair ? '나와 상대의 생년월일로 두 원국의 어울림을 봐요. 상대 정보는 서버에 남지 않아요.' : '생년월일과 시각으로 사주팔자를 세워요. 시간을 모르면 세 기둥으로 봐요.'}</p>

      {pair && <div className="mt-3 text-[11px] font-semibold text-[#d9b65b]">나</div>}
      <ProfileChips profiles={profiles} activeId={activeProfile} onPick={applyProfile} onRemove={removeLocalProfile} ariaLabel="저장된 사주" />
      <BirthFields input={input} onChange={onChange} />

      {pair ? (
        <>
          <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
            <span className="text-[11px] font-semibold text-[#ffb4a2]">상대</span>
            <input aria-label="상대 호칭" value={partnerLabel} maxLength={20} onChange={(e) => onPartnerLabel(e.target.value)} className={cn(field, 'w-28 py-1')} placeholder="호칭" />
          </div>
          <ProfileChips profiles={profiles} activeId={activePartnerProfile} onPick={applyPartnerProfile} onRemove={removeLocalProfile} ariaLabel="저장된 사주(상대)" />
          <BirthFields input={partner} onChange={onPartnerChange} prefix="상대 " />
          <Button type="button" onClick={onSubmitPair} className="mt-4 h-11 w-full bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
            <Heart className="size-4" /> 궁합 보기
          </Button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="mt-3 flex items-center gap-1 self-start text-[11px] text-[#e9e2d2]/50 hover:text-[#e9e2d2]">
            <ChevronDown className={cn('size-3 transition', advanced && 'rotate-180')} /> 고급 설정
          </button>
          {advanced && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-white/10 p-3 text-xs text-[#e9e2d2]/70">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={input.options.solarTimeCorrection} onChange={(e) => onChange({ options: { ...input.options, solarTimeCorrection: e.target.checked } })} className="mt-0.5 accent-[#d9b65b]" />
                <span>
                  진태양시 보정 <span className="text-[#e9e2d2]/45">— 서울 기준 30분(서머타임 땐 90분)을 되돌려요. 국내 만세력 기본값</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={input.options.lateRatHour} onChange={(e) => onChange({ options: { ...input.options, lateRatHour: e.target.checked } })} className="mt-0.5 accent-[#d9b65b]" />
                <span>
                  야자시 <span className="text-[#e9e2d2]/45">— 밤 11시 이후를 당일 일주로 봐요(기본은 다음날)</span>
                </span>
              </label>
            </div>
          )}

          {!pickedProfileId && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[#e9e2d2]/70">
              <input id="saju-save" type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[#d9b65b]" />
              <label htmlFor="saju-save">{isMember ? '이 계정에 저장' : '이 기기에 저장'}</label>
              {save && <input aria-label="이름" value={label} maxLength={20} onChange={(e) => setLabel(e.target.value)} className={cn(field, 'w-24 py-1')} />}
            </div>
          )}

          <Button type="button" onClick={() => onSubmit({ enabled: !pickedProfileId && save, label: label.trim() || '나', profileId: pickedProfileId })} className="mt-4 h-11 w-full bg-[#b8322a] text-[#f7eddc] hover:bg-[#cc3d33]">
            <Sparkles className="size-4" /> 사주 세우기
          </Button>
        </>
      )}
      {error && <p className="mt-1 text-center text-[11px] text-[#ffb4a2]">{error}</p>}
      <p className="mt-3 text-center text-[11px] text-[#e9e2d2]/45">{SAJU_DISCLAIMER}</p>
      {isMember && !pair && (
        <p className="mt-2 text-center text-[11px] text-[#e9e2d2]/55">
          풀이는 자동 저장돼요 ·{' '}
          <Link to="/me/saju-c" className="text-[#d9b65b] underline-offset-2 hover:underline">
            내 사주 기록
          </Link>
        </p>
      )}
    </section>
  );
};
