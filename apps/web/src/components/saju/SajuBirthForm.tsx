import { useState, type FormEvent } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import {
  CreateSajuReadingInput,
  type CreateSajuReadingInputType,
  type SajuBirthType,
} from '@repo/api-contract';

export function SajuBirthForm({
  initial,
  onSubmit,
}: {
  initial?: CreateSajuReadingInputType;
  onSubmit: (input: CreateSajuReadingInputType) => void;
}) {
  const [date, setDate] = useState(initial?.birth.date ?? '');
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>(initial?.birth.calendar ?? 'solar');
  const [leap, setLeap] = useState(initial?.birth.leapMonth ?? false);
  const [accuracy, setAccuracy] = useState<SajuBirthType['timeAccuracy']>(
    initial?.birth.timeAccuracy ?? 'unknown',
  );
  const [time, setTime] = useState(initial?.birth.time ?? '');
  const [range, setRange] = useState(initial?.birth.timeRange ?? 'morning');
  const [boundary, setBoundary] = useState<SajuBirthType['dayBoundary']>(
    initial?.birth.dayBoundary ?? 'midnight',
  );
  const [disambiguation, setDisambiguation] = useState<SajuBirthType['disambiguation']>(
    initial?.birth.disambiguation ?? 'reject',
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = CreateSajuReadingInput.safeParse({
      birth: {
        date,
        calendar,
        leapMonth: calendar === 'lunar' && leap,
        timeAccuracy: accuracy,
        time: accuracy === 'exact' ? time || null : null,
        timeRange: accuracy === 'range' ? range : null,
        dayBoundary: boundary,
        disambiguation,
      },
      kind: 'natal',
      note,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? '입력을 확인해 주세요.');
      return;
    }
    setError('');
    onSubmit(result.data);
  };
  return (
    <form className="saju-birth-form" onSubmit={submit}>
      <div className="saju-form-heading">
        <span className="saju-eyebrow">YOUR BEGINNING</span>
        <h2>당신의 시작을 알려주세요</h2>
        <p>태어난 순간의 네 기둥을 펼쳐 볼게요.</p>
      </div>
      <div className="saju-label-row">
        <label htmlFor="saju-date">생년월일</label>
        <div className="saju-segment" aria-label="달력 종류">
          {(['solar', 'lunar'] as const).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={calendar === v}
              onClick={() => setCalendar(v)}
            >
              {v === 'solar' ? '양력' : '음력'}
            </button>
          ))}
        </div>
      </div>
      <input
        id="saju-date"
        type={calendar === 'solar' ? 'date' : 'text'}
        min={calendar === 'solar' ? '1900-01-01' : undefined}
        max={
          calendar === 'solar'
            ? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
            : undefined
        }
        placeholder="예: 1990-02-30"
        maxLength={10}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        aria-describedby="saju-date-hint"
      />
      <p id="saju-date-hint" className="saju-field-hint">
        대한민국 출생 · 1900년부터 지원해요.
        {calendar === 'lunar' && ' 음력 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.'}
      </p>
      {calendar === 'lunar' && (
        <label className="saju-check">
          <input type="checkbox" checked={leap} onChange={(e) => setLeap(e.target.checked)} />
          음력 윤달에 태어났어요
        </label>
      )}
      <label htmlFor="saju-accuracy" className="saju-field-label">
        태어난 시간
      </label>
      <div className="saju-time-row">
        <select
          id="saju-accuracy"
          value={accuracy}
          onChange={(e) => setAccuracy(e.target.value as SajuBirthType['timeAccuracy'])}
        >
          <option value="unknown">시간을 몰라요</option>
          <option value="exact">정확히 알아요</option>
          <option value="range">대략 알아요</option>
        </select>
        {accuracy === 'exact' && (
          <input
            aria-label="태어난 시각"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        )}
        {accuracy === 'range' && (
          <select
            aria-label="대략의 시간대"
            value={range}
            onChange={(e) => setRange(e.target.value as NonNullable<SajuBirthType['timeRange']>)}
          >
            <option value="night">새벽 00~06시</option>
            <option value="morning">오전 06~12시</option>
            <option value="afternoon">오후 12~18시</option>
            <option value="evening">저녁 18~24시</option>
          </select>
        )}
      </div>
      <p className="saju-field-hint">시간을 몰라도 괜찮아요. 알 수 있는 부분부터 읽어 드려요.</p>
      <details className="saju-form-details">
        <summary>
          관심사와 계산 기준 <ChevronDown size={14} />
        </summary>
        <label htmlFor="saju-note">
          지금 궁금한 이야기 <span>선택</span>
        </label>
        <textarea
          id="saju-note"
          placeholder="예: 새로운 일을 시작할 때 어떤 태도가 도움이 될까요?"
          maxLength={200}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label htmlFor="saju-boundary">하루가 바뀌는 기준</label>
        <select
          id="saju-boundary"
          value={boundary}
          onChange={(e) => setBoundary(e.target.value as SajuBirthType['dayBoundary'])}
        >
          <option value="midnight">자정 00시 (기본)</option>
          <option value="zi">자시 23시</option>
        </select>
        <label htmlFor="saju-disambiguation">과거 시계 변경으로 겹치는 시각</label>
        <select
          id="saju-disambiguation"
          value={disambiguation}
          onChange={(e) => setDisambiguation(e.target.value as SajuBirthType['disambiguation'])}
        >
          <option value="reject">겹치면 다시 확인 (기본)</option>
          <option value="earlier">시계를 되돌리기 전</option>
          <option value="later">시계를 되돌린 후</option>
        </select>
        <p className="saju-field-hint">
          당시 표준시와 서머타임을 반영해요. 지역 태양시 보정은 적용하지 않아요.
        </p>
      </details>
      {error && (
        <p className="saju-error" role="alert">
          {error}
        </p>
      )}
      <button className="saju-primary" type="submit">
        나의 사주 펼치기 <ArrowUpRight size={19} />
      </button>
      <p className="saju-consent">
        로그인 없이 무료로 볼 수 있어요. 해석에 필요한 명식과 관심사는 AI 서비스에 전달돼요. 결과
        보관은 직접 선택할 수 있어요.
      </p>
    </form>
  );
}
