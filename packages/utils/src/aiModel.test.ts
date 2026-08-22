import { describe, expect, it } from 'vitest';
import {
  groupModelsByFamily,
  isVisionModel,
  parseModelFamily,
  recommendModelForPurpose,
} from './aiModel.js';

describe('parseModelFamily', () => {
  it('첫 콜론/숫자 앞을 brand 로 보고 버전 접두·구분자를 뗀다', () => {
    expect(parseModelFamily('gpt-oss:120b')).toBe('gpt-oss');
    expect(parseModelFamily('qwen3-vl:235b-instruct')).toBe('qwen');
    expect(parseModelFamily('deepseek-v4-pro')).toBe('deepseek');
    expect(parseModelFamily('Gemma4:31b')).toBe('gemma');
  });

  it('분류 실패(빈 계열)면 원본 id 로 폴백', () => {
    expect(parseModelFamily('')).toBe('');
    expect(parseModelFamily('3b')).toBe('3b');
  });
});

describe('groupModelsByFamily', () => {
  it('계열명 오름차순, 그룹 내 id 내림차순, 중복 제거', () => {
    const groups = groupModelsByFamily(['gpt-oss:20b', 'deepseek-v4-pro', 'gpt-oss:120b', 'gpt-oss:20b']);
    expect(groups).toEqual([
      { family: 'deepseek', models: ['deepseek-v4-pro'] },
      { family: 'gpt-oss', models: ['gpt-oss:20b', 'gpt-oss:120b'] },
    ]);
  });

  it('빈 입력이면 빈 배열', () => {
    expect(groupModelsByFamily([])).toEqual([]);
    expect(groupModelsByFamily(['', '  '])).toEqual([]);
  });
});

describe('isVisionModel', () => {
  it('이름에 vision/llava/vl/minicpm-v 가 들어가면 vision', () => {
    for (const id of [
      'llama3.2-vision',
      'llama3.2-vision:11b',
      'llava:13b',
      'qwen3-vl:235b',
      'qwen3-vl:235b-instruct',
      'qwen2.5vl:7b',
      'minicpm-v',
      'Qwen3-VL:8b',
    ]) {
      expect(isVisionModel(id), id).toBe(true);
    }
  });

  it('이름에 vl/vision 이 없는 Ollama Cloud 멀티모달 계열도 vision (2026-08-22 카탈로그)', () => {
    for (const id of [
      'gemma4:31b',
      'gemma4',
      'gemma3:27b',
      'qwen3.5:397b',
      'qwen3.5:397b-cloud',
      'kimi-k2.6',
      'kimi-k2.6:1t',
      'kimi-k3',
      'minimax-m3',
      'mistral-large-3',
      'mistral-large-3:675b',
      'llama4:maverick',
      'llama4:scout',
      'mistral-small3.1',
      'mistral-small3.2:24b',
      'glm-4.5v',
      'glm-4.6v',
      'glm-4.6v:106b',
      // 대소문자·공백 무시
      'GEMMA4:31B',
      '  Qwen3.5:397b  ',
    ]) {
      expect(isVisionModel(id), id).toBe(true);
    }
  });

  it('텍스트 전용 모델은 vision 이 아니다', () => {
    for (const id of [
      'gpt-oss:120b',
      'gpt-oss:20b',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'qwen3:32b',
      'qwen3-coder:480b',
      'kimi-k2:1t',
      'kimi-k2-thinking',
      'minimax-m2.5',
      'glm-4.6',
      'mistral-small:24b',
      'bge-m3',
      '',
    ]) {
      expect(isVisionModel(id), id).toBe(false);
    }
  });

  it('멀티모달 계열은 family(":" 앞)의 접두로만 본다 — 태그 안의 이름은 무시', () => {
    expect(isVisionModel('gpt-oss:gemma4')).toBe(false);
    // 계열명 뒤에 글자가 이어지면 다른 계열 (접두 오탐 방지).
    expect(isVisionModel('gemma4x:1b')).toBe(false);
  });
});

describe('recommendModelForPurpose', () => {
  // 규모: gpt-oss:20b(20) · gpt-oss:120b(120) · deepseek-v4-pro:671b(671) —
  //       gemma4:31b(31, vision) · qwen3-vl:235b(235, vision) · qwen3.5:397b(397, vision)
  const catalog = [
    'qwen3.5:397b',
    'gpt-oss:120b',
    'gemma4:31b',
    'deepseek-v4-pro:671b',
    'qwen3-vl:235b',
    'gpt-oss:20b',
  ];

  it('meal-photo 는 image 와 같다 — vision 계열 중 가장 작은 모델', () => {
    expect(recommendModelForPurpose('meal-photo', catalog)).toBe('gemma4:31b');
    expect(recommendModelForPurpose('image', catalog)).toBe('gemma4:31b');
  });

  it('meal-recommend 는 chat 과 같다 — 텍스트 계열 중간 규모', () => {
    expect(recommendModelForPurpose('meal-recommend', catalog)).toBe('gpt-oss:120b');
    expect(recommendModelForPurpose('chat', catalog)).toBe('gpt-oss:120b');
  });

  it('log-analysis 는 텍스트 계열 중 가장 큰 모델', () => {
    expect(recommendModelForPurpose('log-analysis', catalog)).toBe('deepseek-v4-pro:671b');
  });

  it('vision 모델이 없으면 meal-photo 는 null', () => {
    expect(recommendModelForPurpose('meal-photo', ['gpt-oss:120b', 'deepseek-v4-pro'])).toBeNull();
  });

  it('텍스트 모델이 없으면 meal-recommend 는 전체에서 고른다(폴백)', () => {
    expect(recommendModelForPurpose('meal-recommend', ['qwen3.5:397b', 'gemma4:31b'])).toBe(
      'gemma4:31b',
    );
  });

  it('빈 카탈로그면 null', () => {
    expect(recommendModelForPurpose('meal-photo', [])).toBeNull();
    expect(recommendModelForPurpose('meal-recommend', ['', ' '])).toBeNull();
  });
});
