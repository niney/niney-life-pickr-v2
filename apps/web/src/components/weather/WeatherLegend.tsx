import { ExternalLink } from 'lucide-react';
import { KMA_CATEGORIES, KMA_PTY_LABEL, KMA_SKY_LABEL } from '@repo/utils';
import { WeatherConditionIcon } from './weatherIcons';

// 코드표(하늘상태·강수형태) + 예보 항목(category) 표 + 갱신 주기 + 출처/오퍼레이션 목록.
// 출처표시 의무(공공누리 제1유형 — 기상청)를 여기서 이행한다.

const KIND_LABEL = { ncst: '초단기실황', ultra: '초단기예보', vilage: '단기예보' } as const;

export const WeatherLegend = () => (
  <div className="flex flex-col gap-4">
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border">
        <div className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">하늘상태(SKY) · 강수형태(PTY) 코드</div>
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(KMA_SKY_LABEL).map(([code, label]) => (
              <tr key={`sky-${code}`} className="border-b last:border-0 [&>td]:px-2 [&>td]:py-1">
                <td className="w-24 font-mono text-xs text-muted-foreground">SKY {code}</td>
                <td className="inline-flex items-center gap-1.5">
                  <WeatherConditionIcon condition={code === '1' ? 'clear' : code === '3' ? 'partly' : 'cloudy'} className="size-4" /> {label}
                </td>
              </tr>
            ))}
            {Object.entries(KMA_PTY_LABEL).map(([code, label]) => (
              <tr key={`pty-${code}`} className="border-b last:border-0 [&>td]:px-2 [&>td]:py-1">
                <td className="w-24 font-mono text-xs text-muted-foreground">PTY {code}</td>
                <td>
                  {label}
                  <span className="ml-1 text-xs text-muted-foreground">{Number(code) >= 5 ? '(초단기만)' : Number(code) === 4 ? '(단기만)' : ''}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <div className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground">예보 항목(category) · 단위 · 제공 오퍼레이션</div>
        <table className="w-full text-sm">
          <tbody>
            {KMA_CATEGORIES.map((c) => (
              <tr key={c.code} className="border-b last:border-0 [&>td]:px-2 [&>td]:py-1">
                <td className="w-14 font-mono text-xs">{c.code}</td>
                <td>{c.label}</td>
                <td className="text-xs text-muted-foreground">{c.unit}</td>
                <td className="text-xs text-muted-foreground">{c.kinds.map((k) => KIND_LABEL[k]).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <div className="font-medium text-foreground">갱신 주기 · 읽는 법</div>
        <ul className="list-inside list-disc space-y-0.5">
          <li>초단기실황: 매시 정각 관측분이 10분 뒤 제공 · 초단기예보: 매시 30분 생성, 45분 제공(6시간).</li>
          <li>단기예보: 하루 8회(02·05·08·11·14·17·20·23시) 생성, +10분 제공 · 발표 +1시간부터 3일(+3일 24시)까지.</li>
          <li>중기예보: 06·18시 발표 · 발표일 +4일부터 +10일까지(+4~+7일은 오전/오후, 그 뒤는 하루 한 값). +3일까지는 단기예보가 담당.</li>
          <li>강수량(PCP/RN1)·적설(SNO)은 "1mm 미만"·"30.0~50.0mm"·"50.0mm 이상" 같은 범주 문자열로 옵니다. 차트 수치는 하한/절반으로 접은 대표값.</li>
          <li>풍향(VEC)은 바람이 불어오는 방향(도) — 16방위 글자로 바꿔 적었습니다. 풍속 약함 &lt;4 · 약간 강함 4~9 · 강함 9~14 · 매우 강함 ≥14 m/s.</li>
          <li>낙뢰(LGT)는 초단기예보에만, kA 단위(0 = 없음). 파고(WAV)는 내륙 격자에서 0.</li>
          <li>이 페이지는 실황·초단기 10분, 단기 30분, 중기 60분 주기로 다시 묻습니다(탭이 보일 때만).</li>
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <div className="font-medium text-foreground">출처</div>
        <p>
          기상청 · 공공데이터포털{' '}
          <a href="https://www.data.go.kr/data/15084084/openapi.do" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline">
            기상청_단기예보 ((구)_동네예보) 조회서비스 (15084084) <ExternalLink className="size-3" />
          </a>
          {' · '}
          <a href="https://www.data.go.kr/data/15059468/openapi.do" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline">
            기상청_중기예보 조회서비스 (15059468) <ExternalLink className="size-3" />
          </a>
          <br />
          공공누리 제1유형(출처표시). 격자(nx, ny)는 기상청 LCC 5km 격자로 위·경도에서 변환했습니다.
        </p>
        <div className="mt-1 font-medium text-foreground">사용한 오퍼레이션</div>
        <ul className="space-y-0.5 font-mono text-[11px]">
          <li>getUltraSrtNcst <span className="font-sans">— 초단기실황(지금)</span></li>
          <li>getUltraSrtFcst <span className="font-sans">— 초단기예보(앞으로 6시간)</span></li>
          <li>getVilageFcst <span className="font-sans">— 단기예보(3일 시간별·일별)</span></li>
          <li>getFcstVersion <span className="font-sans">— 예보 버전(발표 정보)</span></li>
          <li>getMidLandFcst <span className="font-sans">— 중기육상예보(열흘 날씨·강수확률)</span></li>
          <li>getMidTa <span className="font-sans">— 중기기온(열흘 최저/최고)</span></li>
          <li>getMidFcst <span className="font-sans">— 중기전망(텍스트)</span></li>
          <li>getMidSeaFcst <span className="font-sans">— 중기해상예보(해역 파고)</span></li>
        </ul>
      </div>
    </div>
  </div>
);
