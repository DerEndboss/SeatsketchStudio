import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUi } from '../state/uiStore';
import { useEditor } from '../state/editorStore';
import { useFile } from '../state/fileStore';
import { useT } from '../i18n';
import { buildTemplate, TEMPLATES, type TemplateId } from '../persistence/templates';
import { buildPlanSvg } from '../export/svg';
import { createPlan } from '../editor/projects';
import { fitView } from '../editor/view';

export function TemplateLibrary() {
  const t = useT();
  const previews = useMemo(() => Object.fromEntries(TEMPLATES.map((def) => [def.id, buildPlanSvg(buildTemplate(def.id), {
    showDimensions: false, showGuestNames: false, showTableNames: false, background: null, pxPerMeter: 16,
  }).svg])), []);
  const choose = (id: TemplateId) => {
    const editor = useEditor.getState();
    let doc = buildTemplate(id);
    if (!editor.doc.objects.length && !editor.doc.guests.length && !useFile.getState().fileName) {
      doc = { ...doc, settings: { ...doc.settings, unit: editor.doc.settings.unit }, meta: { ...doc.meta, created: editor.doc.meta.created, name: editor.doc.meta.name === t('name.untitled') ? doc.meta.name : editor.doc.meta.name } };
      editor.apply(() => doc);
      editor.setSelection([]);
      useUi.getState().setTemplatesOpen(false);
      requestAnimationFrame(() => fitView(doc));
    } else createPlan(doc);
  };
  return (
    <section data-testid="template-library" className="px-3 py-3">
      <button type="button" onClick={() => useUi.getState().setTemplatesOpen(false)} className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-[12px] text-muted hover:bg-hover hover:text-ink"><ArrowLeft size={14} />Back to properties</button>
      <h2 className="px-2 text-[14px] font-semibold text-ink">A head start</h2>
      <p className="mb-4 mt-1 px-2 text-[12px] leading-relaxed text-muted">Pick a starting point. Make it yours.</p>
      <div className="flex flex-col gap-2">
        {TEMPLATES.map((def) => (
          <button type="button" key={def.id} data-testid={`template-${def.id}`} onClick={() => choose(def.id)} className="flex min-h-[86px] items-center gap-3 rounded-xl border border-line/70 bg-field/60 p-2 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent">
            <span className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md bg-canvas p-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: previews[def.id] }} />
            <span className="min-w-0"><span className="block text-[12px] font-medium text-ink">{t(def.title)}</span><span className="mt-1 block text-[11px] leading-snug text-muted">{t(def.desc)}</span></span>
          </button>
        ))}
      </div>
      <p className="mt-4 px-2 text-[11px] leading-relaxed text-faint">An existing plan stays safe in its own tab.</p>
    </section>
  );
}
