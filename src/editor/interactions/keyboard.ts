import { useEditor } from '../../state/editorStore';
import { useUi } from '../../state/uiStore';
import { useFile } from '../../state/fileStore';
import { activeController } from './controller';
import { commandForBinding, eventToBinding } from '../keymap';
import * as cmd from '../commands';
import { usePlans } from '../projects';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(type);
  }
  return false;
}

/** These commands also work from inside text fields and dialogs. */
const ALWAYS = new Set(['save', 'saveAs', 'open', 'fullscreen', 'settings']);

/** Global shortcuts based on the (editable) command registry. */
export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const ui = useUi.getState();
    if (e.key === 'Control' || e.key === 'Meta') {
      ui.setCtrlDown(true);
      return;
    }
    // Shortcut recording in the settings takes priority
    if ((e.target as HTMLElement | null)?.closest?.('[data-key-capture]')) return;

    const binding = eventToBinding(e);
    const command = binding ? commandForBinding(binding) : undefined;
    const typing = isTyping(e.target);
    const modal = !!useFile.getState().confirm || !!ui.dialog;

    if (command && ALWAYS.has(command)) {
      e.preventDefault();
      cmd.runCommand(command);
      return;
    }
    if (typing || modal) return;

    if (ui.preview) {
      if (e.key === 'Escape') ui.setPreview(false);
      else if (e.key === ' ') {
        e.preventDefault();
        ui.setSpaceDown(true);
      } else if (command === 'preview' || command === 'fullscreen') cmd.runCommand(command);
      return;
    }

    // Fixed keys
    if (e.key === ' ') {
      e.preventDefault();
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      ui.setSpaceDown(true);
      return;
    }
    if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (activeController?.cancel()) return;
      if (ui.contextMenu) return ui.setContextMenu(null);
      if (ui.welcome && usePlans.getState().activeId) return ui.setWelcome(false);
      if (useEditor.getState().selection.length) return cmd.clearSelection();
      if (ui.tool !== 'select') cmd.setTool('select');
      return;
    }
    if (e.key === 'Enter' && !command && activeController?.finishPolygon()) return;
    if (e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey && !e.altKey && useEditor.getState().selection.length && !ui.welcome) {
      e.preventDefault();
      const s = useEditor.getState().doc.settings;
      const step = (s.snap ? s.snapStep : 0.01) * (e.shiftKey ? 10 : 1);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      cmd.nudge(dx, dy);
      return;
    }

    if (command && cmd.runCommand(command)) e.preventDefault();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') useUi.getState().setSpaceDown(false);
    if (e.key === 'Control' || e.key === 'Meta') useUi.getState().setCtrlDown(false);
  };
  const onBlur = () => {
    useUi.getState().setSpaceDown(false);
    useUi.getState().setCtrlDown(false);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
