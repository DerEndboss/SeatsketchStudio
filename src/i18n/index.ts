import { create } from 'zustand';
import type { MsgKey, Plural } from './de';
import { en } from './en';

/** The product UI is English, independent of OS or legacy preferences. */
export type Lang = 'en';
export const useI18n = create<{ lang: Lang }>()(() => ({ lang: 'en' }));
export const currentLocale = (): string => 'en-GB';
export type Vars = Record<string, string | number>;
const rules = new Intl.PluralRules('en-GB');
function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] !== undefined ? String(vars[key]) : match);
}
export function translate(_lang: Lang, key: MsgKey, vars?: Vars): string {
  const value = en[key];
  if (value === undefined) return key;
  if (typeof value === 'string') return fill(value, vars);
  const plural = value as Plural;
  return fill(rules.select(Number(vars?.n ?? 0)) === 'one' ? plural.one : plural.other, vars);
}
export const tr = (key: MsgKey, vars?: Vars): string => translate('en', key, vars);
export function useT(): typeof tr { return tr; }
export type { MsgKey };
