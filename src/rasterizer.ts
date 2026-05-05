import type { Region, RasterCache, DynamicTile, BBox } from './types';
import { MAX_CANVAS_DIM } from './types';

export interface RasterizerConfig {
  svgText: string;
  svgImage: HTMLImageElement;
  svgWidth: number;
  svgHeight: number;
  regions: Map<string, Region>;
}

export async function buildRasterCache(config: RasterizerConfig): Promise<RasterCache> {
  const { svgImage, svgWidth, svgHeight, regions } = config;
  const maxDim = Math.max(svgWidth, svgHeight);

  const buildTier = (mult: number): HTMLCanvasElement => {
    let m = mult;
    if (maxDim * m > MAX_CANVAS_DIM) {
      m = Math.floor(MAX_CANVAS_DIM / maxDim);
    }
    if (m < 1) m = 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svgWidth * m);
    canvas.height = Math.round(svgHeight * m);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.scale(m, m);
    ctx.drawImage(svgImage, 0, 0, svgWidth, svgHeight);
    return canvas;
  };

  // Adaptive mid tier multiplier based on smallest --ci element (level 3).
  // Falls back to fixed 4x for SVGs with fewer than 4 hierarchy levels.
  const ciRegions = [...regions.values()].filter(r => r.level === 3);
  let midMult = 4;
  if (ciRegions.length > 0) {
    const validCiRegions = ciRegions.filter(r => Math.min(r.bbox.width, r.bbox.height) >= 20);
    if (validCiRegions.length > 0) {
      const smallestDim = Math.min(...validCiRegions.map(r => Math.min(r.bbox.width, r.bbox.height)));
      const rawMult = window.innerWidth / smallestDim;
      midMult = Math.max(4, Math.min(8, rawMult));
      // Simulate MAX_CANVAS_DIM clamp for accurate dimension logging
      let logM = midMult;
      if (maxDim * logM > MAX_CANVAS_DIM) logM = Math.floor(MAX_CANVAS_DIM / maxDim);
      if (logM < 1) logM = 1;
      console.log(
        '[rasterizer] adaptive mid tier:',
        'ci regions:', ciRegions.length, '| valid (>=20):', validCiRegions.length,
        '| smallest ci bbox dim:', smallestDim.toFixed(1),
        '| raw mult:', rawMult.toFixed(2),
        '| clamped mult:', midMult,
        '| mid canvas:', Math.round(svgWidth * logM), 'x', Math.round(svgHeight * logM)
      );
    } else {
      console.log(
        '[rasterizer] adaptive mid tier:',
        'ci regions:', ciRegions.length, '| valid (>=20): 0 — all degenerate, fallback to 4x'
      );
    }
  }

  const low = buildTier(1);
  const mid = buildTier(midMult);

  return { low, mid };
}

function extractGroup(svgText: string, regionId: string): string | null {
  const escapedId = regionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Localizar a tag de abertura <g com o ID exato
  const openTagRegex = new RegExp(`<g\\b[^>]*\\bid="${escapedId}"[^>]*>`);
  const match = openTagRegex.exec(svgText);
  if (!match) return null;

  const startIndex = match.index;
  let i = match.index + match[0].length;
  let depth = 1;

  // Regex para tags <g reais — \b garante que é exatamente <g, não <glyph etc
  // Captura tanto <g ...> quanto <g> mas nunca </g> ou <glyph>
  const openTag  = /<g\b[^>]*>/g;
  const closeTag = /<\/g>/g;

  while (depth > 0 && i < svgText.length) {
    // Avançar as regex para a posição atual
    openTag.lastIndex  = i;
    closeTag.lastIndex = i;

    const nextOpen  = openTag.exec(svgText);
    const nextClose = closeTag.exec(svgText);

    if (!nextClose) break; // SVG malformado

    if (nextOpen && nextOpen.index < nextClose.index) {
      // Próxima tag encontrada é uma abertura — aumentar profundidade
      depth++;
      i = nextOpen.index + nextOpen[0].length;
    } else {
      // Próxima tag encontrada é um fechamento — diminuir profundidade
      depth--;
      i = nextClose.index + nextClose[0].length;
    }
  }

  if (depth !== 0) return null; // Grupo não fechado corretamente

  return svgText.substring(startIndex, i);
}

function extractDefs(svgText: string): string {
  const defsMatch = svgText.match(/<defs[\s\S]*?<\/defs>/);
  const styleMatch = svgText.match(/<style[\s\S]*?<\/style>/);
  return [defsMatch?.[0] ?? '', styleMatch?.[0] ?? ''].join('\n');
}

export async function buildDynamicTile(
  regionId: string,
  config: RasterizerConfig,
  cache: Map<string, DynamicTile>
): Promise<DynamicTile | null> {
  if (cache.has(regionId)) return cache.get(regionId)!;

  const region = config.regions.get(regionId);
  if (!region) return null;

  const bbox: BBox = region.bbox;
  const padding = region.strokePadding ?? 15;
  const groupContent = extractGroup(config.svgText, regionId);
  if (!groupContent) return null;

  const extractedDefs = extractDefs(config.svgText);

  const viewBoxX = bbox.x - padding;
  const viewBoxY = bbox.y - padding;
  const viewBoxW = bbox.width  + padding * 2;
  const viewBoxH = bbox.height + padding * 2;

  const minimalSvg = `<svg
    xmlns="http://www.w3.org/2000/svg"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    viewBox="${viewBoxX} ${viewBoxY} ${viewBoxW} ${viewBoxH}"
    width="${viewBoxW}"
    height="${viewBoxH}"
  >
    ${extractedDefs}
    ${groupContent}
  </svg>`;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const scaleToFit = Math.min(viewportWidth / bbox.width, viewportHeight / bbox.height);
  const rawTargetWidth = Math.ceil(bbox.width * scaleToFit * devicePixelRatio);
  const rawTargetHeight = Math.ceil(bbox.height * scaleToFit * devicePixelRatio);

  const maxTileCanvasDim = 4096;
  let targetWidth = rawTargetWidth;
  let targetHeight = rawTargetHeight;
  let clampApplied = false;

  if (rawTargetWidth > maxTileCanvasDim || rawTargetHeight > maxTileCanvasDim) {
    const clampScale = maxTileCanvasDim / Math.max(rawTargetWidth, rawTargetHeight);
    targetWidth = Math.floor(rawTargetWidth * clampScale);
    targetHeight = Math.floor(rawTargetHeight * clampScale);
    clampApplied = true;
  }

  console.log(
    '[rasterizer] dynamic tile:',
    'region:', regionId,
    '| bbox:', `${bbox.width.toFixed(1)} x ${bbox.height.toFixed(1)}`,
    '| scale:', scaleToFit.toFixed(2),
    '| dpr:', devicePixelRatio.toFixed(2),
    '| raw target:', rawTargetWidth, 'x', rawTargetHeight,
    '| final target:', targetWidth, 'x', targetHeight,
    '| clamp:', clampApplied ? 'yes' : 'no'
  );

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d')!;

  const blob = new Blob([minimalSvg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  URL.revokeObjectURL(url);

  const tile: DynamicTile = { canvas, bbox, scale: scaleToFit, padding };
  cache.set(regionId, tile);
  return tile;
}
