import type { SeatDocument } from '../types/document';
import { chairsInSeatOrder } from '../editor/objects/tableOps';
import { findObject } from '../state/lookup';
import { tr } from '../i18n';

/* CSV in the German Excel format: semicolon, CRLF, UTF-8 with BOM. */

const SEP = ';';

function cell(v: string | number): string {
  const s = String(v);
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const line = (cells: Array<string | number>): string => cells.map(cell).join(SEP);

/** Seating plan as CSV: table; seat; guest, followed by guests without a seat. */
export function assignmentsCsv(doc: SeatDocument): string {
  const guests = new Map(doc.guests.map((g) => [g.id, g.name]));
  const rows: string[] = [line([tr('csv.table'), tr('csv.seat'), tr('csv.guest')])];
  const seated = new Set<string>();
  let free = 0;
  for (const c of chairsInSeatOrder(doc)) {
    const name = c.guestId ? guests.get(c.guestId) ?? '' : '';
    if (c.guestId) seated.add(c.guestId);
    if (c.tableId) {
      const t = findObject(doc, c.tableId);
      rows.push(line([t && t.type === 'table' ? t.name : '', (c.seat ?? 0) + 1, name]));
    } else {
      free++;
      rows.push(line([tr('csv.single'), free, name]));
    }
  }
  for (const g of doc.guests) if (!seated.has(g.id)) rows.push(line(['', '', g.name]));
  return `﻿${rows.join('\r\n')}\r\n`;
}

/** Splits CSV text into rows and cells (quotes, line breaks inside cells). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim =
    delimiter ??
    [';', '\t', ','].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_NAME = /^(name|gast|gäste|guest|guests|teilnehmer(in)?|person|vollständiger name|full name|nombre|invitado|姓名|宾客|名字|नाम|मेहमान)$/i;
const HEADER_FIRST = /^(vorname|first ?name|given name|nombre de pila|名)$/i;
const HEADER_LAST = /^(nachname|familienname|last ?name|surname|family name|apellidos?|姓)$/i;

/**
 * Reads guest names from CSV or a plain list (one name per line).
 * Detects a "Name"/"Guest" column or "First name" + "Last name" (in several languages); otherwise the first column is used.
 */
export function guestNamesFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const nameCol = header.findIndex((h) => HEADER_NAME.test(h));
  const firstCol = header.findIndex((h) => HEADER_FIRST.test(h));
  const lastCol = header.findIndex((h) => HEADER_LAST.test(h));
  const hasHeader = nameCol >= 0 || firstCol >= 0 || lastCol >= 0 || /^(tisch|platz|table|seat|mesa|asiento|桌子|座位|मेज़|सीट)$/i.test(header[0] ?? '');
  const body = hasHeader ? rows.slice(1) : rows;
  const names: string[] = [];
  for (const r of body) {
    let name: string;
    if (nameCol >= 0) name = r[nameCol] ?? '';
    else if (firstCol >= 0 || lastCol >= 0) name = [r[firstCol] ?? '', r[lastCol] ?? ''].join(' ');
    else if (/^(tisch|platz|table|seat|mesa|asiento|桌子|座位|मेज़|सीट)$/i.test(header[0] ?? '') && header.length >= 3) name = r[2] ?? '';
    else name = r[0] ?? '';
    name = name.trim().replace(/\s+/g, ' ');
    if (name) names.push(name);
  }
  return names;
}

/** Pasted text: lines, or, on a single line, separated by comma/semicolon. */
export function namesFromPastedText(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1 && /[;,]/.test(lines[0])) return lines[0].split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  if (lines.length > 1 && lines.some((l) => l.includes(';') || l.includes('\t'))) return guestNamesFromCsv(text);
  return lines;
}
