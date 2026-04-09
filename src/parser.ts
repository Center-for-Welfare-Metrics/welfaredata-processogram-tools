import type { Region, BBox } from './types';
import { auditRegions } from './audit';

export interface ParseResult {
  regions: Map<string, Region>;
  svgWidth: number;
  svgHeight: number;
  suspiciousIds: string[];
}

export function isNavigable(id: string): boolean {
  return /^.+(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i.test(id);
}

export function getLevelIndex(id: string): number {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  const alias = match?.[1]?.toLowerCase();
  return { ps: 0, lf: 1, ph: 2, ci: 3 }[alias ?? ''] ?? -1;
}

export function getAlias(id: string): string {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  return match?.[1]?.toLowerCase() ?? '';
}

export function parseSvg(svgText: string): ParseResult {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-99999px';
  container.style.width = '0';
  container.style.height = '0';
  container.style.overflow = 'hidden';
  container.innerHTML = svgText;
  document.body.appendChild(container);

  const svgRoot = container.querySelector('svg')!;
  let svgWidth = 0;
  let svgHeight = 0;

  const viewBox = svgRoot.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    svgWidth = parts[2];
    svgHeight = parts[3];
  } else {
    svgWidth = parseFloat(svgRoot.getAttribute('width') || '0');
    svgHeight = parseFloat(svgRoot.getAttribute('height') || '0');
  }

  // Normalizar para escala 1:1 apenas se viewBox existir
  // SVGs sem viewBox já estão em pixels absolutos — não normalizar
  const vbAttr = svgRoot.getAttribute('viewBox');
  if (vbAttr) {
    const vbParts = vbAttr.trim().split(/[\s,]+/).map(Number);
    if (vbParts.length === 4 &&
        !isNaN(vbParts[2]) && vbParts[2] > 0 &&
        !isNaN(vbParts[3]) && vbParts[3] > 0) {
      svgRoot.setAttribute('width',  String(vbParts[2]));
      svgRoot.setAttribute('height', String(vbParts[3]));
    }
  }

  const regions = new Map<string, Region>();
  const elements = svgRoot.querySelectorAll('[id]');

  for (const el of elements) {
    // Excluir o próprio root SVG
    if (el === svgRoot) continue;

    // Excluir elementos utilitários que nunca são navegáveis
    if (el.closest('defs, symbol, clipPath, mask')) continue;

    const id = el.id;
    if (!isNavigable(id)) continue;

    let globalBbox: BBox;
    try {
      const localBbox = (el as SVGGraphicsElement).getBBox();
      if (!localBbox ||
          localBbox.width < 0.1 ||
          localBbox.height < 0.1) continue;

      const svgEl = svgRoot as unknown as SVGSVGElement;

      // Tentativa 1: getCTM() — matriz local acumulada
      // Confiável com container normalizado (escala 1:1)
      const ctm = (el as SVGGraphicsElement).getCTM?.();

      if (ctm && svgEl.createSVGPoint) {
        const corners = [
          { x: localBbox.x,                    y: localBbox.y },
          { x: localBbox.x + localBbox.width,  y: localBbox.y },
          { x: localBbox.x,                    y: localBbox.y + localBbox.height },
          { x: localBbox.x + localBbox.width,  y: localBbox.y + localBbox.height },
        ].map(p => {
          const pt = svgEl.createSVGPoint();
          pt.x = p.x;
          pt.y = p.y;
          return pt.matrixTransform(ctm);
        });

        const minX = Math.min(...corners.map(c => c.x));
        const minY = Math.min(...corners.map(c => c.y));
        const maxX = Math.max(...corners.map(c => c.x));
        const maxY = Math.max(...corners.map(c => c.y));

        globalBbox = {
          x: minX, y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };

      } else {
        // Tentativa 2: getScreenCTM() relativo ao root
        // Fallback para quando getCTM() retorna null
        // Anula escala arbitrária do viewport preservando
        // apenas transforms internos do SVG
        const elScreen   = (el as SVGGraphicsElement).getScreenCTM?.();
        const rootScreen = (svgEl as unknown as SVGGraphicsElement)
                             .getScreenCTM?.();

        if (elScreen && rootScreen) {
          const relativeCTM = rootScreen.inverse().multiply(elScreen);
          const corners = [
            { x: localBbox.x,                    y: localBbox.y },
            { x: localBbox.x + localBbox.width,  y: localBbox.y },
            { x: localBbox.x,                    y: localBbox.y + localBbox.height },
            { x: localBbox.x + localBbox.width,  y: localBbox.y + localBbox.height },
          ].map(p => {
            const pt = svgEl.createSVGPoint();
            pt.x = p.x;
            pt.y = p.y;
            return pt.matrixTransform(relativeCTM);
          });

          const minX = Math.min(...corners.map(c => c.x));
          const minY = Math.min(...corners.map(c => c.y));
          const maxX = Math.max(...corners.map(c => c.x));
          const maxY = Math.max(...corners.map(c => c.y));

          globalBbox = {
            x: minX, y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };

        } else {
          // Tentativa 3: bbox local puro
          // Último recurso — correto para elementos sem transforms
          globalBbox = {
            x: localBbox.x,
            y: localBbox.y,
            width: localBbox.width,
            height: localBbox.height,
          };
        }
      }

      // Validar bbox final antes de inserir
      if (globalBbox.width < 0.1 || globalBbox.height < 0.1) continue;

    } catch (_) {
      // getBBox() ou operações de matriz falharam
      // Ignorar elemento silenciosamente
      continue;
    }

    let strokePadding = 15; // fallback seguro
    try {
      const computed = getComputedStyle(el as Element);
      const sw = parseFloat(computed.strokeWidth || '0');
      if (!isNaN(sw) && sw > 0) {
        strokePadding = Math.ceil(sw / 2) + 4; // metade + margem de segurança
      }
    } catch (_) {
      // manter fallback 15
    }

    let parentId: string | null = null;
    let parent = el.parentElement;
    while (parent && parent !== (svgRoot as Element)) {
      if (parent.id && isNavigable(parent.id)) {
        parentId = parent.id;
        break;
      }
      parent = parent.parentElement;
    }

    const alias = getAlias(id);
    const level = getLevelIndex(id);

    regions.set(id, { id, bbox: globalBbox, level, alias, parentId, strokePadding });
  }

  document.body.removeChild(container);
  const suspiciousIds = auditRegions(regions);
  return { regions, svgWidth, svgHeight, suspiciousIds };
}
