import type { CreateSajuGPairInputType, SajuGPairChartType } from '@repo/api-contract';
import {
  SAJU_G_ELEMENT_META,
  SAJU_GOD_MEANING,
  sajuGElementConnection,
  sajuGTenGod,
} from '@repo/utils';
import { calculateSajuG } from './saju-g.engine.js';

const connectionCopy = {
  same: [
    '닮은 결, 서로 다른 이야기',
    '두 일간은 같은 오행에 속해요. 닮은 상징을 각자 어떻게 표현하는지 이야기해 보세요.',
  ],
  'first-nurtures': [
    '서로의 흐름을 이어 주는 사이',
    '첫 번째 일간의 오행이 두 번째를 생하는 상생 관계예요. 전통에서 생한다는 말은 다음 기운의 바탕이 된다는 뜻이에요.',
  ],
  'second-nurtures': [
    '서로의 가능성을 북돋우는 사이',
    '두 번째 일간의 오행이 첫 번째를 생하는 상생 관계예요. 전통에서 생한다는 말은 다음 기운의 바탕이 된다는 뜻이에요.',
  ],
  'first-regulates': [
    '다른 기준으로 균형을 배우는 사이',
    '첫 번째 일간의 오행이 두 번째를 극하는 상극 관계예요. 전통의 제어 관계를 뜻하며 실제 갈등이나 우열을 판정하지 않아요.',
  ],
  'second-regulates': [
    '차이를 이해하며 간격을 맞추는 사이',
    '두 번째 일간의 오행이 첫 번째를 극하는 상극 관계예요. 전통의 제어 관계를 뜻하며 실제 갈등이나 우열을 판정하지 않아요.',
  ],
  unknown: [
    '아직 열려 있는, 우리의 이야기',
    '출생 시간 범위에서 일간이 달라져 두 일간의 관계는 열어 두었어요. 확인된 기둥의 상징부터 함께 살펴보세요.',
  ],
} as const;

export function calculateSajuGPair(
  input: Pick<CreateSajuGPairInputType, 'first' | 'second'>,
  now = new Date(),
): SajuGPairChartType {
  const first = calculateSajuG({ birth: input.first, kind: 'natal', note: '' }, now);
  const second = calculateSajuG({ birth: input.second, kind: 'natal', note: '' }, now);
  const connection = sajuGElementConnection(
    first.dayMaster?.element ?? null,
    second.dayMaster?.element ?? null,
  );
  const firstToSecond = second.dayMaster
    ? sajuGTenGod(first.dayMaster?.hanja ?? null, second.dayMaster.hanja)
    : null;
  const secondToFirst = first.dayMaster
    ? sajuGTenGod(second.dayMaster?.hanja ?? null, first.dayMaster.hanja)
    : null;
  const [title, description] = connectionCopy[connection];
  const facts = [first, second].flatMap((chart, i) => {
    const side = i === 0 ? 'first' : 'second';
    const person = i === 0 ? '첫 번째 분' : '두 번째 분';
    return [
      {
        id: `${side}-symbol`,
        label: `${person}의 상징`,
        description: chart.dayMaster
          ? `${person}: ${chart.dayMaster.symbol}. ${chart.dayMaster.description}`
          : `${person}의 일간 미확정. 일간·십성을 추정하지 않음.`,
      },
      ...chart.pillars
        .filter((p) => p.ganZhi)
        .map((p) => ({
          id: `${side}-${p.key}`,
          label: `${person} ${p.label}`,
          description: `${p.pronunciation}(${p.ganZhi}). ${p.stemElement ? SAJU_G_ELEMENT_META[p.stemElement].meaning : ''}, ${p.branchElement ? SAJU_G_ELEMENT_META[p.branchElement].meaning : ''}의 상징. 강약이나 실제 성격을 뜻하지 않음.`,
        })),
    ];
  });
  facts.push({ id: 'connection', label: '일간 오행의 관계', description });
  facts.push({
    id: 'perspectives',
    label: '서로 바라보는 전통 상징',
    description:
      firstToSecond && secondToFirst
        ? `첫 번째 분 기준으로 두 번째 분은 ${firstToSecond}(${SAJU_GOD_MEANING[firstToSecond]}), 두 번째 분 기준으로 첫 번째 분은 ${secondToFirst}(${SAJU_GOD_MEANING[secondToFirst]}). 실제 역할이나 상대의 마음을 단정하지 않음.`
        : '일간이 미확정이므로 상호 십성 풀이도 보류함.',
  });
  facts.push({
    id: 'scope',
    label: '풀이 범위',
    description:
      '각자의 확정 기둥·일간 오행 관계·상호 십성만 사용. 지지 합충·용신·대운은 계산하지 않음. 오행 개수의 합계나 부족함으로 궁합을 판단하지 않음.',
  });
  return {
    calculationVersion: 1,
    first,
    second,
    connection,
    title,
    description,
    firstToSecond,
    secondToFirst,
    facts,
    notices: [
      '두 사람의 관계를 돌아보는 전통 상징 풀이예요. 관계의 미래는 대화와 선택으로 만들어 가요.',
      ...[first, second].flatMap((c, i) => c.notices.map((n) => `${i + 1}번째 분 · ${n}`)),
    ],
  };
}
