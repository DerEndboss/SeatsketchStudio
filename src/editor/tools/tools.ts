import {
  Armchair,
  BrickWall,
  Circle,
  DoorOpen,
  Hand,
  MousePointer2,
  PenLine,
  RulerDimensionLine,
  Square,
  SquareDashed,
  Type,
  AppWindow,
  Scan,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '../../state/uiStore';
import type { MsgKey } from '../../i18n';

export interface ToolDef {
  id: ToolId;
  label: MsgKey;
  hint: MsgKey;
  icon: LucideIcon;
}

export const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'select', label: 'tool.select', hint: 'tool.select.hint', icon: MousePointer2 },
    { id: 'hand', label: 'tool.hand', hint: 'tool.hand.hint', icon: Hand },
  ],
  [
    { id: 'room', label: 'tool.room', hint: 'tool.room.hint', icon: SquareDashed },
    { id: 'wall', label: 'tool.wall', hint: 'tool.wall.hint', icon: BrickWall },
    { id: 'door', label: 'tool.door', hint: 'tool.door.hint', icon: DoorOpen },
    { id: 'window', label: 'tool.window', hint: 'tool.window.hint', icon: AppWindow },
    { id: 'column', label: 'tool.column', hint: 'tool.column.hint', icon: Square },
    { id: 'zone', label: 'tool.zone', hint: 'tool.zone.hint', icon: Scan },
  ],
  [
    { id: 'table', label: 'tool.table', hint: 'tool.table.hint', icon: Circle },
    { id: 'freehand', label: 'tool.freehand', hint: 'tool.freehand.hint', icon: PenLine },
    { id: 'chair', label: 'tool.chair', hint: 'tool.chair.hint', icon: Armchair },
  ],
  [
    { id: 'measure', label: 'tool.measure', hint: 'tool.measure.hint', icon: RulerDimensionLine },
    { id: 'text', label: 'tool.text', hint: 'tool.text.hint', icon: Type },
  ],
];

export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flat();
export const toolById = (id: ToolId): ToolDef => ALL_TOOLS.find((t) => t.id === id) ?? ALL_TOOLS[0];
