import type { NavState, Camera, DynamicTile } from './types';
import { LEVEL_NAMES } from './types';

export class Hud {
  private fpsEl: HTMLElement;
  private levelEl: HTMLElement;
  private focusEl: HTMLElement;
  private scaleEl: HTMLElement;
  private regionsEl: HTMLElement;
  private loadingEl: HTMLElement;
  private tierEl: HTMLElement;

  private fpsBuffer: Float64Array;
  private fpsIndex: number = 0;
  private frameCount: number = 0;

  constructor() {
    this.fpsEl = document.getElementById('hud-fps')!;
    this.levelEl = document.getElementById('hud-level')!;
    this.focusEl = document.getElementById('hud-focus')!;
    this.scaleEl = document.getElementById('hud-scale')!;
    this.regionsEl = document.getElementById('hud-regions')!;
    this.loadingEl = document.getElementById('hud-loading')!;
    this.tierEl = document.getElementById('hud-tier')!;
    this.fpsBuffer = new Float64Array(30);
  }

  trackFrame(dt: number): void {
    if (dt > 0) {
      this.fpsBuffer[this.fpsIndex % 30] = 1000 / dt;
      this.fpsIndex++;
    }
  }

  setLoadTime(ms: number): void {
    this.loadingEl.textContent = `${ms.toFixed(0)}ms`;
  }

  updateIfNeeded(
    nav: NavState,
    camera: Camera,
    dynamicCache: Map<string, DynamicTile>,
    currentTier: string,
    navCount: number
  ): void {
    this.frameCount++;
    if (this.frameCount % 8 !== 0) return;

    let sum = 0;
    const count = Math.min(this.fpsIndex, 30);
    for (let i = 0; i < count; i++) {
      sum += this.fpsBuffer[i];
    }
    const avgFps = count > 0 ? sum / count : 0;

    const fpsText = avgFps.toFixed(0);
    this.fpsEl.textContent = fpsText;
    this.fpsEl.className = 'hud-val ' + (avgFps >= 55 ? 'fps-green' : avgFps >= 30 ? 'fps-yellow' : 'fps-red');

    const levelText = nav.level === -1 ? 'root' : LEVEL_NAMES[nav.level] ?? `L${nav.level}`;
    this.levelEl.textContent = levelText;
    this.focusEl.textContent = nav.focusedId ?? '--';
    this.scaleEl.textContent = camera.scale.toFixed(2);
    this.regionsEl.textContent = String(navCount);
    this.tierEl.textContent = nav.focusedId && dynamicCache.has(nav.focusedId) ? 'dynamic' : currentTier;
  }
}
