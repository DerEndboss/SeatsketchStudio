import type { Unit } from '../types/document';
import { currentLocale } from '../i18n';

const formatters = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const locale = currentLocale();
  const key = `${locale}|${min}|${max}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max, numberingSystem: 'latn' });
    formatters.set(key, f);
  }
  return f;
}

/** Number in the format of the selected language (e.g. a decimal comma in German). */
export const formatNumber = (value: number, minDigits = 0, maxDigits = 2): string =>
  nf(minDigits, maxDigits).format(Object.is(value, -0) ? 0 : value);

/** Length in metres → "1.80 m" or "180 cm". */
export function formatLength(meters: number, unit: Unit, withUnit = true): string {
  if (!Number.isFinite(meters)) return '–';
  if (unit === 'cm') {
    const cm = Math.round(meters * 1000) / 10;
    return `${formatNumber(cm, 0, 1)}${withUnit ? ' cm' : ''}`;
  }
  return `${formatNumber(meters, 2, 2)}${withUnit ? ' m' : ''}`;
}

/** Compact variant for dimension chains on the canvas: "1.8 m", "45 cm". */
export function formatLengthShort(meters: number, unit: Unit): string {
  if (unit === 'cm') return `${formatNumber(Math.round(meters * 100), 0, 0)} cm`;
  return `${formatNumber(meters, 0, 2)} m`;
}

export function formatArea(squareMeters: number): string {
  return `${formatNumber(squareMeters, 0, 1)} m²`;
}

export function formatAngle(deg: number): string {
  return `${formatNumber(deg, 0, 1)}°`;
}

/**
 * Reads a length input: "1,80", "1.8 m", "180cm", "1800 mm", "=1,2+0,6" (simple sums).
 * Without a unit, `defaultUnit` applies. Returns metres, or null for invalid input.
 */
export function parseLength(input: string, defaultUnit: Unit): number | null {
  let s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (s.startsWith('=')) s = s.slice(1);
  if (s === '') return null;
  const unitMatch = s.match(/(mm|cm|m)$/);
  let unit: 'mm' | Unit = defaultUnit;
  if (unitMatch) {
    unit = unitMatch[1] as 'mm' | Unit;
    s = s.slice(0, -unitMatch[1].length);
  }
  // Detect thousands separators such as "1.200,5"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(/,/g, '.');
  if (!/^[-+]?\d*\.?\d+([+-]\d*\.?\d+)*$/.test(s)) return null;
  const terms = s.match(/[-+]?\d*\.?\d+/g);
  if (!terms) return null;
  const value = terms.reduce((sum, t) => sum + Number(t), 0);
  if (!Number.isFinite(value)) return null;
  const factor = unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : 1;
  return value * factor;
}

/** Angle input "45", "45°", "-90,5". */
export function parseAngle(input: string): number | null {
  const s = input.trim().replace('°', '').replace(',', '.');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export const SNAP_STEPS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.05, label: '5 cm' },
  { value: 0.1, label: '10 cm' },
  { value: 0.25, label: '25 cm' },
  { value: 0.5, label: '50 cm' },
  { value: 1, label: '1 m' },
];
