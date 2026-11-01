import type { SeatDocument } from '../types/document';
import { buildPlanSvg, type PlanSvgOptions } from './svg';
import { currentLocale, tr } from '../i18n';
import { imageData, logoData } from './branding';
import { chairsOf } from '../state/lookup';
import type { jsPDF } from 'jspdf';

export type PaperSize = 'a4' | 'a3';
export type Orientation = 'portrait' | 'landscape' | 'auto';
export type PdfScale = 0 | 50 | 100 | 200;

export interface PdfOptions extends Omit<PlanSvgOptions, 'background' | 'pxPerMeter'> {
  paper: PaperSize;
  orientation: Orientation;
  scale: PdfScale;
  title: boolean;
  header?: boolean;
  guestList?: boolean;
  three?: Blob;
}

const PAPER: Record<PaperSize, [number, number]> = { a4: [210, 297], a3: [297, 420] };
const MARGIN = 12;
const HEADER = 22;
const FOOTER = 8;

export interface PdfLayout {
  pageW: number;
  pageH: number;
  orientation: 'portrait' | 'landscape';
  mmPerM: number;
  drawW: number;
  drawH: number;
  fits: boolean;
  ratio: number;
}

export function pdfLayout(doc: SeatDocument, opts: PdfOptions): PdfLayout {
  const { width, height } = buildPlanSvg(doc, { ...opts, background: null });
  const [a, b] = PAPER[opts.paper];
  const orientation = opts.orientation === 'auto' ? (width >= height ? 'landscape' : 'portrait') : opts.orientation;
  const pageW = orientation === 'landscape' ? b : a;
  const pageH = orientation === 'landscape' ? a : b;
  const availW = pageW - MARGIN * 2;
  const availH = pageH - MARGIN * 2 - (opts.header ?? opts.title ? HEADER : 0) - FOOTER;
  const fitMm = Math.min(availW / width, availH / height);
  const mmPerM = opts.scale === 0 ? fitMm : 1000 / opts.scale;
  return {
    pageW,
    pageH,
    orientation,
    mmPerM,
    drawW: width * mmPerM,
    drawH: height * mmPerM,
    fits: width * mmPerM <= availW + 0.01 && height * mmPerM <= availH + 0.01,
    ratio: 1000 / mmPerM,
  };
}

function summary(doc: SeatDocument): string {
  const tables = doc.objects.filter((o) => o.type === 'table').length;
  const seats = doc.objects.filter((o) => o.type === 'chair').length;
  const guests = doc.objects.filter((o) => o.type === 'chair' && o.guestId).length;
  return tr('pdf.summary', { tables: tr('count.tables', { n: tables }), seats: tr('count.seats', { n: seats }), guests });
}

async function pdfHeader(pdf: jsPDF, doc: SeatDocument, width: number): Promise<void> {
  const mark = await logoData();
  pdf.addImage(mark, 'PNG', MARGIN, 9, 12, 12);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(40, 36, 31);
  pdf.text(doc.meta.name, MARGIN + 16, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 109, 96);
  pdf.text(summary(doc), MARGIN + 16, 21);
  pdf.setFontSize(9);
  pdf.text(tr('app.name'), width - MARGIN, 15, { align: 'right' });
  pdf.setDrawColor(228, 220, 209);
  pdf.line(MARGIN, 27, width - MARGIN, 27);
}

function guestRows(doc: SeatDocument): string[][] {
  const tables = new Map(doc.objects.filter((o) => o.type === 'table').map((o) => [o.id, o.name]));
  const singles = doc.objects.filter((o) => o.type === 'chair' && !o.tableId);
  return doc.guests
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, currentLocale()))
    .map((guest) => {
      const chair = doc.objects.find((o) => o.type === 'chair' && o.guestId === guest.id);
      if (!chair || chair.type !== 'chair') return [guest.name, tr('pdf.noSeat'), tr('pdf.noSeat')];
      if (chair.tableId) {
        const seat = chairsOf(doc, chair.tableId).find((c) => c.id === chair.id)?.seat;
        return [guest.name, tables.get(chair.tableId) ?? tr('pdf.noSeat'), seat === undefined ? tr('pdf.noSeat') : String(seat + 1)];
      }
      return [guest.name, tr('csv.single'), String(singles.indexOf(chair) + 1)];
    });
}

function fitText(pdf: jsPDF, text: string, width: number): string {
  if (pdf.getTextWidth(text) <= width) return text;
  let out = text;
  while (out.length > 1 && pdf.getTextWidth(`${out}…`) > width) out = out.slice(0, -1);
  return `${out}…`;
}

function guestPages(pdf: jsPDF, doc: SeatDocument, paper: PaperSize): number {
  const rows = guestRows(doc);
  const [w, h] = PAPER[paper];
  const perPage = Math.floor((h - MARGIN * 2 - 44) / 7);
  const count = Math.max(1, Math.ceil(rows.length / perPage));
  for (let page = 0; page < count; page++) {
    pdf.addPage(paper, 'portrait');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(40, 36, 31);
    pdf.text(tr('pdf.guestList'), MARGIN, MARGIN + 5);
    pdf.setFontSize(9);
    pdf.setTextColor(120, 109, 96);
    pdf.text(doc.meta.name, w - MARGIN, MARGIN + 5, { align: 'right' });
    const y = MARGIN + 15;
    const cols = [MARGIN, w * 0.49, w * 0.78];
    const widths = [w * 0.49 - MARGIN - 4, w * 0.29 - 4, w - MARGIN - w * 0.78];
    pdf.setFillColor(242, 237, 230);
    pdf.rect(MARGIN, y, w - MARGIN * 2, 8, 'F');
    pdf.setFontSize(9);
    pdf.setTextColor(70, 63, 54);
    [tr('pdf.colGuest'), tr('pdf.colTable'), tr('pdf.colSeat')].forEach((label, i) => pdf.text(label, cols[i] + 2, y + 5.4));
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40, 36, 31);
    rows.slice(page * perPage, (page + 1) * perPage).forEach((row, i) => {
      const rowY = y + 8 + i * 7;
      if (i % 2) {
        pdf.setFillColor(250, 248, 244);
        pdf.rect(MARGIN, rowY, w - MARGIN * 2, 7, 'F');
      }
      row.forEach((value, col) => pdf.text(fitText(pdf, value, widths[col]), cols[col] + 2, rowY + 4.7));
    });
  }
  return count;
}

async function threePage(pdf: jsPDF, doc: SeatDocument, blob: Blob): Promise<void> {
  const [image, data] = await Promise.all([
    createImageBitmap(blob),
    imageData(blob),
  ]);
  try {
    pdf.addPage('a4', 'landscape');
    const pageW = 297;
    const pageH = 210;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(40, 36, 31);
    pdf.text(tr('pdf.view3d'), MARGIN, MARGIN + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(120, 109, 96);
    pdf.text(doc.meta.name, pageW - MARGIN, MARGIN + 5, { align: 'right' });
    const availW = pageW - MARGIN * 2;
    const availH = pageH - MARGIN * 2 - 20;
    const ratio = Math.min(availW / image.width, availH / image.height);
    const w = image.width * ratio;
    const h = image.height * ratio;
    pdf.addImage(data, 'PNG', MARGIN + (availW - w) / 2, 25 + (availH - h) / 2, w, h);
  } finally {
    image.close();
  }
}

export async function renderPdf(doc: SeatDocument, opts: PdfOptions): Promise<Blob> {
  const [{ jsPDF: JsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const layout = pdfLayout(doc, opts);
  const { svg } = buildPlanSvg(doc, { ...opts, background: null, pxPerMeter: 100, fontFamily: 'helvetica' });
  const pdf = new JsPDF({ orientation: layout.orientation, unit: 'mm', format: opts.paper, compress: true });
  pdf.setProperties({ title: doc.meta.name, creator: 'Seatsketch Studio' });
  let top = MARGIN;
  if (opts.header ?? opts.title) {
    await pdfHeader(pdf, doc, layout.pageW);
    top += HEADER;
  }
  const availH = layout.pageH - top - MARGIN - FOOTER;
  const availW = layout.pageW - MARGIN * 2;
  const x = MARGIN + Math.max(0, (availW - layout.drawW) / 2);
  const y = top + Math.max(0, (availH - layout.drawH) / 2);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden';
  host.innerHTML = svg;
  document.body.appendChild(host);
  try {
    const el = host.querySelector('svg');
    if (!el) throw new Error(tr('export.renderFailed'));
    await svg2pdf(el, pdf, { x, y, width: layout.drawW, height: layout.drawH });
  } finally {
    host.remove();
  }
  if (opts.three) await threePage(pdf, doc, opts.three);
  if (opts.guestList) guestPages(pdf, doc, opts.paper);
  const total = pdf.getNumberOfPages();
  const date = new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'long' }).format(new Date());
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    const size = pdf.internal.pageSize;
    const w = size.getWidth();
    const h = size.getHeight();
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(130, 120, 109);
    const scale = page === 1 ? `${opts.scale === 0 ? tr('pdf.scaleFit', { n: Math.round(layout.ratio) }) : tr('pdf.scale', { n: opts.scale })} · ` : '';
    pdf.text(`${scale}${date}`, MARGIN, h - MARGIN + 2);
    pdf.text(tr('pdf.page', { n: page, total }), w / 2, h - MARGIN + 2, { align: 'center' });
    pdf.text(tr('pdf.madeWith'), w - MARGIN, h - MARGIN + 2, { align: 'right' });
  }
  return pdf.output('blob');
}
