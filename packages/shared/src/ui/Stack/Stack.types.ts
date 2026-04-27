import type { ReactNode } from 'react';
import type { SpaceTokens } from '../../design/tokens.js';

export type SpaceKey = keyof SpaceTokens;

export interface StackProps {
  direction?: 'row' | 'column';
  gap?: SpaceKey;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  padding?: SpaceKey;
  fullWidth?: boolean;
  flex?: number;
  children: ReactNode;
}
