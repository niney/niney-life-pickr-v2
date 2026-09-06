import { sajuImagePath, sajuStemImageId, type SajuChart, type SajuPhase } from '@repo/utils';
import { SajuChartTable } from './SajuChartTable';

// Lite 무대 — WebGL 없음·reduced-motion·jsdom. 3D 대신 원국 표와 일간 이미지를 정적으로 보인다.
// 연출 단계(casting·stamping)는 페이지가 즉시 건너뛴다(애니메이션 두 벌을 만들지 않는다).

export const SajuLite = ({ chart, phase }: { chart: SajuChart | null; phase: SajuPhase }) => (
  <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#1c1a22,#0b0b0f_65%)]">
    {chart && phase === 'reading' && (
      <div className="absolute inset-x-0 top-16 mx-auto flex w-[min(28rem,calc(100%-1.5rem))] flex-col items-center gap-3 lg:left-8 lg:mx-0" data-testid="saju-lite">
        <img src={sajuImagePath(sajuStemImageId(chart.dayMaster.index), 512)} alt={`${chart.dayMaster.ko} 일간`} className="size-28 rounded-full border-2 border-[#d9b65b]/70 object-cover shadow-xl" />
        <div className="w-full rounded-2xl border border-[#d9b65b]/15 bg-[#121218]/85 p-3">
          <SajuChartTable chart={chart} compact />
        </div>
      </div>
    )}
  </div>
);
