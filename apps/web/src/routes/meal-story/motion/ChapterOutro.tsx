import type { MealStorySceneType } from '@repo/api-contract';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { pop, prog, rand, useClock } from './anim';
import { KineticTitle } from './KineticTitle';
import { cardHeight, titleHeight, wrapText } from './layout';
import { Card, Paper, Sheet, Tape } from './paper/kit';
import { Mushroom, PaperShaker, PaperSpoon, RiceBowl } from './paper/props';
import { boil, tornRect } from './paper/torn';
import { PaperStage } from './Stage';
import { HAND } from './theme';
import { OUTRO } from './timeline';
import type { ChapterContext } from './types';

type OutroScene = Extract<MealStorySceneType, { type: 'outro' }>;

const TITLE = { top: 300, size: 112, width: 860 };
const CONFETTI = ['#f6cf55', '#f3a3bf', '#ffffff', '#a9d9c6', '#ffb36b'];

/**
 * 마무리 — 화면 가득 색종이 부엌으로 돌아와 제목 카드가 붙고, 식탁 끝에서 그 주제의 짝(나트륨 = 소금통·숟가락, 식이섬유 =
 * 밥공기·버섯)이 손(몸)을 흔든다. 종이 조각이
 * 천천히 흩날린다. 아래쪽 식탁 자리는 웹이 진짜 단추(기록·레시피·공유)를 얹는 곳이라 비워 둔다.
 */
export const ChapterOutro = ({ scene, ctx }: { scene: OutroScene; ctx: ChapterContext }) => {
  const f = useClock();
  const { fps } = useVideoConfig();
  const { pal } = ctx;
  const v = boil(f);
  const card = pop(f, OUTRO.fill[0] + 4, fps, { damping: 13, stiffness: 120 });
  const text = prog(f, OUTRO.text[0], OUTRO.text[1]);
  const pals = pop(f, OUTRO.ring, fps, { damping: 11, stiffness: 120 });
  const titleH = titleHeight(scene.title, TITLE.size, TITLE.width);
  const cardH = Math.round(titleH + 90);
  const textLines = scene.text ? wrapText(scene.text, 40, 820) : [];
  const textY = TITLE.top + cardH + 10;
  const wave = Math.sin(f / 6) * 10;
  // 글 쪽지 아래 끝 — 쪽지가 길면 소금통·숟가락을 그만큼 내린다(얼굴이 쪽지에 가리지 않게).
  const textBottom = textLines.length ? textY + cardHeight(textLines.length, 40) : textY - 40;
  const palsY = Math.max(1060, textBottom + 190);
  const grainPals = ctx.story.topic?.nutrient === 'fiber';
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PaperStage ctx={ctx} table={1180} area={{ x: -30, y: -30, w: 1140, h: 1980 }} />
      <Sheet>
        {Array.from({ length: 30 }, (_, k) => {
          const speed = 0.4 + rand(k * 1.3) * 0.6;
          const y = ((f * speed * 5 + rand(k) * 2000) % 2000) - 60;
          const x = rand(k * 2.7) * 1080 + Math.sin(f / 25 + k) * 24;
          const s = 10 + rand(k * 4.1) * 12;
          return <rect key={k} x={x} y={y} width={s} height={s * 0.7} rx={2} fill={CONFETTI[k % CONFETTI.length]} transform={`rotate(${f * (2 + (k % 5)) + k * 40} ${x} ${y})`} opacity={0.9} />;
        })}
      </Sheet>
      <AbsoluteFill style={{ transform: `translateY(${(1 - card) * -500}px) rotate(${(1 - card) * -5}deg)`, opacity: Math.min(1, card * 2) }}>
        <Sheet>
          <g transform={`rotate(-1.5 540 ${TITLE.top + cardH / 2})`}>
            <Paper d={tornRect(60, TITLE.top - 40, 960, cardH, { seed: 121 + v * 101, amp: 3.2, step: 8 })} fill={pal.paper} lift={1.5} />
          </g>
          <Tape x={110} y={TITLE.top - 36} angle={-28} pal={pal} />
          <Tape x={970} y={TITLE.top - 42} angle={24} pal={pal} />
        </Sheet>
        <KineticTitle
          text={scene.title}
          start={OUTRO.title}
          size={TITLE.size}
          color={pal.ink}
          font={HAND}
          weight={700}
          tracking="-0.07em"
          stagger={4}
          style={{ position: 'absolute', left: 110, top: TITLE.top, width: TITLE.width, transform: 'rotate(-1.5deg)', transformOrigin: '430px 0' }}
        />
      </AbsoluteFill>
      {textLines.length ? (
        <Sheet>
          <g opacity={text} transform={`translate(0 ${(1 - text) * 30})`}>
            <Card x={540} y={textY} lines={textLines} size={40} fill={pal.yellow} color={pal.ink} angle={1.2} seed={125 + v * 101} lift={1.1} />
          </g>
        </Sheet>
      ) : null}
      <Sheet>
        <g transform={`translate(300 ${palsY + (1 - pals) * 500}) rotate(${wave}) scale(${grainPals ? 1.25 : 0.82})`}>
          {grainPals ? <RiceBowl pal={pal} f={f} v={v} face="happy" /> : <PaperShaker pal={pal} f={f} v={v} mood="happy" />}
        </g>
        <g transform={`translate(780 ${palsY - 50 + (1 - pals) * 500 + Math.sin(f / 8) * 8}) rotate(${-wave * 0.6}) scale(${grainPals ? 1.2 : 0.5})`}>
          {grainPals ? <Mushroom pal={pal} f={f} v={v} face="happy" /> : <PaperSpoon pal={pal} f={f} v={v} fill={1} mood="happy" seed={131} />}
        </g>
      </Sheet>
    </AbsoluteFill>
  );
};
