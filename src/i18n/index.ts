import { create } from 'zustand';
import { de, type MsgKey, type Messages, type Plural } from './de';
import { en } from './en';
import { es } from './es';
import { zh } from './zh';
import { hi } from './hi';

export type Lang = 'de' | 'en' | 'es' | 'zh' | 'hi';

export interface LangInfo {
  id: Lang;
  /** Name in its own language */
  name: string;
  /** Name in English (for search) */
  english: string;
  locale: string;
}

/** German plus the four most widely spoken languages in the world. */
export const LANGS: readonly LangInfo[] = [
  { id: 'de', name: 'Deutsch', english: 'German', locale: 'de-DE' },
  { id: 'en', name: 'English', english: 'English', locale: 'en-GB' },
  { id: 'es', name: 'Español', english: 'Spanish', locale: 'es-ES' },
  { id: 'zh', name: '简体中文', english: 'Chinese (Simplified)', locale: 'zh-CN' },
  { id: 'hi', name: 'हिन्दी', english: 'Hindi', locale: 'hi-IN' },
];

const DICTS: Record<Lang, Messages> = { de, en, es, zh, hi };
const KEY = 'seatsketch:lang';

/** Detect the system language (first match from navigator.languages), otherwise English. */
export function detectLanguage(): Lang {
  try {
    const list = typeof navigator !== 'undefined' ? [...(navigator.languages ?? []), navigator.language] : [];
    for (const l of list) {
      const p = (l ?? '').toLowerCase().split('-')[0];
      if (p === 'de' || p === 'en' || p === 'es' || p === 'zh' || p === 'hi') return p;
    }
    return list.length ? 'en' : 'de';
  } catch {
    return 'de';
  }
}

function storedLanguage(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'de' || v === 'en' || v === 'es' || v === 'zh' || v === 'hi' ? v : null;
  } catch {
    return null;
  }
}

interface I18nState {
  lang: Lang;
  /** true once the user has picked a language themselves */
  chosen: boolean;
  setLang: (lang: Lang) => void;
}

const initial = typeof window === 'undefined' ? null : storedLanguage();

export const useI18n = create<I18nState>()((set) => ({
  lang: initial ?? (typeof window === 'undefined' ? 'de' : detectLanguage()),
  chosen: initial !== null,
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    set({ lang, chosen: true });
  },
}));

export const langInfo = (lang: Lang): LangInfo => LANGS.find((l) => l.id === lang) ?? LANGS[0];
export const currentLocale = (): string => langInfo(useI18n.getState().lang).locale;

export type Vars = Record<string, string | number>;

const pluralRules = new Map<string, Intl.PluralRules>();

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MsgKey, vars?: Vars): string {
  const value = (DICTS[lang] as Messages)[key] ?? (de as Messages)[key];
  if (value === undefined) return key;
  if (typeof value === 'string') return fill(value, vars);
  const p = value as Plural;
  const locale = langInfo(lang).locale;
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  const n = Number(vars?.n ?? 0);
  const form = rules.select(n) === 'one' ? p.one : p.other;
  return fill(form, vars);
}

/** Translate outside of React (commands, export, messages). */
export const tr = (key: MsgKey, vars?: Vars): string => translate(useI18n.getState().lang, key, vars);

/** Translate inside components; re-renders on language change. */
export function useT(): (key: MsgKey, vars?: Vars) => string {
  const lang = useI18n((s) => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

export type { MsgKey };
