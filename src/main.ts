import type { NavState, RasterCache, DynamicTile, Region } from './types';
import { parseSvg } from './parser';
import { buildRasterCache, buildDynamicTile } from './rasterizer';
import type { RasterizerConfig } from './rasterizer';
import { Camera, animateCamera, fitToCanvas } from './camera';
import { HitMap } from './hitmap';
import { drillDown, drillUp, resetView } from './navigation';
import { Renderer } from './renderer';
import { Hud } from './hud';
import { setupEvents } from './events';

// ── State ──
let nav: NavState = { level: -1, focusedId: null, history: [] };
let camera = new Camera();
let target = new Camera();
let rasterCache: RasterCache = { low: null, mid: null };
const dynamicCache = new Map<string, DynamicTile>();
let regions = new Map<string, Region>();
let svgWidth = 0;
let svgHeight = 0;
let svgText = '';
let svgImage: HTMLImageElement | null = null;
let needsRedraw = true;
let isAnimating = false;
let animFrameId: number | null = null;
let lastFrameTime = 0;
let rasterizerConfig: RasterizerConfig | null = null;

// ── DOM ──
const uploadPhase = document.getElementById('upload-phase')!;
const canvasPhase = document.getElementById('canvas-phase')!;
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const progressContainer = document.getElementById('progress-container')!;
const progressFill = document.getElementById('progress-bar-fill')!;
const progressLabel = document.getElementById('progress-label')!;
const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const switchBtn = document.getElementById('switch-btn')!;

let renderer: Renderer;
let hud: Hud;
let hitmap: HitMap;

// ── Progress helpers ──
function setProgress(pct: number, label: string): void {
  progressFill.style.width = pct + '%';
  progressLabel.textContent = label;
}

// ── File handling ──
async function handleFile(file: File): Promise<void> {
  const t0 = performance.now();
  progressContainer.style.display = 'flex';

  setProgress(10, 'Lendo arquivo...');
  svgText = await file.text();

  setProgress(25, 'Extraindo regioes...');
  await tick();
  const parsed = parseSvg(svgText);
  regions = parsed.regions;
  svgWidth = parsed.svgWidth;
  svgHeight = parsed.svgHeight;

  if (parsed.suspiciousIds.length > 0) {
    const list = parsed.suspiciousIds.join(', ');
    const msg = document.createElement('div');
    msg.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'left: 50%',
      'transform: translateX(-50%)',
      'background: #7c2d12',
      'color: #fef2f2',
      'font-family: monospace',
      'font-size: 13px',
      'padding: 12px 20px',
      'border-radius: 8px',
      'border: 1px solid #ef4444',
      'z-index: 9999',
      'max-width: 600px',
      'text-align: center',
      'line-height: 1.5',
    ].join(';');
    msg.textContent = 
      `⚠️ IDs suspeitos detectados: ${list}. ` +
      `Verifique estes elementos no SVG.`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 8000);
  }

  setProgress(40, 'Carregando imagem SVG...');
  await tick();
  svgImage = await loadSvgImage(svgText);

  setProgress(55, 'Rasterizando low tier...');
  await tick();
  rasterizerConfig = { svgText, svgImage, svgWidth, svgHeight, regions };
  rasterCache = await buildRasterCache(rasterizerConfig);

  setProgress(70, 'Construindo hit-map pixel-perfect...');
  await tick();
  hitmap = new HitMap();
  await hitmap.build(svgText, regions, svgWidth, svgHeight);

  // Debug: expor estado para diagnóstico no console
  (window as any).__dbg = {
    regions,
    nav,
    camera,
    target,
    hitmap,
    svgWidth,
    svgHeight,
  };

  setProgress(85, 'Inicializando canvas...');
  await tick();
  setupCanvas();

  hud = new Hud();

  const fit = fitToCanvas(svgWidth, svgHeight, window.innerWidth, window.innerHeight);
  camera.setTransform(
    fit.scale,
    fit.translateX,
    fit.translateY
  );
  target.setTransform(
    fit.scale,
    fit.translateX,
    fit.translateY
  );

  nav = { level: -1, focusedId: null, history: [] };

  setupEvents(
    mainCanvas, hitmap, nav, regions,
    camera, target, svgWidth, svgHeight,
    onDrillDown, onDrillUp, onReset, onNeedsRedrawCb
  );

  setProgress(100, 'Pronto!');
  const loadTime = performance.now() - t0;

  await tick();

  uploadPhase.style.display = 'none';
  canvasPhase.style.display = 'block';

  hud.setLoadTime(loadTime);
  needsRedraw = true;
  lastFrameTime = performance.now();
  renderLoop(lastFrameTime);
}

function setupCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  mainCanvas.width = w * dpr;
  mainCanvas.height = h * dpr;
  mainCanvas.style.width = w + 'px';
  mainCanvas.style.height = h + 'px';
  renderer = new Renderer(mainCanvas);
}

function loadSvgImage(text: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };
    img.src = url;
  });
}

function tick(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => r()));
}

// ── Navigation callbacks ──
function onDrillDown(regionId: string): void {
  drillDown(regionId, nav, regions, camera, target,
    window.innerWidth, window.innerHeight, onTileNeeded);
  isAnimating = true;
  needsRedraw = true;
}

function onDrillUp(): void {
  drillUp(nav, target);
  isAnimating = true;
  needsRedraw = true;
}

function onReset(): void {
  resetView(nav, target, svgWidth, svgHeight, window.innerWidth, window.innerHeight);
  isAnimating = true;
  needsRedraw = true;
}

function onNeedsRedrawCb(): void {
  needsRedraw = true;
}

function onTileNeeded(regionId: string): void {
  if (dynamicCache.has(regionId)) return;
  if (!rasterizerConfig) return;
  buildDynamicTile(regionId, rasterizerConfig, dynamicCache).then(tile => {
    if (tile) {
      needsRedraw = true;
    }
  });
}

// ── Render loop ──
function renderLoop(now: number): void {
  animFrameId = requestAnimationFrame(renderLoop);

  const dt = now - lastFrameTime;
  lastFrameTime = now;
  hud.trackFrame(dt);

  // DEBUG
  if (Math.abs(camera.translateY - ((window as any).__lastTY ?? 0)) > 5) {
    console.log('[camera drift detected]', {
      translateY: camera.translateY,
      translateX: camera.translateX,
      scale: camera.scale,
      targetY: target.translateY,
      targetX: target.translateX,
    });
    (window as any).__lastTY = camera.translateY;
  }
  // FIM DEBUG

  if (isAnimating) {
    const moved = animateCamera(camera, target);
    if (moved) {
      needsRedraw = true;
    } else {
      isAnimating = false;
      needsRedraw = true;
    }
  }

  if (!needsRedraw) {
    hud.updateIfNeeded(nav, camera, dynamicCache, renderer.getCurrentTier(camera), regions.size);
    return;
  }
  needsRedraw = false;

  renderer.render(nav, camera, rasterCache, dynamicCache, regions, svgWidth, svgHeight);
  hud.updateIfNeeded(nav, camera, dynamicCache, renderer.getCurrentTier(camera), regions.size);
}

// ── Cleanup ──
function cleanup(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (rasterCache.low) {
    rasterCache.low.width = 0;
    rasterCache.low.height = 0;
    rasterCache.low = null;
  }
  if (rasterCache.mid) {
    rasterCache.mid.width = 0;
    rasterCache.mid.height = 0;
    rasterCache.mid = null;
  }

  for (const [, tile] of dynamicCache) {
    tile.canvas.width = 0;
    tile.canvas.height = 0;
  }
  dynamicCache.clear();

  nav = { level: -1, focusedId: null, history: [] };
  camera = new Camera();
  target = new Camera();
  regions = new Map();
  svgWidth = 0;
  svgHeight = 0;
  svgText = '';
  svgImage = null;
  needsRedraw = true;
  isAnimating = false;
  rasterizerConfig = null;
}

// ── Drag & Drop ──
dropZone.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file && file.name.endsWith('.svg')) {
    handleFile(file);
  }
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) {
    handleFile(file);
  }
});

// ── Switch file ──
switchBtn.addEventListener('click', () => {
  cleanup();
  canvasPhase.style.display = 'none';
  uploadPhase.style.display = 'flex';
  progressContainer.style.display = 'none';
  progressFill.style.width = '0%';
});
