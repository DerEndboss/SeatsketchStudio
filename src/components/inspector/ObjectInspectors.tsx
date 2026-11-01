import { AppWindow, BrickWall, DoorOpen, RulerDimensionLine, Scan, Square, SquareDashed, Type } from 'lucide-react';
import type { ColumnObject, DimensionObject, DoorObject, LabelObject, RoomObject, SceneObject, Unit, WallObject, WindowObject, ZoneKind, ZoneObject } from '../../types/document';
import { useEditor } from '../../state/editorStore';
import { useT } from '../../i18n';
import { boundsOf, perimeterOf, polygonArea } from '../../geometry/polygon';
import { formatArea, formatLength } from '../../geometry/measurements';
import { rotate } from '../../geometry/vec';
import { isRectRoom } from '../../editor/canvas/nodes';
import { AngleField, LengthField, Note, Pair, Row, Section, TextField } from '../ui/Fields';
import { Segmented } from '../ui/Controls';
import { ObjectActions, PanelTitle, PositionRow, Warnings, patchObject, useFocusKey } from './shared';

function RotationRow<T extends SceneObject>({ o }: { o: T }) {
  const t = useT();
  return (
    <Row label={t('insp.rotation')}>
      <AngleField value={o.rotation} disabled={o.locked} onChange={(rotation) => patchObject<T>(o.id, (q) => ({ ...q, rotation }), 'rot')} />
    </Row>
  );
}

export function RoomInspector({ room, unit }: { room: RoomObject; unit: Unit }) {
  const t = useT();
  const rect = isRectRoom(room.points);
  const b = boundsOf(room.points);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const resize = (nw: number, nh: number) =>
    patchObject<RoomObject>(room.id, (r) => {
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      return { ...r, points: r.points.map((p) => ({ x: cx + ((p.x - cx) * nw) / w, y: cy + ((p.y - cy) * nh) / h })) };
    }, 'size');
  return (
    <div data-testid="inspector-room">
      <PanelTitle icon={SquareDashed} title={room.name || t('name.room')} sub={`${formatArea(polygonArea(room.points))} · ${t('room.corners', { n: room.points.length })}`} />
      <Section>
        <Row label={t('insp.name')}>
          <TextField value={room.name} live aria-label={t('insp.name')} onCommit={(name) => patchObject<RoomObject>(room.id, (r) => ({ ...r, name }), 'name')} />
        </Row>
        {rect ? (
          <Row label={t('insp.size')}>
            <Pair>
              <LengthField prefix={t('insp.width').slice(0, 1)} value={w} unit={unit} min={0.5} max={500} disabled={room.locked} onChange={(v) => resize(v, h)} aria-label={t('welcome.roomWidth')} testId="room-width" />
              <LengthField prefix={t('insp.length').slice(0, 1)} value={h} unit={unit} min={0.5} max={500} disabled={room.locked} onChange={(v) => resize(w, v)} aria-label={t('welcome.roomLength')} testId="room-length" />
            </Pair>
          </Row>
        ) : (
          <Row label={t('room.perimeter')}>
            <span className="text-[12.5px] tabular-nums text-ink">{formatLength(perimeterOf(room.points), unit)}</span>
          </Row>
        )}
        <Row label={t('room.wallThickness')}>
          <LengthField value={room.wallThickness} unit={unit} min={0} max={2} step={0.01} disabled={room.locked} onChange={(v) => patchObject<RoomObject>(room.id, (r) => ({ ...r, wallThickness: v }), 'wall')} aria-label={t('room.wallThickness')} />
        </Row>
        <PositionRow o={room} unit={unit} />
        <Note>{t('room.hint')}</Note>
      </Section>
      <ObjectActions o={room} />
    </div>
  );
}

export function ZoneInspector({ zone, unit }: { zone: ZoneObject; unit: Unit }) {
  const t = useT();
  const focus = useFocusKey('zone-name');
  const hints = { area: 'zone.areaHint', stage: 'zone.stageHint', blocked: 'zone.blockedHint' } as const;
  return (
    <div data-testid="inspector-zone">
      <PanelTitle icon={Scan} title={zone.name || t('zone.title')} sub={formatArea(zone.width * zone.height)} />
      <Section>
        <Row label={t('insp.name')}>
          <TextField value={zone.name} live focusKey={focus} aria-label={t('insp.name')} data-testid="zone-name" onCommit={(name) => patchObject<ZoneObject>(zone.id, (z) => ({ ...z, name }), 'name')} />
        </Row>
        <Row label={t('insp.kind')} stack>
          <Segmented<ZoneKind>
            ariaLabel={t('insp.kind')}
            value={zone.kind}
            options={[
              { value: 'area', label: t('zone.area') },
              { value: 'stage', label: t('zone.stage') },
              { value: 'blocked', label: t('zone.blocked') },
            ]}
            onChange={(kind) => patchObject<ZoneObject>(zone.id, (z) => ({ ...z, kind }))}
          />
        </Row>
        <Note>{t(hints[zone.kind])}</Note>
        <Row label={t('insp.size')}>
          <Pair>
            <LengthField prefix={t('insp.width').slice(0, 1)} value={zone.width} unit={unit} min={0.5} max={500} disabled={zone.locked} onChange={(width) => patchObject<ZoneObject>(zone.id, (z) => ({ ...z, width }), 'w')} aria-label={t('insp.width')} testId="zone-width" />
            <LengthField prefix={t('insp.length').slice(0, 1)} value={zone.height} unit={unit} min={0.5} max={500} disabled={zone.locked} onChange={(height) => patchObject<ZoneObject>(zone.id, (z) => ({ ...z, height }), 'h')} aria-label={t('insp.length')} testId="zone-length" />
          </Pair>
        </Row>
        <RotationRow o={zone} />
        <PositionRow o={zone} unit={unit} />
      </Section>
      <ObjectActions o={zone} />
    </div>
  );
}

export function DoorInspector({ door, unit }: { door: DoorObject; unit: Unit }) {
  const t = useT();
  return (
    <div>
      <PanelTitle icon={DoorOpen} title={t('door.title')} sub={formatLength(door.width, unit)} />
      <Warnings id={door.id} />
      <Section>
        <Row label={t('insp.width')}>
          <LengthField value={door.width} unit={unit} min={0.4} max={6} disabled={door.locked} onChange={(width) => patchObject<DoorObject>(door.id, (d) => ({ ...d, width }), 'w')} aria-label={t('insp.width')} />
        </Row>
        <Row label={t('door.leaves')} stack>
          <Segmented
            ariaLabel={t('door.leaves')}
            size="sm"
            value={String(door.leaves) as '1' | '2'}
            options={[
              { value: '1', label: t('door.single') },
              { value: '2', label: t('door.double') },
            ]}
            onChange={(v) => patchObject<DoorObject>(door.id, (d) => ({ ...d, leaves: v === '2' ? 2 : 1 }))}
          />
        </Row>
        {door.leaves === 1 && (
          <Row label={t('door.hinge')} stack>
            <Segmented
              ariaLabel={t('door.hinge')}
              size="sm"
              value={door.hinge}
              options={[
                { value: 'left', label: t('door.left') },
                { value: 'right', label: t('door.right') },
              ]}
              onChange={(hinge) => patchObject<DoorObject>(door.id, (d) => ({ ...d, hinge }))}
            />
          </Row>
        )}
        <Row label={t('door.opens')} stack>
          <Segmented
            ariaLabel={t('door.opens')}
            size="sm"
            value={door.flip ? 'out' : 'in'}
            options={[
              { value: 'in', label: t('door.in') },
              { value: 'out', label: t('door.out') },
            ]}
            onChange={(v) => patchObject<DoorObject>(door.id, (d) => ({ ...d, flip: v === 'out' }))}
          />
        </Row>
        <RotationRow o={door} />
        <PositionRow o={door} unit={unit} />
      </Section>
      <ObjectActions o={door} />
    </div>
  );
}

export function WindowInspector({ win, unit }: { win: WindowObject; unit: Unit }) {
  const t = useT();
  return (
    <div>
      <PanelTitle icon={AppWindow} title={t('window.title')} sub={formatLength(win.width, unit)} />
      <Section>
        <Row label={t('insp.width')}>
          <LengthField value={win.width} unit={unit} min={0.3} max={20} disabled={win.locked} onChange={(width) => patchObject<WindowObject>(win.id, (w) => ({ ...w, width }), 'w')} aria-label={t('insp.width')} />
        </Row>
        <RotationRow o={win} />
        <PositionRow o={win} unit={unit} />
      </Section>
      <ObjectActions o={win} />
    </div>
  );
}

export function ColumnInspector({ col, unit }: { col: ColumnObject; unit: Unit }) {
  const t = useT();
  return (
    <div>
      <PanelTitle icon={Square} title={t('column.title')} sub={`${t(col.shape === 'round' ? 'column.round' : 'column.square')} · ${formatLength(col.width, unit)} × ${formatLength(col.height, unit)}`} />
      <Warnings id={col.id} />
      <Section>
        <Row label={t('insp.shape')}>
          <Segmented
            ariaLabel={t('insp.shape')}
            size="sm"
            value={col.shape}
            options={[
              { value: 'square', label: t('column.square') },
              { value: 'round', label: t('column.round') },
            ]}
            onChange={(shape) => patchObject<ColumnObject>(col.id, (c) => ({ ...c, shape }))}
          />
        </Row>
        <Row label={t('insp.size')}>
          <Pair>
            <LengthField prefix={t('insp.width').slice(0, 1)} value={col.width} unit={unit} min={0.05} max={50} onChange={(width) => patchObject<ColumnObject>(col.id, (c) => ({ ...c, width }), 'w')} aria-label={t('insp.width')} />
            <LengthField prefix={t('insp.depth').slice(0, 1)} value={col.height} unit={unit} min={0.05} max={50} onChange={(height) => patchObject<ColumnObject>(col.id, (c) => ({ ...c, height }), 'h')} aria-label={t('insp.depth')} />
          </Pair>
        </Row>
        <RotationRow o={col} />
        <PositionRow o={col} unit={unit} />
      </Section>
      <ObjectActions o={col} />
    </div>
  );
}

function setLength<T extends WallObject | DimensionObject>(o: T, length: number) {
  patchObject<T>(o.id, (q) => ({ ...q, length }), 'len');
}

export function WallInspector({ wall, unit }: { wall: WallObject; unit: Unit }) {
  const t = useT();
  return (
    <div>
      <PanelTitle icon={BrickWall} title={t('wall.title')} sub={formatLength(wall.length, unit)} />
      <Warnings id={wall.id} />
      <Section>
        <Row label={t('insp.length')}>
          <LengthField value={wall.length} unit={unit} min={0.05} max={500} onChange={(v) => setLength(wall, v)} aria-label={t('insp.length')} />
        </Row>
        <Row label={t('insp.thickness')}>
          <LengthField value={wall.thickness} unit={unit} min={0.02} max={2} step={0.01} onChange={(thickness) => patchObject<WallObject>(wall.id, (w) => ({ ...w, thickness }), 't')} aria-label={t('room.wallThickness')} />
        </Row>
        <RotationRow o={wall} />
        <PositionRow o={wall} unit={unit} />
      </Section>
      <ObjectActions o={wall} />
    </div>
  );
}

export function DimensionInspector({ dim, unit }: { dim: DimensionObject; unit: Unit }) {
  const t = useT();
  const half = rotate({ x: dim.length / 2, y: 0 }, dim.rotation);
  const a = `${formatLength(dim.x - half.x, unit)} | ${formatLength(dim.y - half.y, unit)}`;
  const b = `${formatLength(dim.x + half.x, unit)} | ${formatLength(dim.y + half.y, unit)}`;
  return (
    <div>
      <PanelTitle icon={RulerDimensionLine} title={t('dim.title')} sub={formatLength(dim.length, unit)} />
      <Section>
        <Row label={t('insp.length')}>
          <LengthField value={dim.length} unit={unit} min={0.01} max={1000} onChange={(v) => setLength(dim, v)} aria-label={t('insp.length')} />
        </Row>
        <RotationRow o={dim} />
        <Note>{t('dim.fromTo', { a, b })}</Note>
      </Section>
      <ObjectActions o={dim} />
    </div>
  );
}

export function LabelInspector({ label, unit }: { label: LabelObject; unit: Unit }) {
  const t = useT();
  const focus = useFocusKey('label-text');
  return (
    <div>
      <PanelTitle icon={Type} title={t('label.title')} sub={label.text.split('\n')[0] || '–'} />
      <Section>
        <Row label={t('insp.text')}>
          <TextField value={label.text} live focusKey={focus} aria-label={t('insp.text')} data-testid="label-text" onCommit={(text) => patchObject<LabelObject>(label.id, (l) => ({ ...l, text }), 'text')} />
        </Row>
        <Row label={t('insp.fontSize')}>
          <LengthField value={label.fontSize} unit={unit} min={0.05} max={5} step={0.01} onChange={(fontSize) => patchObject<LabelObject>(label.id, (l) => ({ ...l, fontSize }), 'fs')} aria-label={t('insp.fontSize')} />
        </Row>
        <RotationRow o={label} />
        <PositionRow o={label} unit={unit} />
      </Section>
      <ObjectActions o={label} />
    </div>
  );
}

export function useUnit(): Unit {
  return useEditor((s) => s.doc.settings.unit);
}
