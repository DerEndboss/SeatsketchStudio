import type { MsgKey } from '../i18n';
import type { ThemeId } from '../editor/canvas/palette';

export interface ThemeInfo {
  id: ThemeId;
  label: MsgKey;
  dark: boolean;
  /** Preview colours: background, surface, accent, chair */
  swatch: [string, string, string, string];
}

export const THEMES: readonly ThemeInfo[] = [
  { id: 'beige', label: 'theme.beige', dark: false, swatch: ['#f5f2ed', '#fffefb', '#3e6bc8', '#a88b74'] },
  { id: 'sage', label: 'theme.sage', dark: false, swatch: ['#eef1ec', '#fcfdfb', '#3f7a58', '#7f9480'] },
  { id: 'espresso', label: 'theme.espresso', dark: true, swatch: ['#171512', '#24201d', '#87a7e3', '#9a7f6a'] },
  { id: 'midnight', label: 'theme.midnight', dark: true, swatch: ['#0f131a', '#1a2130', '#8ab4ff', '#6f7f9e'] },
];

export const themeInfo = (id: ThemeId): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0];
export type { ThemeId };
