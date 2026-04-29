import type { BreadcrumbItem, NavState, Region } from './types';
import { bboxToCamera } from './camera';
import type { Camera } from './camera';

function resolveSkipTarget(
  regionId: string,
  regions: Map<string, Region>
): { finalId: string; skipped: string[] } {
  let onlyChildId: string | null = null;

  for (const region of regions.values()) {
    if (region.parentId !== regionId) continue;

    if (onlyChildId !== null) {
      return { finalId: regionId, skipped: [] };
    }

    onlyChildId = region.id;
  }

  if (onlyChildId === null) {
    return { finalId: regionId, skipped: [] };
  }

  const resolved = resolveSkipTarget(onlyChildId, regions);
  return {
    finalId: resolved.finalId,
    skipped: [onlyChildId, ...resolved.skipped],
  };
}

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
  const { finalId, skipped } = resolveSkipTarget(regionId, regions);
  const nextRegion = regions.get(finalId);
  if (!nextRegion) return;

  // Garantir que bbox existe e é válido antes de zoom
  if (!nextRegion.bbox ||
      nextRegion.bbox.width < 0.1 ||
      nextRegion.bbox.height < 0.1) {
    console.warn('[drillDown] bbox inválido para:', finalId);
    return;
  }

  nav.history.push({
    id: nav.focusedId,
    level: nav.level,
    camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
  });

  nav.level = nextRegion.level;
  nav.focusedId = finalId;
  nav.skippedLevels = skipped;

  onTileNeeded(finalId);

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

export function buildBreadcrumb(
  focusedId: string | null,
  regions: Map<string, Region>,
  skippedLevels: string[]
): BreadcrumbItem[] {
  if (focusedId === null) return [];

  const items: BreadcrumbItem[] = [];
  let currentId: string | null = focusedId;

  while (currentId !== null) {
    const region = regions.get(currentId);
    if (!region) break;

    const label = currentId
      .replace(/(?:--|_)(?:ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    items.unshift({
      id: region.id,
      label,
      level: region.level,
      isSkipped: skippedLevels.includes(region.id),
    });

    currentId = region.parentId;
  }

  return items;
}
