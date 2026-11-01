import type { TableTone } from '../../types/document';

export interface Palette {
  canvas: string;
  floor: string;
  wall: string;
  gridMinor: string;
  gridMajor: string;
  table: Record<TableTone, { fill: string; stroke: string }>;
  tableText: string;
  chairFrame: string;
  chairSeat: string;
  chairText: string;
  chairAssignedFrame: string;
  chairAssignedSeat: string;
  chairAssignedText: string;
  guestText: string;
  dim: string;
  label: string;
  doorLeaf: string;
  window: string;
  accent: string;
  accentFill: string;
  accentFillStrong: string;
  guide: string;
  warn: string;
  warnFill: string;
  handleFill: string;
  marqueeFill: string;
  ghost: string;
  zone: Record<'area' | 'stage' | 'blocked', { fill: string; stroke: string; text: string }>;
}

/** Colours based on the app icon: warm paper, white tables, beige chairs with a brown frame, muted blue. */
export const LIGHT: Palette = {
  canvas: '#FAF8F4',
  floor: '#FFFEFB',
  wall: '#4A453F',
  gridMinor: '#E5DFD5',
  gridMajor: '#D2C9BC',
  table: {
    default: { fill: '#FFFEFB', stroke: '#B6AC9E' },
    sand: { fill: '#F3EADC', stroke: '#B59C7D' },
    sage: { fill: '#E8EEE2', stroke: '#8BA382' },
    sky: { fill: '#E6ECF5', stroke: '#859FC3' },
    rose: { fill: '#F5E8E6', stroke: '#C1918D' },
    slate: { fill: '#ECEAE6', stroke: '#918A82' },
  },
  tableText: '#5E564D',
  chairFrame: '#A88B74',
  chairSeat: '#F2E8DB',
  chairText: '#8A6E59',
  chairAssignedFrame: '#3E6BC8',
  chairAssignedSeat: '#DEE6F4',
  chairAssignedText: '#2F58AE',
  guestText: '#2B2723',
  dim: '#8A8176',
  label: '#4A453F',
  doorLeaf: '#5B554E',
  window: '#7E776E',
  accent: '#3E6BC8',
  accentFill: 'rgba(62, 107, 200, 0.14)',
  accentFillStrong: 'rgba(62, 107, 200, 0.27)',
  guide: '#D2457F',
  warn: '#C4402F',
  warnFill: 'rgba(196, 64, 47, 0.17)',
  handleFill: '#FFFEFB',
  marqueeFill: 'rgba(62, 107, 200, 0.07)',
  ghost: '#3E6BC8',
  zone: {
    area: { fill: 'rgba(176, 150, 118, 0.11)', stroke: '#C7B59E', text: '#998771' },
    stage: { fill: '#E8DDCD', stroke: '#BCA991', text: '#7A6A57' },
    blocked: { fill: 'rgba(196, 64, 47, 0.07)', stroke: '#D08C80', text: '#B4584B' },
  },
};

export const DARK: Palette = {
  canvas: '#1E1B18',
  floor: '#24201D',
  wall: '#A79D91',
  gridMinor: '#2F2B27',
  gridMajor: '#3F3A34',
  table: {
    default: { fill: '#2C2824', stroke: '#71695F' },
    sand: { fill: '#352E26', stroke: '#9B8467' },
    sage: { fill: '#282E25', stroke: '#71886A' },
    sky: { fill: '#252C37', stroke: '#7088AA' },
    rose: { fill: '#352B2B', stroke: '#A97D7B' },
    slate: { fill: '#2C2B29', stroke: '#807A73' },
  },
  tableText: '#B5AC9F',
  chairFrame: '#9A7F6A',
  chairSeat: '#3B332C',
  chairText: '#CDB9A7',
  chairAssignedFrame: '#87A7E3',
  chairAssignedSeat: '#28344B',
  chairAssignedText: '#CCDAF4',
  guestText: '#E9E3DB',
  dim: '#A49B90',
  label: '#DAD3C9',
  doorLeaf: '#DAD3C9',
  window: '#A49B90',
  accent: '#87A7E3',
  accentFill: 'rgba(135, 167, 227, 0.18)',
  accentFillStrong: 'rgba(135, 167, 227, 0.3)',
  guide: '#E673A8',
  warn: '#E57D6D',
  warnFill: 'rgba(229, 125, 109, 0.22)',
  handleFill: '#1E1B18',
  marqueeFill: 'rgba(135, 167, 227, 0.09)',
  ghost: '#87A7E3',
  zone: {
    area: { fill: 'rgba(214, 196, 170, 0.07)', stroke: '#5F564C', text: '#9D9286' },
    stage: { fill: '#3A332C', stroke: '#6E6255', text: '#C3B7A7' },
    blocked: { fill: 'rgba(229, 125, 109, 0.08)', stroke: '#8F554B', text: '#E08F82' },
  },
};

/** Sage: cool green-grey, light tables, chairs in moss green. */
export const SAGE: Palette = {
  ...LIGHT,
  canvas: '#F6F8F4',
  floor: '#FCFDFB',
  wall: '#3F4A42',
  gridMinor: '#DDE4DA',
  gridMajor: '#C5CFC1',
  table: {
    default: { fill: '#FCFDFB', stroke: '#A3AEA1' },
    sand: { fill: '#F1ECDF', stroke: '#B2A585' },
    sage: { fill: '#E3EDE2', stroke: '#86A387' },
    sky: { fill: '#E3ECF1', stroke: '#86A1B4' },
    rose: { fill: '#F3E7E5', stroke: '#BC938E' },
    slate: { fill: '#E8EBE8', stroke: '#8D9690' },
  },
  tableText: '#4E5A51',
  chairFrame: '#7F9480',
  chairSeat: '#E6EEE3',
  chairText: '#5C7060',
  chairAssignedFrame: '#3F7A58',
  chairAssignedSeat: '#D5E8DA',
  chairAssignedText: '#2D5E41',
  guestText: '#1F2620',
  dim: '#77827A',
  label: '#3F4A42',
  doorLeaf: '#4D5850',
  window: '#748078',
  accent: '#3F7A58',
  accentFill: 'rgba(63, 122, 88, 0.15)',
  accentFillStrong: 'rgba(63, 122, 88, 0.28)',
  guide: '#C2457F',
  handleFill: '#FCFDFB',
  marqueeFill: 'rgba(63, 122, 88, 0.08)',
  ghost: '#3F7A58',
  zone: {
    area: { fill: 'rgba(110, 140, 112, 0.10)', stroke: '#A9B8A6', text: '#71836F' },
    stage: { fill: '#DEE6DA', stroke: '#A6B5A2', text: '#56665A' },
    blocked: { fill: 'rgba(192, 69, 58, 0.07)', stroke: '#CC8C82', text: '#B05248' },
  },
};

/** Midnight: deep blue, chairs in grey-blue. */
export const MIDNIGHT: Palette = {
  ...DARK,
  canvas: '#151B26',
  floor: '#1A2130',
  wall: '#8D9AB3',
  gridMinor: '#232B3A',
  gridMajor: '#323C4F',
  table: {
    default: { fill: '#222B3B', stroke: '#5C6880' },
    sand: { fill: '#2E2C2A', stroke: '#8E8068' },
    sage: { fill: '#20302A', stroke: '#5F8270' },
    sky: { fill: '#1F2D44', stroke: '#6584B8' },
    rose: { fill: '#32252D', stroke: '#A07888' },
    slate: { fill: '#262C36', stroke: '#717C90' },
  },
  tableText: '#A9B3C6',
  chairFrame: '#6F7F9E',
  chairSeat: '#283247',
  chairText: '#B9C4D9',
  chairAssignedFrame: '#8AB4FF',
  chairAssignedSeat: '#253A5E',
  chairAssignedText: '#D3E2FF',
  guestText: '#E6EAF2',
  dim: '#8F9AB0',
  label: '#CBD3E2',
  doorLeaf: '#CBD3E2',
  window: '#8F9AB0',
  accent: '#8AB4FF',
  accentFill: 'rgba(138, 180, 255, 0.18)',
  accentFillStrong: 'rgba(138, 180, 255, 0.3)',
  handleFill: '#151B26',
  marqueeFill: 'rgba(138, 180, 255, 0.09)',
  ghost: '#8AB4FF',
  zone: {
    area: { fill: 'rgba(138, 160, 200, 0.07)', stroke: '#4A5670', text: '#8F9AB0' },
    stage: { fill: '#26304A', stroke: '#4F5D7D', text: '#B4C0D8' },
    blocked: { fill: 'rgba(240, 138, 128, 0.08)', stroke: '#8E5651', text: '#F08A80' },
  },
};

export type ThemeId = 'beige' | 'espresso' | 'sage' | 'midnight';

const PALETTES: Record<ThemeId, Palette> = { beige: LIGHT, espresso: DARK, sage: SAGE, midnight: MIDNIGHT };
export const paletteFor = (theme: ThemeId): Palette => PALETTES[theme];

export const TONE_LABELS: Record<TableTone, string> = {
  default: 'White',
  sand: 'Sand',
  sage: 'Sage',
  sky: 'Himmel',
  rose: 'Rosé',
  slate: 'Schiefer',
};

export const FONT_FAMILY = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
