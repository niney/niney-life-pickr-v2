import {
  darkColors,
  lightColors,
  radius,
  space,
  typography,
  type ColorTokens,
  type RadiusTokens,
  type SpaceTokens,
  type TypographyTokens,
} from './tokens.js';

export interface Theme {
  mode: 'light' | 'dark';
  colors: ColorTokens;
  space: SpaceTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
}

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  space,
  radius,
  typography,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  space,
  radius,
  typography,
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
