import { useUi } from '../state/uiStore';
import { EditorCanvas } from '../editor/canvas/EditorCanvas';
import { TopBar } from '../components/TopBar';
import { ProjectTabs } from '../components/ProjectTabs';
import { ToolBar } from '../components/ToolBar';
import { ToolHint } from '../components/ToolHint';
import { StatusBar } from '../components/StatusBar';
import { Inspector } from '../components/inspector/Inspector';
import { CanvasContextMenu, GuestPopover, PreviewBar, Toasts } from '../components/CanvasOverlays';
import { DistributeDialog } from '../components/dialogs/DistributeDialog';
import { ExportDialog } from '../components/dialogs/ExportDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { WelcomeDialog } from '../components/dialogs/WelcomeDialog';
import { ConfirmDialog } from '../components/dialogs/MiscDialogs';
import { useT } from '../i18n';
import { useAutosave, useBoot, useFileDrop, useKeyboard, useThemeClass, useWarnings, useWindowTitle } from './hooks';

export function App() {
  useThemeClass();
  useBoot();
  useKeyboard();
  useFileDrop();
  useWarnings();
  useAutosave();
  useWindowTitle();
  const preview = useUi((s) => s.preview);
  const t = useT();

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      {!preview && <TopBar />}
      {!preview && <ProjectTabs />}
      <div className="flex min-h-0 flex-1">
        {!preview && <ToolBar />}
        <main className="relative min-w-0 flex-1 bg-canvas" aria-label={t('app.name')}>
          <EditorCanvas />
          {!preview && <ToolHint />}
        </main>
        {!preview && <Inspector />}
      </div>
      {!preview && <StatusBar />}
      <PreviewBar />
      <CanvasContextMenu />
      <GuestPopover />
      <Toasts />
      <DistributeDialog />
      <ExportDialog />
      <SettingsDialog />
      <WelcomeDialog />
      <ConfirmDialog />
    </div>
  );
}
