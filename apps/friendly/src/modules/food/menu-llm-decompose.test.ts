import { describe, expect, it } from 'vitest';
import { decideDecomposition, parseDecomposeOutput } from './menu-llm-decompose.service.js';

describe('menu-llm-decompose', () => {
  it('JSON 을 파싱하고, low·null·너무 적거나 많은 구성·기호 섞인 구성은 채택하지 않는다', () => {
    expect(parseDecomposeOutput('```json\n{"components":["삼겹살","목살"],"confidence":"high","reason":"돼지모듬"}\n```')).toEqual({
      components: ['삼겹살', '목살'],
      confidence: 'high',
      reason: '돼지모듬',
    });
    expect(parseDecomposeOutput('{"components":null,"confidence":"bad"}')).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살', '목살'], confidence: 'low', reason: null })).toBeNull();
    expect(decideDecomposition({ components: null, confidence: 'high', reason: null })).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살'], confidence: 'high', reason: null })).toBeNull();
    expect(decideDecomposition({ components: ['삼겹살 200g', '목살', '항정살', '목 살'], confidence: 'medium', reason: null })).toEqual([
      '목살',
      '항정살',
    ]);
  });
});
