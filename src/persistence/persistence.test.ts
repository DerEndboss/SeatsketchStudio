import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../types/document';
import { parseDocument, serializeDocument } from './serialize';
import { assignmentsCsv, guestNamesFromCsv, namesFromPastedText, parseCsv } from './csv';
import { createExampleDocument } from './example';
import { createCustomTable } from '../editor/objects/factory';
import { withObjects } from '../editor/objects/tableOps';
import { buildPlanSvg } from '../export/svg';
import { pdfLayout } from '../export/pdf';

describe('Project file', () => {
  it('save → load yields the same document (round trip)', () => {
    const doc = createExampleDocument();
    const r = parseDocument(serializeDocument(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.doc.objects).toEqual(JSON.parse(JSON.stringify(doc.objects)));
    expect(r.doc.guests).toEqual(doc.guests);
    expect(r.doc.settings).toEqual(doc.settings);
  });

  it('freehand raw path and smoothing are preserved (in metres, not pixels)', () => {
    const t = createCustomTable(
      { points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.4 }, { x: 0.3, y: 0.5 }, { x: -0.4, y: 0.3 }], smoothing: 0.73, preserveCorners: false },
      { x: 1.25, y: -2 },
      2.4,
      1.1,
      'Niere',
    );
    const doc = withObjects(createExampleDocument(), [t]);
    const r = parseDocument(serializeDocument(doc));
    if (!r.ok) throw new Error(r.error);
    const back = r.doc.objects[0];
    expect(back).toEqual(t);
  });

  it('unknown objects and fields are never lost', () => {
    const doc = createExampleDocument();
    const raw = JSON.parse(serializeDocument(doc));
    raw.futureFeature = { layers: [1, 2, 3] };
    raw.objects.push({ id: 'x1', type: 'stage', x: 1, y: 2, glitter: true });
    raw.objects[0].customNote = 'stage left';
    const r = parseDocument(JSON.stringify(raw));
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings.length).toBe(1);
    const again = JSON.parse(serializeDocument(r.doc));
    expect(again.futureFeature).toEqual({ layers: [1, 2, 3] });
    expect(again.objects.some((o: { id: string }) => o.id === 'x1')).toBe(true);
    expect(again.objects[0].customNote).toBe('stage left');
  });

  it('newer format version: loads with a notice, the version is kept', () => {
    const raw = JSON.parse(serializeDocument(createExampleDocument()));
    raw.version = SCHEMA_VERSION + 3;
    const r = parseDocument(JSON.stringify(raw));
    if (!r.ok) throw new Error(r.error);
    expect(r.warnings[0]).toMatch(/newer version/);
    expect(JSON.parse(serializeDocument(r.doc)).version).toBe(SCHEMA_VERSION + 3);
  });

  it('foreign files are rejected', () => {
    expect(parseDocument('not json').ok).toBe(false);
    expect(parseDocument('{"schema":"anders","version":1}').ok).toBe(false);
    expect(parseDocument('{"schema":"seatsketch-studio"}').ok).toBe(false);
  });

  it('chairs with a missing table become single chairs instead of disappearing', () => {
    const raw = JSON.parse(serializeDocument(createExampleDocument()));
    raw.objects = raw.objects.filter((o: { type: string; name?: string }) => !(o.type === 'table' && o.name === 'Tisch 2'));
    const before = raw.objects.filter((o: { type: string }) => o.type === 'chair').length;
    const r = parseDocument(JSON.stringify(raw));
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.objects.filter((o) => o.type === 'chair')).toHaveLength(before);
    expect(r.warnings.some((w) => w.includes('single chairs'))).toBe(true);
  });
});

describe('CSV', () => {
  it('export: header row, one row per chair, guests without a seat at the end', () => {
    const doc = createExampleDocument();
    const csv = assignmentsCsv(doc);
    expect(csv.startsWith('﻿Table;Seat;Guest\r\n')).toBe(true);
    const rows = parseCsv(csv);
    const chairs = doc.objects.filter((o) => o.type === 'chair').length;
    const seated = doc.objects.filter((o) => o.type === 'chair' && o.guestId).length;
    expect(rows.length).toBe(1 + chairs + (doc.guests.length - seated));
    expect(rows.slice(1).filter((r) => r[2]).length).toBe(doc.guests.length);
  });

  it('import: column "Name" or "Vorname/Nachname", quotes, semicolon', () => {
    expect(guestNamesFromCsv('Name;E-Mail\r\n"Müller, Hans";h@x.de\r\nEva;e@x.de\r\n')).toEqual(['Müller, Hans', 'Eva']);
    expect(guestNamesFromCsv('Vorname,Nachname\nAnna,Berger\nBen,Schulz')).toEqual(['Anna Berger', 'Ben Schulz']);
    expect(guestNamesFromCsv('Anna\nBen\n\nClara')).toEqual(['Anna', 'Ben', 'Clara']);
  });

  it('paste: lines, or one line with commas', () => {
    expect(namesFromPastedText('Anna\n Ben \n\nClara')).toEqual(['Anna', 'Ben', 'Clara']);
    expect(namesFromPastedText('Anna, Ben; Clara')).toEqual(['Anna', 'Ben', 'Clara']);
  });
});

describe('Export', () => {
  it('SVG is a true vector graphic in metres, no embedded raster image', () => {
    const doc = createExampleDocument();
    const { svg, width, height } = buildPlanSvg(doc, { showDimensions: true, showGuestNames: true, showTableNames: true, background: '#fff' });
    expect(svg).not.toMatch(/<image/);
    expect(svg).toMatch(/viewBox="/);
    // 12 × 8 m room plus walls, dimension chains and margin
    expect(width).toBeGreaterThan(12.5);
    expect(width).toBeLessThan(15);
    expect(height).toBeGreaterThan(8.5);
    expect((svg.match(/<polygon/g) ?? []).length).toBeGreaterThanOrEqual(1 + 6);
    for (const g of doc.guests.filter((x) => doc.objects.some((o) => o.type === 'chair' && o.guestId === x.id))) {
      expect(svg).toContain(g.name.split(' ')[0]);
    }
  });

  it('without guest names there are no names in the SVG', () => {
    const doc = createExampleDocument();
    const { svg } = buildPlanSvg(doc, { showDimensions: false, showGuestNames: false, showTableNames: false, background: null });
    expect(svg).not.toContain('Berger');
    expect(svg).not.toContain('Tisch 1');
  });

  it('PDF layout: 1:100 fits on A4 landscape, 1:50 does not; fit-to-page always does', () => {
    const doc = createExampleDocument();
    const base = { showDimensions: true, showGuestNames: true, showTableNames: true, paper: 'a4' as const, orientation: 'auto' as const, title: true };
    const l100 = pdfLayout(doc, { ...base, scale: 100 });
    expect(l100.orientation).toBe('landscape');
    expect(l100.fits).toBe(true);
    expect(l100.mmPerM).toBe(10);
    expect(pdfLayout(doc, { ...base, scale: 50 }).fits).toBe(false);
    expect(pdfLayout(doc, { ...base, scale: 0 }).fits).toBe(true);
  });
});
