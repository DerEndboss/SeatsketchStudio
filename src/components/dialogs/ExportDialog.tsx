import { useState } from 'react';
import { Download, FileImage, FileSpreadsheet, FileText, Shapes } from 'lucide-react';
import { useEditor } from '../../state/editorStore';
import { useUi, type ExportFormat } from '../../state/uiStore';
import { safeFileName } from '../../persistence/serialize';
import { assignmentsCsv } from '../../persistence/csv';
import { buildPlanSvg } from '../../export/svg';
import { pngSize, renderPng } from '../../export/raster';
import { pdfLayout, renderPdf, type Orientation, type PaperSize, type PdfScale } from '../../export/pdf';
import { renderThree } from '../../export/three';
import { withExportHeader } from '../../export/branding';
import { formatNumber } from '../../geometry/measurements';
import { useT, type MsgKey } from '../../i18n';
import { platform } from '../../platforms';
import { Button, cx } from '../ui/Button';
import { Note, Row } from '../ui/Fields';
import { Segmented, ToggleRow } from '../ui/Controls';
import { Dialog } from '../ui/Overlay';

const FORMATS: ReadonlyArray<{ id: ExportFormat; sub: MsgKey; icon: typeof FileImage }> = [
  { id: 'pdf', sub: 'export.pdfSub', icon: FileText },
  { id: 'png', sub: 'export.pngSub', icon: FileImage },
  { id: 'svg', sub: 'export.svgSub', icon: Shapes },
  { id: 'csv', sub: 'export.csvSub', icon: FileSpreadsheet },
];

export function ExportDialog() {
  const open = useUi((s) => s.dialog === 'export');
  return open ? <ExportBody onClose={() => useUi.getState().openDialog(null)} /> : null;
}

function ExportBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const initialFormat = useUi((s) => s.exportFormat);
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [header, setHeader] = useState(true);
  const [three, setThree] = useState(false);
  const [angle, setAngle] = useState('45');
  const [elevation, setElevation] = useState<'low' | 'mid' | 'high'>('mid');
  const [guestList, setGuestList] = useState(false);
  const [dims, setDims] = useState(doc.settings.showDimensions);
  const [names, setNames] = useState(doc.settings.showGuestNames);
  const [tableNames, setTableNames] = useState(doc.settings.showTableNames);
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState<'100' | '200' | '400'>('200');
  const [paper, setPaper] = useState<PaperSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [scale, setScale] = useState<PdfScale>(0);
  const [busy, setBusy] = useState(false);
  const empty = doc.objects.length === 0;
  const has3d = three && (format === 'png' || format === 'pdf');
  const base = { showDimensions: dims, showGuestNames: names, showTableNames: tableNames };
  const layout = format === 'pdf' ? pdfLayout(doc, { ...base, paper, orientation, scale, title: true, header }) : null;
  const png = format === 'png' && !three ? pngSize(doc, { ...base, pxPerMeter: Number(quality), transparent: transparent && !header }) : null;
  const threeWidth = Number(quality) * 8;
  const name = safeFileName(doc.meta.name);

  const run = async () => {
    setBusy(true);
    try {
      let req: { data: Blob; ext: string; mime: string; desc: string; suffix?: string };
      switch (format) {
        case 'png': {
          const image = three
            ? await renderThree(doc, { width: threeWidth, height: Math.round(threeWidth / 1.45), angle: Number(angle), elevation })
            : await renderPng(doc, { ...base, pxPerMeter: Number(quality), transparent: transparent && !header });
          req = { data: header ? await withExportHeader(image, doc) : image, ext: 'png', mime: 'image/png', desc: 'PNG' };
          break;
        }
        case 'svg': {
          const { svg } = buildPlanSvg(doc, { ...base, background: '#FFFFFF' });
          req = { data: new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), ext: 'svg', mime: 'image/svg+xml', desc: 'SVG' };
          break;
        }
        case 'pdf': {
          const image = three ? await renderThree(doc, { width: 1800, height: 1240, angle: Number(angle), elevation }) : undefined;
          req = { data: await renderPdf(doc, { ...base, paper, orientation, scale, title: true, header, guestList, three: image }), ext: 'pdf', mime: 'application/pdf', desc: 'PDF' };
          break;
        }
        case 'csv':
          req = { data: new Blob([assignmentsCsv(doc)], { type: 'text/csv;charset=utf-8' }), ext: 'csv', mime: 'text/csv', desc: 'CSV', suffix: ` – ${t('csv.fileSuffix')}` };
          break;
      }
      const ok = await platform.exportFile({
        data: req.data,
        suggestedName: `${name}${req.suffix ?? ''}`,
        mime: req.mime,
        extension: req.ext,
        description: req.desc,
      });
      if (ok) {
        useUi.getState().toast(t('export.done', { format: format.toUpperCase() }), 'success');
        onClose();
      }
    } catch (e) {
      useUi.getState().toast(t('export.failed', { error: (e as Error).message }), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('export.title')}
      description={t('export.desc')}
      width={500}
      testId="export-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('confirm.cancel')}</Button>
          <Button variant="primary" icon={Download} onClick={() => void run()} disabled={busy || (empty && format !== 'csv')} data-testid="export-run">
            {busy ? t(three ? 'export.previewLoading' : 'export.running') : t('export.run', { format: format.toUpperCase() })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('export.format')}>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={format === f.id}
              data-testid={`format-${f.id}`}
              onClick={() => setFormat(f.id)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 transition-colors',
                format === f.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <f.icon size={18} strokeWidth={1.6} />
              <span className="text-[12px] font-semibold">{f.id.toUpperCase()}</span>
              <span className="text-[10.5px] leading-none opacity-80">{t(f.sub)}</span>
            </button>
          ))}
        </div>
        {(format === 'png' || format === 'pdf') && (
          <div className="flex flex-col gap-1">
            <ToggleRow label={t('export.header')} hint={t('export.headerHint')} checked={header} onChange={setHeader} testId="export-header" />
            <ToggleRow label={t('export.three')} hint={t(format === 'png' ? 'export.threeHintPng' : 'export.threeHintPdf')} checked={three} onChange={setThree} testId="export-3d" />
            {has3d && (
              <>
                <Row label={t('export.angle')}>
                  <Segmented ariaLabel={t('export.angle')} size="sm" value={angle} onChange={setAngle} options={['45', '135', '225', '315'].map((value) => ({ value, label: `${value}°` }))} />
                </Row>
                <Row label={t('export.height')}>
                  <Segmented
                    ariaLabel={t('export.height')}
                    size="sm"
                    value={elevation}
                    onChange={setElevation}
                    options={[
                      { value: 'low', label: t('export.heightLow') },
                      { value: 'mid', label: t('export.heightMid') },
                      { value: 'high', label: t('export.heightHigh') },
                    ]}
                  />
                </Row>
              </>
            )}
            {format === 'pdf' && doc.guests.length > 0 && (
              <ToggleRow label={t('export.guestList')} hint={t('export.guestListHint')} checked={guestList} onChange={setGuestList} testId="export-guest-list" />
            )}
          </div>
        )}
        {format !== 'csv' && !has3d && (
          <div className="flex flex-col gap-1">
            <ToggleRow label={t('export.dims')} checked={dims} onChange={setDims} />
            <ToggleRow label={t('export.tableNames')} checked={tableNames} onChange={setTableNames} />
            <ToggleRow label={t('export.guestNames')} checked={names} onChange={setNames} />
          </div>
        )}
        {format === 'png' && (
          <>
            <Row label={t('export.resolution')}>
              <Segmented
                ariaLabel={t('export.resolution')}
                size="sm"
                value={quality}
                onChange={setQuality}
                options={[
                  { value: '100', label: t('export.resNormal') },
                  { value: '200', label: t('export.resHigh') },
                  { value: '400', label: t('export.resMax') },
                ]}
              />
            </Row>
            {!has3d && !header && <ToggleRow label={t('export.transparent')} checked={transparent} onChange={setTransparent} />}
            <Note>{t('export.pixels', { w: three ? threeWidth : png?.width ?? 0, h: three ? Math.round(threeWidth / 1.45) : png?.height ?? 0 })}</Note>
          </>
        )}
        {format === 'pdf' && layout && (
          <>
            <Row label={t('export.paper')}>
              <Segmented ariaLabel={t('export.paper')} size="sm" value={paper} onChange={setPaper} options={[{ value: 'a4', label: 'A4' }, { value: 'a3', label: 'A3' }]} />
            </Row>
            <Row label={t('export.orientation')}>
              <Segmented
                ariaLabel={t('export.orientation')}
                size="sm"
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'auto', label: t('export.auto') },
                  { value: 'portrait', label: t('export.portrait') },
                  { value: 'landscape', label: t('export.landscape') },
                ]}
              />
            </Row>
            <Row label={t('export.scale')}>
              <Segmented
                ariaLabel={t('export.scale')}
                size="sm"
                value={String(scale) as '0' | '50' | '100' | '200'}
                onChange={(v) => setScale(Number(v) as PdfScale)}
                options={[
                  { value: '0', label: t('export.fit') },
                  { value: '50', label: '1:50' },
                  { value: '100', label: '1:100' },
                  { value: '200', label: '1:200' },
                ]}
              />
            </Row>
            {layout.fits ? (
              <Note>
                {t('export.layoutInfo', {
                  paper: paper.toUpperCase(),
                  orientation: t(layout.orientation === 'landscape' ? 'export.landscape' : 'export.portrait'),
                  scale: scale === 0 ? t('export.approx', { n: formatNumber(Math.round(layout.ratio), 0, 0) }) : `1:${scale}`,
                })}
              </Note>
            ) : (
              <Note tone="warn">{t('export.noFit', { n: scale, paper: paper.toUpperCase() })}</Note>
            )}
          </>
        )}
        {format === 'csv' && (
          <Note>{t('export.csvInfo', { guests: t('count.guests', { n: doc.guests.length }), chairs: t('count.chairs', { n: doc.objects.filter((o) => o.type === 'chair').length }) })}</Note>
        )}
        {empty && format !== 'csv' && <Note tone="warn">{t('export.empty')}</Note>}
      </div>
    </Dialog>
  );
}
