import { useMemo, useRef, useState } from 'react';
import { Crosshair, FileDown, FileUp, Search, Trash, UserMinus, UserPlus, Users, Wand } from 'lucide-react';
import type { ChairObject } from '../../types/document';
import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { currentLocale, useT } from '../../i18n';
import { getLookup } from '../../state/lookup';
import { worldPlacement } from '../../geometry/objects';
import { addGuests, assignGuest, removeGuests, renameGuest, seatLabel, seatUnassignedGuests } from '../../editor/objects/tableOps';
import { assignmentsCsv, guestNamesFromCsv, namesFromPastedText } from '../../persistence/csv';
import { safeFileName } from '../../persistence/serialize';
import { GUEST_MIME } from '../../editor/interactions/controller';
import { platform } from '../../platforms';
import { Button, IconButton, cx } from '../ui/Button';
import { EmptyState } from '../ui/Controls';
import { applyDoc } from './shared';

function locateChair(chair: ChairObject) {
  const ed = useEditor.getState();
  const ui = useUi.getState();
  const p = worldPlacement(chair, getLookup(ed.doc));
  const scale = Math.max(ui.viewport.scale, 90);
  ui.setViewport({ scale, x: ui.stageSize.width / 2 - p.x * scale, y: ui.stageSize.height / 2 - p.y * scale });
  ed.setSelection([chair.id]);
}

export function GuestPanel() {
  const t = useT();
  const doc = useEditor((s) => s.doc);
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useUi((s) => s.toast);

  const seatOf = useMemo(() => {
    const m = new Map<string, ChairObject>();
    for (const o of doc.objects) if (o.type === 'chair' && o.guestId) m.set(o.guestId, o);
    return m;
  }, [doc.objects]);
  const freeChairs = doc.objects.filter((o) => o.type === 'chair' && !o.guestId).length;
  const seated = doc.guests.filter((g) => seatOf.has(g.id)).length;
  const locale = currentLocale();
  const q = query.trim().toLocaleLowerCase(locale);
  const list = q ? doc.guests.filter((g) => g.name.toLocaleLowerCase(locale).includes(q)) : doc.guests;

  const add = (names: string[]) => {
    if (names.length === 0) return;
    let added = 0;
    applyDoc((d) => {
      const r = addGuests(d, names);
      added = r.added.length;
      return r.doc;
    });
    const dupes = names.length - added;
    toast(`${t('guests.added', { n: added })}${dupes > 0 ? t('guests.dupes', { n: dupes }) : ''}.`, 'success');
  };

  const fill = () => {
    let res = { seated: 0, left: 0 };
    applyDoc((d) => {
      const r = seatUnassignedGuests(d);
      res = r;
      return r.doc;
    });
    if (res.seated === 0 && res.left === 0) toast(t('guests.allSeated'), 'info');
    else if (res.left > 0) toast(t('guests.seatedSome', { n: res.seated, left: res.left }), 'warning');
    else toast(t('guests.seatedAll', { n: res.seated }), 'success');
  };

  const exportCsv = async () => {
    try {
      const ok = await platform.exportFile({
        data: new Blob([assignmentsCsv(doc)], { type: 'text/csv;charset=utf-8' }),
        suggestedName: `${safeFileName(doc.meta.name)} – ${t('csv.fileSuffix')}`,
        mime: 'text/csv',
        extension: 'csv',
        description: t('export.csvSub'),
      });
      if (ok) toast(t('guests.csvExported'), 'success');
    } catch (e) {
      toast(t('export.failed', { error: (e as Error).message }), 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="guest-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-ink">{t('guests.count', { n: doc.guests.length })}</span>
          <span className="text-right text-[11.5px] text-muted">{t('guests.stats', { seated, free: t('guests.freeChairs', { n: freeChairs }) })}</span>
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              add(namesFromPastedText(paste));
              setPaste('');
            }
          }}
          rows={3}
          placeholder={t('guests.paste')}
          aria-label={t('guests.pasteLabel')}
          data-testid="guest-paste"
          className="w-full resize-none rounded-md border border-line bg-field px-2 py-1.5 text-[12.5px] leading-snug text-ink outline-none placeholder:text-faint hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" icon={UserPlus} disabled={!paste.trim()} data-testid="guest-add" onClick={() => { add(namesFromPastedText(paste)); setPaste(''); }}>
            {t('guests.add')}
          </Button>
          <Button size="sm" icon={Wand} disabled={doc.guests.length === seated || freeChairs === 0} onClick={fill} data-testid="guest-fill">
            {t('guests.fill')}
          </Button>
        </div>
      </div>

      {doc.guests.length > 0 && (
        <div className="border-b border-line px-4 py-2">
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('guests.search')} aria-label={t('guests.search')} className="h-7 w-full rounded-md border border-line bg-field pl-7 pr-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        </div>
      )}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto py-1">
        {doc.guests.length === 0 ? (
          <EmptyState icon={Users} title={t('guests.emptyTitle')}>{t('guests.emptyText')}</EmptyState>
        ) : list.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-muted">{t('guests.noMatch', { q: query })}</p>
        ) : (
          <ul>
            {list.map((g) => {
              const chair = seatOf.get(g.id);
              return (
                <li
                  key={g.id}
                  draggable={editing !== g.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(GUEST_MIME, g.id);
                    e.dataTransfer.effectAllowed = 'link';
                  }}
                  className="group flex h-9 cursor-grab items-center gap-2 px-4 hover:bg-hover active:cursor-grabbing"
                  data-testid="guest-row"
                >
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', chair ? 'bg-accent' : 'border border-line-strong')} />
                  <div className="min-w-0 flex-1">
                    {editing === g.id ? (
                      <input
                        autoFocus
                        defaultValue={g.name}
                        aria-label={t('guests.rename')}
                        className="h-6 w-full rounded border border-accent bg-field px-1 text-[12.5px] outline-none"
                        onBlur={(e) => {
                          applyDoc((d) => renameGuest(d, g.id, e.target.value));
                          setEditing(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <button type="button" className="block w-full truncate text-left text-[12.5px] text-ink" onDoubleClick={() => setEditing(g.id)} title={t('guests.renameTip')}>
                        {g.name}
                      </button>
                    )}
                    <div className="truncate text-[11px] text-muted">{chair ? seatLabel(doc, chair) : t('guests.noSeat')}</div>
                  </div>
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {chair && <IconButton icon={Crosshair} size="sm" label={t('guests.locate')} side="left" onClick={() => locateChair(chair)} />}
                    {chair && <IconButton icon={UserMinus} size="sm" label={t('guests.release')} side="left" onClick={() => applyDoc((d) => assignGuest(d, chair.id, undefined))} />}
                    <IconButton icon={Trash} size="sm" tone="danger" label={t('guests.remove')} side="left" onClick={() => applyDoc((d) => removeGuests(d, [g.id]))} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex gap-1.5 border-t border-line px-4 py-2.5">
        <Button size="sm" variant="ghost" icon={FileUp} onClick={() => fileInput.current?.click()}>{t('guests.import')}</Button>
        <Button size="sm" variant="ghost" icon={FileDown} onClick={() => void exportCsv()} disabled={doc.objects.every((o) => o.type !== 'chair') && doc.guests.length === 0}>{t('guests.export')}</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const names = guestNamesFromCsv(await f.text());
            if (names.length === 0) toast(t('guests.noNames'), 'warning');
            else add(names);
          }}
        />
      </div>
    </div>
  );
}
