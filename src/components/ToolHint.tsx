import { useUi } from '../state/uiStore';
import { useInteraction } from '../state/interactionStore';
import { TABLE_PRESETS } from '../editor/objects/factory';
import { toolById } from '../editor/tools/tools';
import { activeController } from '../editor/interactions/controller';
import { cx } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TablePresetIcon } from './TablePresetIcon';
import { useT, type MsgKey } from '../i18n';

/** Floating bar at the top of the canvas: table shapes or a short guide to the tool. */
export function ToolHint() {
  const t = useT();
  const tool = useUi((s) => s.tool);
  const preset = useUi((s) => s.tablePreset);
  const setPreset = useUi((s) => s.setTablePreset);
  const polygon = useInteraction((s) => (s.draft?.kind === 'polygon' ? s.draft.points.length : 0));
  if (tool === 'select') return null;
  const def = toolById(tool);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
      <div className="anim-pop pointer-events-auto flex max-w-full items-center gap-1 rounded-xl border border-line bg-canvas/95 p-1 shadow-float backdrop-blur" data-testid="tool-hint">
        {tool === 'table' &&
          TABLE_PRESETS.map((p) => (
            <Tooltip key={p.id} label={t(`preset.${p.id}` as MsgKey)}>
              <button
                type="button"
                aria-label={t(`preset.${p.id}` as MsgKey)}
                aria-pressed={preset === p.id}
                data-testid={`preset-${p.id}`}
                onClick={() => setPreset(p.id)}
                className={cx(
                  'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                  preset === p.id ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-hover hover:text-ink',
                )}
              >
                <TablePresetIcon id={p.id} />
              </button>
            </Tooltip>
          ))}
        {tool === 'table' && <div className="mx-1 h-6 w-px bg-line" />}
        <span className="truncate px-2 text-[12px] text-muted">
          {polygon > 0 ? (
            <>
              {t('toolhint.points', { n: polygon })} · <b className="font-semibold text-ink">{t('key.Enter')}</b> {t('toolhint.close')} ·{' '}
              <b className="font-semibold text-ink">{t('key.Backspace')}</b> {t('toolhint.undoPoint')}
            </>
          ) : (
            t(def.hint)
          )}
        </span>
        {polygon >= 3 && (
          <button
            type="button"
            onClick={() => activeController?.finishPolygon()}
            className="ml-1 h-7 shrink-0 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-ink"
          >
            {t('toolhint.closeButton')}
          </button>
        )}
      </div>
    </div>
  );
}
