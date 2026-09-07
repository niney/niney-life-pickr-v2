// 사주 무대 효과음 — 파일 없이 WebAudio 로 합성(인장 찍힘 '쿵', 다이얼 정지 '띵'). 기본 꺼짐, 켜면 기기에 기억.
// AudioContext 는 사용자 제스처(토글·제출 클릭) 안에서만 만든다 — 자동재생 정책.

const KEY = 'saju-sound-v1';
let ctx: AudioContext | null = null;

const ensure = (): AudioContext | null => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
};

export const sajuSoundEnabled = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** 켜면 바로 짧은 종소리로 확인(제스처 안에서 컨텍스트 생성). */
export const setSajuSoundEnabled = (on: boolean): void => {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // 저장 못 해도 이번 세션엔 동작
  }
  if (on) playSajuChime(0.35);
};

/** 제출 클릭 같은 제스처에서 미리 컨텍스트를 깨워 둔다(연출 중 첫 소리가 잘리지 않게). */
export const primeSajuSound = (): void => {
  if (sajuSoundEnabled()) ensure();
};

/** 인장 찍힘 — 저음 '쿵'(140→45Hz) + 짧은 노이즈. */
export const playSajuStamp = (): void => {
  if (!sajuSoundEnabled()) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.27);
  const len = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const n = c.createBufferSource();
  n.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.22, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  n.connect(f).connect(ng).connect(c.destination);
  n.start(t);
  n.stop(t + 0.07);
};

/** 다이얼 정지·켜기 확인 — 두 음(880·1320Hz) 종소리. */
export const playSajuChime = (vol = 0.4): void => {
  if (!sajuSoundEnabled()) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  for (const [freq, delay, dur] of [[880, 0, 0.9], [1320, 0.06, 0.7]] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g).connect(c.destination);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.02);
  }
};
