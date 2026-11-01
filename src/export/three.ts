import type { SeatDocument } from '../types/document';
import type { Material, MeshStandardMaterial, Object3D, WebGLRenderer } from 'three';
import type { Vec2 } from '../geometry/vec';
import { planBounds } from './svg';
import { getLookup } from '../state/lookup';
import { roomWallPieces } from '../geometry/walls';
import { tableOutline } from '../geometry/shapes';
import { worldPlacement } from '../geometry/objects';
import { canvasPng } from './branding';
import { tr } from '../i18n';

export interface ThreeOptions {
  width: number;
  height: number;
  angle: number;
  elevation: 'low' | 'mid' | 'high';
}

export async function renderThree(doc: SeatDocument, opts: ThreeOptions): Promise<Blob> {
  const THREE = await import('three');
  const canvas = document.createElement('canvas');
  let renderer: WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch {
    throw new Error(tr('export.no3d'));
  }
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(opts.width, opts.height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F7F3EC');
    scene.fog = new THREE.Fog('#F7F3EC', 55, 130);
    const bounds = planBounds(doc, { showDimensions: false, showGuestNames: false });
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minY + bounds.maxY) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 4);
    const materials: MeshStandardMaterial[] = [];
    const mat = (color: string, roughness = 0.82) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness });
      materials.push(m);
      return m;
    };
    const floorMat = mat('#EFE7DA');
    const roomMat = mat('#FCFAF5');
    const wallMat = mat('#DDD3C4');
    const darkMat = mat('#6E6254');
    const woodMat = mat('#AF9273');
    const chairMat = mat('#CBB59B');
    const assignedMat = mat('#8198B6');
    const glassMat = new THREE.MeshStandardMaterial({ color: '#A9C8D7', transparent: true, opacity: 0.48, roughness: 0.15 });
    materials.push(glassMat);
    const geometries: Array<{ dispose: () => void }> = [];
    const mesh = (geometry: import('three').BufferGeometry, material: Material, parent: Object3D = scene) => {
      geometries.push(geometry);
      const m = new THREE.Mesh<import('three').BufferGeometry, Material>(geometry, material);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const box = (w: number, h: number, d: number, material: Material, x: number, y: number, z: number, parent?: Object3D) => {
      const m = mesh(new THREE.BoxGeometry(w, h, d), material, parent);
      m.position.set(x, y, z);
      return m;
    };
    const shapeOf = (points: readonly Vec2[]) => {
      const shape = new THREE.Shape();
      points.forEach((p, i) => (i ? shape.lineTo(p.x, -p.y) : shape.moveTo(p.x, -p.y)));
      shape.closePath();
      return shape;
    };
    const extruded = (points: readonly Vec2[], height: number, material: Material, bottom = 0, parent: Object3D = scene) => {
      const geometry = new THREE.ExtrudeGeometry(shapeOf(points), { depth: height, bevelEnabled: false, curveSegments: 16 });
      geometry.rotateX(-Math.PI / 2);
      const m = mesh(geometry, material, parent);
      m.position.y = bottom;
      return m;
    };
    const pose = (group: Object3D, p: { x: number; y: number; rotation: number }) => {
      group.position.set(p.x, 0, p.y);
      group.rotation.y = (-p.rotation * Math.PI) / 180;
    };
    const base = box(span * 1.8, 0.12, span * 1.8, floorMat, cx, -0.09, cz);
    base.castShadow = false;
    const openings = doc.objects.filter((o) => o.type === 'door' || o.type === 'window').map((o) => ({ ...o, kind: o.type }));
    const lookup = getLookup(doc);
    for (const o of doc.objects) {
      if (o.type === 'room') {
        const floor = extruded(o.points, 0.025, roomMat);
        floor.position.x = o.x;
        floor.position.z = o.y;
        for (const piece of roomWallPieces(o, openings)) {
          if (piece.kind === 'door') continue;
          if (piece.kind === 'wall') extruded(piece.quad, 2.55, wallMat, 0.025);
          else {
            extruded(piece.quad, 0.8, wallMat, 0.025);
            extruded(piece.quad, 0.55, wallMat, 2.025);
            const a = piece.quad[0];
            const b = piece.quad[1];
            const window = box(piece.length, 1.2, 0.025, glassMat, (a.x + b.x) / 2, 1.425, (a.y + b.y) / 2);
            window.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
          }
        }
      } else if (o.type === 'wall') {
        const wall = box(o.length, 2.55, o.thickness, wallMat, o.x, 1.3, o.y);
        wall.rotation.y = (-o.rotation * Math.PI) / 180;
      } else if (o.type === 'table') {
        const group = new THREE.Group();
        scene.add(group);
        pose(group, o);
        const top = extruded(tableOutline(o), 0.075, o.tone === 'sand' ? woodMat : roomMat, 0.71, group);
        group.add(top);
        if (o.shape === 'round' || o.shape === 'oval') {
          const leg = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.7, 16), darkMat, group);
          leg.position.y = 0.36;
          const foot = mesh(new THREE.CylinderGeometry(Math.min(o.width, o.height) * 0.27, 0.3, 0.045, 32), darkMat, group);
          foot.position.y = 0.045;
        } else {
          for (const x of [-1, 1]) for (const z of [-1, 1]) box(0.065, 0.7, 0.065, darkMat, x * (o.width / 2 - 0.12), 0.36, z * (o.height / 2 - 0.12), group);
        }
      } else if (o.type === 'chair') {
        const group = new THREE.Group();
        scene.add(group);
        pose(group, worldPlacement(o, lookup));
        const { width: w, depth: d } = doc.settings.chair;
        const material = o.guestId ? assignedMat : chairMat;
        box(w, 0.065, d * 0.76, material, 0, 0.46, -d * 0.08, group);
        box(w * 0.94, Math.max(0.34, d * 0.85), 0.055, material, 0, 0.72, d * 0.4, group);
        for (const x of [-1, 1]) for (const z of [-1, 1]) box(0.035, 0.43, 0.035, darkMat, x * (w / 2 - 0.045), 0.23, z * (d / 2 - 0.05), group);
      } else if (o.type === 'column') {
        if (o.shape === 'round') {
          const column = mesh(new THREE.CylinderGeometry(o.width / 2, o.width / 2, 2.55, 32), wallMat);
          column.position.set(o.x, 1.3, o.y);
        } else {
          const column = box(o.width, 2.55, o.height, wallMat, o.x, 1.3, o.y);
          column.rotation.y = (-o.rotation * Math.PI) / 180;
        }
      } else if (o.type === 'zone') {
        const material = mat(o.kind === 'stage' ? '#C3AE90' : o.kind === 'blocked' ? '#E5D4CD' : '#DFD5BF');
        const zone = box(o.width, o.kind === 'stage' ? 0.22 : 0.018, o.height, material, o.x, o.kind === 'stage' ? 0.135 : 0.034, o.y);
        zone.rotation.y = (-o.rotation * Math.PI) / 180;
      }
    }
    scene.add(new THREE.HemisphereLight('#FFF9EE', '#B5AA9B', 2.2));
    const sun = new THREE.DirectionalLight('#FFF7E8', 3.3);
    sun.position.set(cx - span * 0.45, span * 1.1, cz + span * 0.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = span * 4;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.00015;
    sun.target.position.set(cx, 0, cz);
    scene.add(sun, sun.target);
    const aspect = opts.width / opts.height;
    const viewH = span * 1.15;
    const camera = new THREE.OrthographicCamera((-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, span * 12);
    const theta = (opts.angle * Math.PI) / 180;
    const elevation = opts.elevation === 'low' ? 0.55 : opts.elevation === 'mid' ? 0.95 : 1.65;
    camera.position.set(cx + Math.sin(theta) * span * 1.4, span * elevation, cz + Math.cos(theta) * span * 1.4);
    camera.lookAt(cx, 0.35, cz);
    renderer.render(scene, camera);
    const blob = await canvasPng(canvas);
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    return blob;
  } finally {
    renderer.dispose();
  }
}
