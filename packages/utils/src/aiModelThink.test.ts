import { describe, expect, it } from 'vitest';
import {
  isKimiModel,
  LLM_THINKING_SETTINGS,
  thinkMaxTokens,
  thinkOptionFor,
  thinkOptionForModel,
  thinkTimeoutMs,
  thinkTokenMult,
} from './aiModel.js';

// 어드민 추론 설정 → Ollama think 매핑. kimi 계열에만 설정을 반영하고, 그 외 모델은 규칙(gpt-oss low, 나머지 off).
describe('thinkOptionFor', () => {
  it('kimi 계열은 설정 그대로(off 는 false), 다른 모델은 규칙', () => {
    expect(isKimiModel('kimi-k3')).toBe(true);
    expect(isKimiModel('kimi-k2.6:cloud')).toBe(true);
    expect(isKimiModel('deepseek-v4-pro')).toBe(false);
    expect(thinkOptionFor('kimi-k3', 'off')).toBe(false);
    expect(thinkOptionFor('kimi-k3', 'low')).toBe('low');
    expect(thinkOptionFor('kimi-k3', 'medium')).toBe('medium');
    expect(thinkOptionFor('kimi-k3', 'high')).toBe('high');
    expect(thinkOptionFor('kimi-k3', 'max')).toBe('max');
    expect(thinkOptionFor('kimi-k3', null)).toBe(false);
    // 규칙 — gpt-oss 는 끌 수 없어 low, deepseek 는 false. 설정이 있어도 kimi 가 아니면 무시.
    expect(thinkOptionFor('gpt-oss:120b', 'max')).toBe('low');
    expect(thinkOptionFor('deepseek-v4-pro', 'high')).toBe(false);
    expect(thinkOptionFor('deepseek-v4-pro', 'off')).toBe(thinkOptionForModel('deepseek-v4-pro'));
  });
  it('토큰 배수는 레벨에 따라 1 → 5, 설정 목록은 계약 순서', () => {
    expect(thinkTokenMult(false)).toBe(1);
    expect(thinkTokenMult('low')).toBe(1.5);
    expect(thinkTokenMult('medium')).toBe(2);
    expect(thinkTokenMult('high')).toBe(3);
    expect(thinkTokenMult('max')).toBe(5);
    expect(thinkTokenMult(true)).toBe(5);
    expect(LLM_THINKING_SETTINGS).toEqual(['off', 'low', 'medium', 'high', 'max']);
  });
  it('출력 예산·대기 시간 — 배수와 본문+단계별 여유 중 큰 쪽(본문이 작은 호출에서 사고가 예산을 다 먹지 않게)', () => {
    // 끄면 그대로.
    expect(thinkMaxTokens(1200, false)).toBe(1200);
    expect(thinkTimeoutMs(60_000, false, 240_000)).toBe(60_000);
    // 식단 추천(본문 1,200): 보통은 배수(2,400)보다 본문+4천(5,200) — kimi-k3.1-pro 실측 사고+본문 1.6~3천.
    expect(thinkMaxTokens(1200, 'low')).toBe(3200);
    expect(thinkMaxTokens(1200, 'medium')).toBe(5200);
    expect(thinkMaxTokens(1200, 'high')).toBe(6200);
    expect(thinkMaxTokens(1200, 'max')).toBe(9200);
    expect(thinkMaxTokens(1200, true)).toBe(9200);
    // 본문이 큰 호출은 배수 쪽이 클 수 있다.
    expect(thinkMaxTokens(5000, 'max')).toBe(25_000);
    // 대기 시간 — 최대는 기본+150초, 상한에서 자른다.
    expect(thinkTimeoutMs(60_000, 'medium', 240_000)).toBe(120_000);
    expect(thinkTimeoutMs(60_000, 'max', 240_000)).toBe(240_000);
    expect(thinkTimeoutMs(25_000, 'max', 120_000)).toBe(120_000);
    expect(thinkTimeoutMs(90_000, 'high', 240_000)).toBe(240_000);
  });
});
