import { useEffect } from 'react';
import { useEditor, isDirty } from '../state/editorStore';
import { useUi, resolvedTheme } from '../state/uiStore';
import { useFile } from '../state/fileStore';
import { useInteraction } from '../state/interactionStore';
import { getLookup } from '../state/lookup';
import { computeWarnings } from '../geometry/collisionDetection';
import { installKeyboard } from '../editor/interactions/keyboard';
import { openDroppedFile, openFromText, openPendingNativeFile, refreshRecent } from '../editor/commands';
import { createPlan, initPlans, saveActiveNow, usePlans } from '../editor/projects';
import { platform } from '../platforms';
import { themeInfo } from '../styles/themes';
import { useI18n } from '../i18n';
import { createEmptyDocument } from '../editor/objects/factory';
import { useKeymap } from '../editor/keymap';

export function useThemeClass(): void {
  const theme = useUi(resolvedTheme);
  const lang = useI18n((s) => s.lang);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-beige', 'theme-espresso', 'theme-sage', 'theme-midnight');
    root.classList.add(`theme-${theme}`);
    root.classList.toggle('dark', themeInfo(theme).dark);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => useUi.getState().setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
}

/** Conflict hints (outside the room, overlap, door swing), computed with a debounce. */
export function useWarnings(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      const doc = useEditor.getState().doc;
      useInteraction.getState().set({ warnings: computeWarnings(doc, getLookup(doc)) });
    };
    run();
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, s.txBase ? 250 : 120);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);
}

export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (!useEditor.getState().txBase) saveActiveNow();
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc && s.savedDoc === prev.savedDoc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    });
    const flush = () => {
      if (timer) clearTimeout(timer);
      save();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      unsub();
      window.removeEventListener('pagehide', flush);
      if (timer) clearTimeout(timer);
      saveActiveNow();
    };
  }, []);
}

/** Window title with project name and unsaved marker; warning when closing in the browser. */
export function useWindowTitle(): void {
  const name = useEditor((s) => s.doc.meta.name);
  const dirty = useEditor(isDirty);
  const fileName = useFile((s) => s.fileName);
  useEffect(() => {
    document.title = `${dirty && fileName ? '• ' : ''}${name} – Seatsketch Studio`;
  }, [name, dirty, fileName]);
  useEffect(() => {
    if (platform.kind !== 'web') return;
    const onBefore = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (isDirty(s) && useFile.getState().fileName) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);
}

export function useKeyboard(): void {
  useEffect(() => installKeyboard(), []);
}

/** Drop files onto the window (instead of the browser/Electron opening them as a page). */
export function useFileDrop(): void {
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void openDroppedFile(file);
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

let booted = false;

export function useBoot(): void {
  useEffect(() => {
    if (booted) return;
    booted = true;
    const hasPlans = initPlans();
    if (!hasPlans) createPlan(createEmptyDocument());
    const native = window.seatsketchNative;
    if (native) {
      void native
        .initialFile()
        .then((f) => {
          if (f) openFromText(f.content, f.name, { kind: 'path', path: f.path });
        })
        .catch(() => undefined);
    }
    refreshRecent();
    const onOpen = () => void openPendingNativeFile();
    window.addEventListener('seatsketch:open-request', onOpen);
    if (import.meta.env.DEV) {
      (window as unknown as { __seatsketch: unknown }).__seatsketch = {
        editor: useEditor,
        ui: useUi,
        interaction: useInteraction,
        plans: usePlans,
        keymap: useKeymap,
        i18n: useI18n,
      };
    }
  }, []);
}
