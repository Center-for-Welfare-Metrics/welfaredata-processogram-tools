import type { NavState, Region } from './types';
import type { Camera } from './camera';
import { HitMap } from './hitmap';
import { getAlias } from './parser';

export function setupEvents(
  canvas: HTMLCanvasElement,
  hitmap: HitMap,
  nav: NavState,
  regions: Map<string, Region>,
  camera: Camera,
  _target: Camera,
  _svgWidth: number,
  _svgHeight: number,
  onDrillDown: (regionId: string) => void,
  onDrillUp: () => void,
  onReset: () => void,
  onNeedsRedraw: () => void
): void {
  const tooltip = document.getElementById('tooltip')!;

  canvas.addEventListener('click', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const regionId = hitmap.getRegionAt(canvasX, canvasY, camera, nav);
    console.log('[click] canvasX:', canvasX.toFixed(0), 'canvasY:', canvasY.toFixed(0),
      '| regionId:', regionId,
      '| nav.level:', nav.level,
      '| nav.focusedId:', nav.focusedId,
      '| hasAny:', hitmap.hasRegionAt(canvasX, canvasY, camera, nav));
    if (regionId && nav.level < 3) {
      onDrillDown(regionId);
    } else if (!regionId) {
      const hasAny = hitmap.hasRegionAt(canvasX, canvasY, camera, nav);
      if (!hasAny) {
        onDrillUp();
      }
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onDrillUp();
    } else if (e.key === 'r' || e.key === 'R') {
      onReset();
    }
  });

  window.addEventListener('resize', () => {
    // DEBUG
    console.log('[resize event]', {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      canvasWBefore: canvas.width,
      canvasHBefore: canvas.height,
    });
    // FIM DEBUG

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    onNeedsRedraw();
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const regionId = hitmap.getRegionAt(canvasX, canvasY, camera, nav);
    if (regionId) {
      const region = regions.get(regionId);
      const alias = region ? getAlias(regionId) : '';
      tooltip.textContent = `${regionId} [${alias}]`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top = (e.clientY + 14) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}
