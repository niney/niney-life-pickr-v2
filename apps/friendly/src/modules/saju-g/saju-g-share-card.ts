import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { PublicSajuGShareType } from '@repo/api-contract';
import { SAJU_G_ELEMENT_META } from '@repo/utils';
import { loadPlexFonts } from '../../lib/share-fonts.js';

export async function renderSajuGSharePng(data: PublicSajuGShareType): Promise<Buffer> {
  const fonts = await loadPlexFonts();
  const h = (style: Record<string, unknown>, children: unknown) => ({
    type: 'div',
    props: { style: { display: 'flex', ...style }, children },
  });
  const ink = '#eee8da';
  const gold = '#ceb17a';
  const color = data.element ? SAJU_G_ELEMENT_META[data.element].color : ink;
  // 한자 글리프를 포함하지 않는 공유용 폰트에서도 깨지지 않는 벡터 상징.
  const symbolMark = (element: PublicSajuGShareType['element']) => {
    const stroke = element ? SAJU_G_ELEMENT_META[element].color : ink;
    const markPath = element
      ? {
          wood: 'M100 154V39M100 70C69 74 54 53 52 35c27 0 49 8 48 35ZM100 92c34 3 53-16 53-40-32 0-53 14-53 40ZM100 119c-30 0-48-16-52-36 28-3 49 11 52 36ZM72 155h56',
          fire: 'M100 42a35 35 0 1 0 0 70a35 35 0 1 0 0-70ZM100 23V12m0 119v12M46 77H34m132 0h-12M62 39l-9-9m94 94-9-9m0-76 9-9m-94 94 9-9M57 158h86',
          earth:
            'm18 148 57-99 27 49 24-77 61 127H18ZM47 98l28-49 20 37-21-13-11 22-16 3ZM110 69l16-48 27 62-26-27-17 13ZM67 148l35-50 25 50M48 161h110',
          metal:
            'm100 18 60 54-60 84-60-84 60-54Zm-60 54h120M100 18 75 72l25 84 25-84-25-54ZM59 164h82',
          water:
            'M100 16c-12 29-42 52-42 80a42 42 0 0 0 84 0c0-28-30-51-42-80ZM73 98c0 14 11 25 25 25M28 144c17-13 28 13 45 0s28 13 45 0 28 13 45 0',
        }[element]
      : 'M100 20l70 52-27 83H57L30 72l70-52ZM100 20v135M30 72l113 83M170 72 57 155';
    return {
      type: 'svg',
      props: {
        width: 172,
        height: 172,
        viewBox: '0 0 200 180',
        children: [
          {
            type: 'path',
            props: {
              d: markPath,
              fill: 'none',
              stroke,
              strokeWidth: 1.6,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          },
        ],
      },
    };
  };
  const mark = symbolMark(data.element);
  const pairedContent = data.pair
    ? [
        h({ fontSize: 22, letterSpacing: 7, color: gold }, 'LIFE PICKR · OUR ELEMENTS'),
        h({ marginTop: 70, fontSize: 28, color: gold }, '서로를 알아가는 또 하나의 지도'),
        h(
          { width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: 66 },
          [data, data.pair].flatMap((person, i) => [
            ...(i ? [h({ fontSize: 44, color: gold, margin: '0 30px' }, '×')] : []),
            h({ flexDirection: 'column', alignItems: 'center' }, [
              h(
                {
                  width: 270,
                  height: 270,
                  borderRadius: 135,
                  border: `1px solid ${person.element ? SAJU_G_ELEMENT_META[person.element].color : gold}`,
                  backgroundColor: '#122a32',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                symbolMark(person.element),
              ),
              h(
                {
                  marginTop: 24,
                  fontSize: 29,
                  color: person.element ? SAJU_G_ELEMENT_META[person.element].color : ink,
                },
                person.symbol,
              ),
            ]),
          ]),
        ),
        h(
          { marginTop: 65, fontSize: 47, fontWeight: 700, textAlign: 'center', lineHeight: 1.5 },
          data.title,
        ),
        h(
          { marginTop: 30, fontSize: 27, lineHeight: 1.8, textAlign: 'center', color: '#b8c8ca' },
          data.description,
        ),
        h(
          { width: '100%', marginTop: 60, justifyContent: 'space-between' },
          data.elements.map((e) =>
            h(
              {
                flexDirection: 'column',
                alignItems: 'center',
                color: SAJU_G_ELEMENT_META[e.element].color,
              },
              [
                h({ fontSize: 33 }, SAJU_G_ELEMENT_META[e.element].name),
                h(
                  { marginTop: 15, fontSize: 24 },
                  `${e.count} · ${data.pair!.elements.find((v) => v.element === e.element)?.count ?? 0}`,
                ),
              ],
            ),
          ),
        ),
        h(
          { marginTop: 27, fontSize: 21, color: '#b8c8ca' },
          `첫 번째 ${8 - data.unknownCharacters}글자 · 두 번째 ${8 - data.pair.unknownCharacters}글자 기준`,
        ),
        h({ marginTop: 'auto', fontSize: 23, color: gold }, '우리의 이야기는 함께 만들어 가요'),
        h({ marginTop: 20, fontSize: 19, color: '#b8c8ca' }, '사주(G) · 우리의 궁합 · LIFE PICKR'),
      ]
    : null;
  const svg = await satori(
    h(
      {
        width: 1080,
        height: 1440,
        padding: '100px 90px',
        backgroundColor: '#0b1b26',
        color: ink,
        fontFamily: 'Plex',
        flexDirection: 'column',
        alignItems: 'center',
        border: `2px solid ${gold}`,
      },
      pairedContent ?? [
        h({ fontSize: 22, letterSpacing: 8, color: gold }, 'LIFE PICKR · SAJU(G)'),
        h(
          {
            marginTop: 68,
            width: 250,
            height: 250,
            borderRadius: 125,
            border: `1px solid ${gold}`,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#122a32',
            fontSize: 104,
            color,
          },
          mark,
        ),
        h({ marginTop: 24, fontSize: 32, color, letterSpacing: 6 }, data.symbol),
        h(
          { marginTop: 42, fontSize: 48, fontWeight: 700, textAlign: 'center', lineHeight: 1.5 },
          data.title,
        ),
        h(
          { marginTop: 36, fontSize: 28, lineHeight: 1.9, textAlign: 'center', color: '#b8c8ca' },
          data.description,
        ),
        h(
          { width: '100%', justifyContent: 'space-between', marginTop: 66 },
          data.elements.map((e) =>
            h(
              {
                flexDirection: 'column',
                alignItems: 'center',
                color: SAJU_G_ELEMENT_META[e.element].color,
              },
              [
                h({ fontSize: 42 }, SAJU_G_ELEMENT_META[e.element].name),
                h({ fontSize: 25, marginTop: 20 }, `${e.count}개`),
              ],
            ),
          ),
        ),
        h(
          { fontSize: 22, color: '#b8c8ca', marginTop: 36 },
          `확인된 ${8 - data.unknownCharacters}글자의 오행 구성`,
        ),
        h({ marginTop: 'auto', fontSize: 23, color: gold }, '나를 알아가는 또 하나의 지도'),
        h(
          { marginTop: 24, fontSize: 19, color: '#b8c8ca' },
          '전통의 상징으로 읽는 사주(G) · LIFE PICKR',
        ),
      ],
    ) as unknown as Parameters<typeof satori>[0],
    {
      width: 1080,
      height: 1440,
      fonts: [
        { name: 'Plex', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Plex', data: fonts.bold, weight: 700, style: 'normal' },
      ],
    },
  );
  return new Resvg(svg).render().asPng();
}
