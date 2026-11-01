import { Fragment } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUi } from '../state/uiStore';
import { useT } from '../i18n';
import { TOOL_GROUPS } from '../editor/tools/tools';
import { setTool } from '../editor/commands';
import { shortcutLabel, useKeymap } from '../editor/keymap';
import { IconButton, Kbd, cx } from './ui/Button';
import { TablePresetIcon } from './TablePresetIcon';

function TableToolIcon({ size = 19 }: { size?: number }) {
  const preset = useUi((s) => s.tablePreset);
  return <TablePresetIcon id={preset} size={size + 3} />;
}

export function ToolBar() {
  const t = useT();
  const tool = useUi((s) => s.tool);
  const expanded = useUi((s) => s.toolbarExpanded);
  const setExpanded = useUi((s) => s.setToolbarExpanded);
  const overrides = useKeymap((s) => s.overrides);
  return (
    <nav
      aria-label={t('cmdgroup.tools')}
      className={cx('flex shrink-0 flex-col border-r border-line bg-panel py-2 transition-[width] duration-200', expanded ? 'w-48' : 'w-12')}
      data-testid="toolbar"
    >
      <div className={cx('mb-1 flex shrink-0 px-2', expanded ? 'justify-end' : 'justify-center')}>
        <IconButton
          icon={expanded ? PanelLeftClose : PanelLeftOpen}
          label={t(expanded ? 'toolbar.collapse' : 'toolbar.expand')}
          shortcut={shortcutLabel('toggleToolbar', overrides)}
          side="right"
          onClick={() => setExpanded(!expanded)}
          data-testid="toggle-toolbar"
        />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {TOOL_GROUPS.map((group, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <div className={cx('my-1 h-px bg-line', expanded ? 'mx-3' : 'mx-auto w-6')} />}
            <div className={cx('flex flex-col gap-1', expanded ? 'px-2' : 'items-center')}>
              {group.map((item) => {
                const Icon = item.id === 'table' ? TableToolIcon : item.icon;
                const shortcut = shortcutLabel(`tool.${item.id}`, overrides);
                if (!expanded) {
                  return (
                    <IconButton
                      key={item.id}
                      icon={Icon}
                      label={t(item.label)}
                      shortcut={shortcut}
                      side="right"
                      active={tool === item.id}
                      onClick={() => setTool(item.id)}
                      data-testid={`tool-${item.id}`}
                    />
                  );
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={tool === item.id}
                    data-testid={`tool-${item.id}`}
                    onClick={() => setTool(item.id)}
                    className={cx(
                      'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[12px] font-medium transition-colors',
                      tool === item.id ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-hover hover:text-ink',
                    )}
                  >
                    <Icon size={17} strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                    {shortcut && <Kbd>{shortcut}</Kbd>}
                  </button>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
