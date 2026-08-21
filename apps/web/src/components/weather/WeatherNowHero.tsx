import type { ReactNode } from 'react';
import { Droplets, Navigation, RadioTower, Thermometer, Umbrella, Wind, Zap } from 'lucide-react';
import type { WeatherAwsResultType, WeatherNowcastResultType, WeatherUltraHourType } from '@repo/api-contract';
import {
  KMA_CONDITION_LABEL,
  formatDistanceM,
  formatKmaTemp,
  kmaCondition,
  kmaPtyLabel,
  kmaWindDirection16,
  kmaWindStrength,
} from '@repo/utils';
import { cn } from '~/lib/utils';
import { formatBaseLabel } from './weatherFormat';
import { WeatherConditionIcon } from './weatherIcons';

// 지금 — 초단기실황(정시 관측 8항목) 히어로 + 초단기예보 6시간 띠. 기온이 히어로 숫자
// (≥48px, 본문과 같은 sans), 상태 아이콘은 초단기예보 첫 시각의 하늘상태 + 실황 강수형태로
// 고른다(실황에는 하늘상태가 없다). 풍향은 도(deg)를 16방위 글자 + 화살표로.

interface Props {
  data: WeatherNowcastResultType;
  placeLabel: string;
  // AWS 매분 관측(가장 가까운 관측소) — 있으면 실황 아래에 "근처 관측소" 줄로 보강(없거나
  // enabled=false 면 조용히 생략).
  aws?: WeatherAwsResultType | null;
  dim?: boolean;
}

const hourOf = (h: WeatherUltraHourType): number => Number(h.fcstTime.slice(0, 2));

export const WeatherNowHero = ({ data, placeLabel, aws, dim }: Props) => {
  const now = data.now;
  const first = data.hours[0] ?? null;
  const ncstHour = data.ncstBase ? Number(data.ncstBase.time.slice(0, 2)) : null;
  const condition = kmaCondition(first?.sky ?? null, now?.pty ?? first?.pty ?? null);
  const windDir = kmaWindDirection16(now?.wsd !== null && now?.wsd === 0 ? null : now?.vec);

  return (
    <div className={cn('grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]', dim && 'opacity-60')}>
      {/* 히어로 — 실황 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{placeLabel}</h3>
          <span className="text-xs text-muted-foreground">
            격자 ({data.grid.nx},{data.grid.ny})
            {data.ncstBase ? ` · ${formatBaseLabel(data.ncstBase)} 관측` : ''}
          </span>
        </div>
        {now ? (
          <>
            <div className="flex items-center gap-4">
              <WeatherConditionIcon condition={condition} hour={ncstHour} className="size-14" />
              <div className="flex items-end gap-2">
                <div className="text-[56px] font-semibold leading-none tracking-tight tabular-nums">
                  {formatKmaTemp(now.t1h)}
                  <span className="ml-0.5 text-2xl font-medium text-muted-foreground">℃</span>
                </div>
              </div>
            </div>
            <div className="text-sm">
              <span className="font-medium">{KMA_CONDITION_LABEL[condition]}</span>
              {now.pty !== null && now.pty > 0 && (
                <span className="ml-2 text-muted-foreground">강수형태 {kmaPtyLabel(now.pty)}</span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-2">
              <Tile icon={Umbrella} label="1시간 강수량" value={now.rn1 === null ? '-' : now.rn1 === 0 ? '없음' : `${now.rn1} mm`} />
              <Tile icon={Droplets} label="습도" value={now.reh === null ? '-' : `${now.reh}%`} />
              <Tile
                icon={Wind}
                label="바람"
                value={
                  now.wsd === null ? (
                    '-'
                  ) : (
                    <span className="flex flex-col">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {now.vec !== null && now.wsd > 0 && (
                          <Navigation
                            aria-hidden
                            className="size-3.5 shrink-0 text-muted-foreground"
                            // lucide Navigation 은 북동(45°)을 가리키므로 풍향(바람이 불어오는 방향)에
                            // 180° 를 더해 "불어가는 방향" 화살표로, 기본 45° 를 뺀다.
                            style={{ transform: `rotate(${(now.vec + 180 - 45) % 360}deg)` }}
                          />
                        )}
                        {windDir !== '-' ? `${windDir}풍 ` : ''}
                        {now.wsd} m/s
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">{kmaWindStrength(now.wsd)}</span>
                    </span>
                  )
                }
              />
              <Tile
                icon={Thermometer}
                label="바람 성분"
                value={now.uuu === null && now.vvv === null ? '-' : `동서 ${now.uuu ?? '-'} · 남북 ${now.vvv ?? '-'} m/s`}
              />
            </dl>
            {aws?.enabled && aws.items.length > 0 && <AwsLine aws={aws} now={now} />}
          </>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            이 시각의 실황이 아직 없습니다. 매시 10분 이후 갱신됩니다.
          </div>
        )}
      </div>

      {/* 초단기예보 6시간 */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-medium">앞으로 6시간</h4>
          <span className="text-xs text-muted-foreground">
            초단기예보 {data.ultraBase ? `${formatBaseLabel(data.ultraBase)} 발표` : ''}
          </span>
        </div>
        {data.hours.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            초단기예보가 아직 없습니다. 매시 45분 이후 갱신됩니다.
          </div>
        ) : (
          <div
            role="table"
            aria-label="초단기예보 6시간"
            className="grid gap-x-1 rounded-md border p-2"
            style={{ gridTemplateColumns: `repeat(${data.hours.length}, minmax(0, 1fr))` }}
          >
            {data.hours.map((h) => {
              const cond = kmaCondition(h.sky, h.pty);
              const wet = h.pty !== null && h.pty > 0;
              const title = `${hourOf(h)}시 · ${KMA_CONDITION_LABEL[cond]} · ${formatKmaTemp(h.t1h)}℃ · 강수확률 ${h.pop ?? '-'}% · 강수량 ${h.rn1.text} · 습도 ${h.reh ?? '-'}% · ${kmaWindDirection16(h.vec)}풍 ${h.wsd ?? '-'}m/s${h.lgt ? ` · 낙뢰 ${h.lgt}kA` : ''}`;
              return (
                <div key={h.at} role="cell" title={title} className="flex flex-col items-center gap-1 py-1 text-center">
                  <span className="text-xs tabular-nums text-muted-foreground">{hourOf(h)}시</span>
                  <WeatherConditionIcon condition={cond} hour={hourOf(h)} className="size-6" />
                  <span className="text-sm font-semibold tabular-nums">{formatKmaTemp(h.t1h)}°</span>
                  <span className={cn('text-[11px] tabular-nums', wet || (h.pop ?? 0) >= 30 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')}>
                    {h.pop ?? '-'}%
                  </span>
                  <span className="text-[10px] leading-3 text-muted-foreground">{h.rn1.none ? '' : h.rn1.text}</span>
                  {h.lgt !== null && h.lgt > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                      <Zap className="size-3" aria-hidden /> 낙뢰
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          칸에 마우스를 올리면 습도·바람·강수량이 보입니다. 강수확률은 초단기예보에도 실립니다(2.0 기준).
        </p>
      </div>
    </div>
  );
};

const Tile = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Droplets;
  label: string;
  value: ReactNode;
}) => (
  <div className="rounded-md border px-2.5 py-2">
    <dt className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden /> {label}
    </dt>
    <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
  </div>
);

// 근처 AWS 관측소 줄 — 격자 실황(5km·정시)을 가장 가까운 관측소의 1분 값으로 보강한다. 실황을
// 덮어쓰지 않고 나란히 적고, 두 신호가 어긋날 때만 배지: ① 관측소가 최근 15분 강수를 잡았는데
// 실황 강수형태가 '없음' → "실황 반영 전 강수 감지"(즉시성) ② 기온 차 ≥2℃ → 차이 표기.
const fmtHm = (iso: string | null): string => {
  const m = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : '-';
};

const AwsLine = ({ aws, now }: { aws: WeatherAwsResultType; now: WeatherNowcastResultType['now'] }) => {
  // 값이 있는 가장 가까운 관측소(전 항목 결측인 곳은 건너뛴다).
  const item = aws.items.find((i) => i.ta !== null || i.rn15m !== null || i.hm !== null) ?? aws.items[0];
  if (!item) return null;
  const hasValues = item.ta !== null || item.rn15m !== null || item.hm !== null;
  const rainDetected = (item.rn15m ?? 0) > 0 || item.re === 1;
  const nowDry = now !== null && (now.pty === null || now.pty === 0);
  const tempDiff = now?.t1h !== null && now?.t1h !== undefined && item.ta !== null ? Number((item.ta - now.t1h).toFixed(1)) : null;
  return (
    <div className="rounded-md border border-dashed px-2.5 py-2 text-xs" data-testid="weather-aws-line">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 font-medium">
          <RadioTower className="size-3.5 text-muted-foreground" aria-hidden /> 근처 관측소(AWS) {item.name}
        </span>
        <span className="text-muted-foreground">
          {formatDistanceM(item.dist)} · {fmtHm(item.observedAt)} 관측{aws.stale ? ' · 저장본' : ''}
        </span>
      </div>
      {hasValues ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          <span>
            기온 <b>{formatKmaTemp(item.ta)}℃</b>
          </span>
          <span>
            습도 <b>{item.hm ?? '-'}%</b>
          </span>
          <span>
            바람 <b>{kmaWindDirection16(item.wd10)} {item.ws10 ?? '-'} m/s</b>
          </span>
          <span>
            최근 15분 강수 <b>{item.rn15m ?? '-'} mm</b>
          </span>
          <span>
            오늘 강수 <b>{item.rnDay ?? '-'} mm</b>
          </span>
        </div>
      ) : (
        <div className="mt-1 text-muted-foreground">최근 관측값이 없습니다(결측·통신 지연).</div>
      )}
      {rainDetected && nowDry && (
        <div className="mt-1 inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-700 dark:text-blue-300">
          <Umbrella className="size-3" aria-hidden /> 관측소가 최근 15분 강수를 감지했습니다 — 정시 실황에는 아직 반영 전일 수 있어요.
        </div>
      )}
      {tempDiff !== null && Math.abs(tempDiff) >= 2 && (
        <div className="mt-1 text-muted-foreground">
          격자 실황({formatKmaTemp(now?.t1h)}℃)과 {Math.abs(tempDiff)}℃ 차이 — 관측소 고도({item.ht ?? '-'}m)·위치에 따른 국지 차이입니다.
        </div>
      )}
    </div>
  );
};
