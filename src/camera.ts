import type { BBox } from './types';
import { LERP_FACTOR, SNAP_THRESHOLD } from './types';

export class Camera {
  private _scale: number = 1;
  private _tx: number = 0;
  private _ty: number = 0;
  private _inverseMatrix: DOMMatrix = new DOMMatrix();
  private _dirty: boolean = true;

  // Único ponto de entrada para mutações — atômico
  setTransform(scale: number, x: number, y: number): void {
    this._scale = scale;
    this._tx    = x;
    this._ty    = y;
    this._dirty = true;
  }

  // Getters de leitura — preservam compatibilidade
  // com código existente que lê esses valores
  get scale():      number { return this._scale; }
  get translateX(): number { return this._tx; }
  get translateY(): number { return this._ty; }

  // Matriz inversa cacheada — recalcula apenas quando dirty
  get inverseMatrix(): DOMMatrix {
    if (this._dirty) {
      this._inverseMatrix = new DOMMatrix([
        this._scale, 0,
        0,           this._scale,
        this._tx,    this._ty
      ]).inverse();
      this._dirty = false;
    }
    return this._inverseMatrix;
  }
}

export function bboxToCamera(bbox: BBox, canvasW: number, canvasH: number): Camera {
  // DEBUG
  console.log('[bboxToCamera] called', {
    bbox,
    canvasW,
    canvasH,
    stack: new Error().stack?.split('\n').slice(1, 4).join(' | ')
  });
  // FIM DEBUG

  const padding = 0.90;
  const scaleX = (canvasW * padding) / bbox.width;
  const scaleY = (canvasH * padding) / bbox.height;
  const scale = Math.min(scaleX, scaleY);

  const translateX = canvasW / 2 - (bbox.x + bbox.width / 2) * scale;
  const translateY = canvasH / 2 - (bbox.y + bbox.height / 2) * scale;

  // DEBUG
  console.log('[bboxToCamera] result', { scale, translateX, translateY });
  // FIM DEBUG

  return { scale, translateX, translateY };
}

export function animateCamera(camera: Camera, target: Camera): boolean {
  const ds = target.scale - camera.scale;
  const dx = target.translateX - camera.translateX;
  const dy = target.translateY - camera.translateY;

  if (Math.abs(ds) < SNAP_THRESHOLD / 1000 &&
      Math.abs(dx) < SNAP_THRESHOLD &&
      Math.abs(dy) < SNAP_THRESHOLD) {
    camera.setTransform(
      target.scale,
      target.translateX,
      target.translateY
    );
    return false;
  }

  // DEBUG
  if (Math.abs(target.translateY) > 200) {
    console.warn('[lerp] target.translateY anômalo:', {
      targetY: target.translateY,
      currentY: camera.translateY,
      stack: new Error().stack?.split('\n').slice(1, 3).join(' | ')
    });
  }
  // FIM DEBUG

  camera.setTransform(
    camera.scale      + ds * LERP_FACTOR,
    camera.translateX + dx * LERP_FACTOR,
    camera.translateY + dy * LERP_FACTOR
  );
  return true;
}

export function fitToCanvas(
  svgWidth: number, svgHeight: number,
  canvasW: number, canvasH: number
): Camera {
  return bboxToCamera({ x: 0, y: 0, width: svgWidth, height: svgHeight }, canvasW, canvasH);
}
