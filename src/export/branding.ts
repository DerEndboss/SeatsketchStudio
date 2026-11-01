import { tr } from '../i18n';
import type { SeatDocument } from '../types/document';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(tr('export.renderFailed')));
    img.src = src;
  });
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(tr('export.renderFailed')))), 'image/png'));
}

let logo: Promise<string> | null = null;

export function logoData(): Promise<string> {
  logo ??= fetch(new URL('./logo.png', document.baseURI))
    .then((r) => {
      if (!r.ok) throw new Error(tr('export.renderFailed'));
      return r.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(tr('export.renderFailed')));
          reader.readAsDataURL(blob);
        }),
    );
  return logo;
}

export function imageData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(tr('export.renderFailed')));
    reader.readAsDataURL(blob);
  });
}

export async function withExportHeader(plan: Blob, doc: SeatDocument): Promise<Blob> {
  const url = URL.createObjectURL(plan);
  try {
    const [image, logoUrl] = await Promise.all([loadImage(url), logoData()]);
    const mark = await loadImage(logoUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    const header = Math.max(100, Math.round(canvas.width * 0.075));
    canvas.height = image.naturalHeight + header;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr('export.renderFailed'));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const pad = Math.max(24, Math.round(canvas.width * 0.025));
    const size = Math.round(header * 0.62);
    const top = Math.round(header * 0.19);
    ctx.drawImage(mark, pad, top, size, size);
    ctx.fillStyle = '#292520';
    ctx.font = `600 ${Math.round(header * 0.23)}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(doc.meta.name, pad + size + Math.round(header * 0.15), Math.round(header * 0.42));
    ctx.fillStyle = '#81776B';
    ctx.font = `400 ${Math.round(header * 0.125)}px Inter, sans-serif`;
    const tables = doc.objects.filter((o) => o.type === 'table').length;
    const seats = doc.objects.filter((o) => o.type === 'chair').length;
    const guests = doc.objects.filter((o) => o.type === 'chair' && o.guestId).length;
    ctx.fillText(
      tr('pdf.summary', { tables: tr('count.tables', { n: tables }), seats: tr('count.seats', { n: seats }), guests }),
      pad + size + Math.round(header * 0.15),
      Math.round(header * 0.69),
    );
    ctx.textAlign = 'right';
    ctx.font = `500 ${Math.round(header * 0.12)}px Inter, sans-serif`;
    ctx.fillText(tr('app.name'), canvas.width - pad, Math.round(header * 0.51));
    ctx.strokeStyle = '#E8E1D7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, header - 0.5);
    ctx.lineTo(canvas.width - pad, header - 0.5);
    ctx.stroke();
    ctx.drawImage(image, 0, header);
    return canvasPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}
