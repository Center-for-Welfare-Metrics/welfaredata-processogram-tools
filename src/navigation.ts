import type { NavState, Region, Camera } from './types';
import { bboxToCamera } from './camera';

export function drillDown(
  regionId: string,
  nav: NavState,
  regions: Map<string, Region>,
  camera: Camera,
  target: Camera,
  canvasW: number,
  canvasH: number,
  onTileNeeded: (id: string) => void
): void {
  const path: string[] = [];
  let current: Region | undefined = regions.get(regionId);
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? regions.get(current.parentId) : undefined;
  }

  let nextStepIndex = 0;
  if (nav.focusedId !== null) {
    const idx = path.indexOf(nav.focusedId);
    if (idx >= 0) {
      nextStepIndex = idx + 1;
    } else {
      nextStepIndex = 0;
    }
  }

  if (nextStepIndex >= path.length) return;

  const nextId = path[nextStepIndex];
  const nextRegion = regions.get(nextId);
  if (!nextRegion) return;

  // Garantir que bbox existe e é válido antes de zoom
  if (!nextRegion.bbox ||
      nextRegion.bbox.width < 0.1 ||
      nextRegion.bbox.height < 0.1) {
    console.warn('[drillDown] bbox inválido para:', nextId);
    return;
  }

  nav.history.push({
    id: nav.focusedId,
    level: nav.level,
    camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
  });

  nav.level = nextRegion.level;
  nav.focusedId = nextId;

  onTileNeeded(nextId);

  const newCam = bboxToCamera(nextRegion.bbox, canvasW, canvasH);
  target.setTransform(
    newCam.scale,
    newCam.translateX,
    newCam.translateY
  );
}

export function drillUp(nav: NavState, target: Camera): void {
  if (nav.history.length === 0) return;

  const prev = nav.history.pop()!;
  nav.level = prev.level;
  nav.focusedId = prev.id;
  target.setTransform(
    prev.camera.scale,
    prev.camera.translateX,
    prev.camera.translateY
  );
}

export function resetView(
  nav: NavState,
  target: Camera,
  svgWidth: number,
  svgHeight: number,
  canvasW: number,
  canvasH: number
): void {
  nav.history = [];
  nav.level = -1;
  nav.focusedId = null;

  const fit = bboxToCamera(
    { x: 0, y: 0, width: svgWidth, height: svgHeight },
    canvasW, canvasH
  );
  target.setTransform(
    fit.scale,
    fit.translateX,
    fit.translateY
  );
}
