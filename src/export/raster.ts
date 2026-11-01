import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import type { SeatDocument } from '../types/document';
import { tr } from '../i18n';
import { buildPlanSvg, type PlanSvgOptions } from './svg';

let fontCss: Promise<string> | null = null;

/** Inter as a data: URL. An SVG drawn as an image cannot use page fonts. */
function embeddedFontCss(): Promise<string> {
  fontCss ??= fetch(interLatin)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`;
    })
    .catch(() => '');
  return fontCss;
}

/** Largest edge length browsers reliably draw as a canvas. */
const MAX_SIDE = 12000;

export interface PngOptions extends Omit<PlanSvgOptions, 'pxPerMeter' | 'background'> {
  pxPerMeter: number;
  transparent: boolean;
}

export function pngSize(doc: SeatDocument, opts: PngOptions): { width: number; height: number; scale: number } {
  const { width, height } = buildPlanSvg(doc, { ...opts, background: null });
  let scale = opts.pxPerMeter;
  const longest = Math.max(width, height) * scale;
  if (longest > MAX_SIDE) scale = MAX_SIDE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
}

/** Renders the vector SVG to a PNG (without the editor interface). */
export async function renderPng(doc: SeatDocument, opts: PngOptions): Promise<Blob> {
  const size = pngSize(doc, opts);
  const css = await embeddedFontCss();
  const { svg } = buildPlanSvg(doc, { ...opts, pxPerMeter: size.scale, background: opts.transparent ? null : '#FFFFFF', css });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(tr('export.renderFailed')));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr('export.renderFailed'));
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('export.renderFailed')))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
