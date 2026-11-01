import { useT } from '../i18n';
import { FolderOpen, LayoutGrid, SquareDashed } from 'lucide-react';
import { useEditor } from '../state/editorStore';
import { useUi } from '../state/uiStore';
import { openProject, setTool } from '../editor/commands';

/** Only the small action buttons intercept clicks; the canvas stays usable. */
export function CanvasStart() {
  const t = useT();
  const empty = useEditor((s) => s.doc.objects.length === 0);
  const tool = useUi((s) => s.tool);
  const preview = useUi((s) => s.preview);
  if (!empty || preview || tool !== 'select') return null;
  const action = 'pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[12px] text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent';
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 pb-12" data-testid="canvas-start">
      <div className="max-w-lg text-center">
        <img src="./logo.png" alt="" width={42} height={42} className="mx-auto mb-4 opacity-80" draggable={false} />
        <h1 className="text-[25px] font-medium tracking-tight text-ink/70">{t('start.title')}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{t('start.description')}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-1">
          <button type="button" className={action} onClick={() => setTool('room')}><SquareDashed size={15} />{t('doc.drawRoom')}</button>
          <button type="button" className={action} data-testid="open-templates" onClick={() => useUi.getState().setTemplatesOpen(true)}><LayoutGrid size={15} />{t('templates.open')}</button>
          <button type="button" className={action} onClick={() => void openProject()}><FolderOpen size={15} />{t('cmd.open')}</button>
        </div>
        <p className="mt-6 text-[11px] text-faint">{t('start.saved')}</p>
      </div>
    </div>
  );
}
