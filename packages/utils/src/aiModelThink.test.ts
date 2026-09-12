import { describe, expect, it } from 'vitest';
import { isKimiModel, LLM_THINKING_SETTINGS, thinkOptionFor, thinkOptionForModel, thinkTokenMult } from './aiModel.js';

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
});
