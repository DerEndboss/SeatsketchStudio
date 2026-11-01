import { Download, TriangleAlert } from 'lucide-react';
import { platform } from '../platforms';
import { useEditor } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { useInteraction } from '../state/interactionStore';
import { getLookup } from '../state/lookup';
import { zoomPercent } from '../geometry/coordinateSystem';
import { formatLength, formatNumber } from '../geometry/measurements';
import { selectionBounds } from '../editor/objects/docOps';
import { toolById } from '../editor/tools/tools';
import { useT } from '../i18n';

function Item({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap" title={title}>
      {children}
    </span>
  );
}

/** Very quiet status bar: tool, pointer position, selection size, grid, zoom, hints. */
export function StatusBar() {
  const t = useT();
  const tool = useUi((s) => s.tool);
  const cursor = useUi((s) => s.cursor);
  const zoom = useUi((s) => zoomPercent(s.viewport));
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const warnings = useInteraction((s) => s.warnings);
  const unit = doc.settings.unit;
  const b = selection.length ? selectionBounds(doc, selection, getLookup(doc)) : null;
  const chairs = doc.objects.reduce((n, o) => n + (o.type === 'chair' ? 1 : 0), 0);
  const tables = doc.objects.reduce((n, o) => n + (o.type === 'table' ? 1 : 0), 0);
  const seated = doc.objects.reduce((n, o) => n + (o.type === 'chair' && o.guestId ? 1 : 0), 0);
  const nWarn = warnings.size;
  const fmt = (v: number) => formatNumber(unit === 'cm' ? v * 100 : v, unit === 'cm' ? 0 : 2, unit === 'cm' ? 0 : 2);

  const selectWarned = () => useEditor.getState().setSelection([...warnings.keys()]);

  return (
    <footer className={`flex shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[11px] tabular-nums text-muted ${platform.kind === 'web' ? 'h-14' : 'h-7'}`} data-testid="statusbar">
      {platform.kind === 'web' && (
        <a href="https://exporthub.pixel-cursor.com/download/seatsketch" target="_blank" rel="noopener noreferrer" data-testid="desktop-download" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-accent px-3 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
          <Download size={16} strokeWidth={1.75} aria-hidden="true" />
          {t('web.download')}
        </a>
      )}
      <Item>{t(toolById(tool).label)}</Item>
      <Item title={t('sb.cursor')}>
        {cursor ? (
          <>
            x {fmt(cursor.x)} · y {fmt(cursor.y)} {unit}
          </>
        ) : (
          '–'
        )}
      </Item>
      {b && (
        <Item title={t('sb.extent')}>
          {selection.length === 1 ? t('sb.selection') : t('count.objects', { n: selection.length })} · {formatLength(b.maxX - b.minX, unit)} × {formatLength(b.maxY - b.minY, unit)}
        </Item>
      )}
      <span className="ml-auto" />
      <Item title={t('sb.stats')}>
        <span data-testid="stats">
          {t('count.tables', { n: tables })} · {t('count.chairs', { n: chairs })} · {t('sb.seated', { n: seated })}
        </span>
      </Item>
      {nWarn > 0 && (
        <button type="button" onClick={selectWarned} className="flex items-center gap-1 rounded px-1 font-medium text-warn hover:bg-warn-soft" title={t('sb.hintsTip')}>
          <TriangleAlert size={12} strokeWidth={2} />
          {t('sb.hints', { n: nWarn })}
        </button>
      )}
      <Item title={t('doc.gridSize')}>{t('sb.grid', { v: formatLength(doc.settings.gridSize, 'cm') })}</Item>
      <Item title={t('top.snap')}>{doc.settings.snap ? t('sb.snap', { v: formatLength(doc.settings.snapStep, 'cm') }) : t('sb.snapOff')}</Item>
      <Item title={t('sb.zoom')}>{zoom} %</Item>
    </footer>
  );
}
