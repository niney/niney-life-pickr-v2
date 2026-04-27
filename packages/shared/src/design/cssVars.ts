import type { Theme } from './theme.js';

const flatten = (
  prefix: string,
  obj: Record<string, unknown>,
  unit = '',
): Record<string, string> =>
  Object.entries(obj).reduce<Record<string, string>>((acc, [key, value]) => {
    const cssKey = `--${prefix}-${key}`.replace(/[^a-z0-9-]/gi, '-');
    if (typeof value === 'number') {
      acc[cssKey] = `${value}${unit}`;
    } else if (typeof value === 'string') {
      acc[cssKey] = value;
    }
    return acc;
  }, {});

export const themeToCssVars = (theme: Theme): Record<string, string> => ({
  ...flatten('color', theme.colors),
  ...flatten('space', theme.space, 'px'),
  ...flatten('radius', theme.radius, 'px'),
});

export const applyCssVars = (theme: Theme, target: HTMLElement): void => {
  const vars = themeToCssVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    target.style.setProperty(key, value);
  }
};
