import type { Region } from './types';
import type { Camera } from './camera';

const HIT_SCALE = 0.5;

interface HitLayer {
  pixels: Int32Array;
  width: number;
  height: number;
  colorIndex: Map<number, string>;
}

export class HitMap {
  // 4 layers: índice 0=ps, 1=lf, 2=ph, 3=ci
  private layers: Map<number, HitLayer> = new Map();
  private regionMap: Map<string, Region> = new Map();
  private hitScale: number = HIT_SCALE;
  private ready: boolean = false;

  async build(
    svgText: string,
    regions: Map<string, Region>,
    svgWidth: number,
    svgHeight: number
  ): Promise<void> {
    this.ready = false;
    this.layers.clear();
    this.regionMap = regions;

    // 1. Computar hash SHA-1 do SVG
    const hash = await this.computeHash(svgText);
    console.log('[hitmap] SVG hash:', hash);

    // 2. Tentar carregar do cache local
    const cacheHit = await this.loadFromCache(hash);
    if (cacheHit) {
      this.ready = true;
      console.log('[hitmap] loaded from IndexedDB cache');
      return;
    }

    // 3. Cache miss — rasterizar
    console.log('[hitmap] cache miss — rasterizing...');
    await this.fallbackToRasterize(
      svgText, regions, svgWidth, svgHeight
    );

    // 4. Persistir no IndexedDB para próximas sessões
    await this.saveToCache(hash);

    this.ready = true;
  }

  private async fallbackToRasterize(
    svgText: string,
    regions: Map<string, Region>,
    svgWidth: number,
    svgHeight: number
  ): Promise<void> {
    const w = Math.round(svgWidth  * this.hitScale);
    const h = Math.round(svgHeight * this.hitScale);

    // DEBUG — diagnóstico de viewBox vs dimensões
    const _debugParser = new DOMParser();
    const _debugDoc = _debugParser.parseFromString(svgText, 'image/svg+xml');
    const _debugRoot = _debugDoc.documentElement;
    console.log('[hitmap.build] svgWidth:', svgWidth, 'svgHeight:', svgHeight);
    console.log('[hitmap.build] viewBox attr:', _debugRoot.getAttribute('viewBox'));
    console.log('[hitmap.build] width attr:', _debugRoot.getAttribute('width'));
    console.log('[hitmap.build] height attr:', _debugRoot.getAttribute('height'));
    console.log('[hitmap.build] hitmap canvas size:', w, 'x', h);
    // FIM DEBUG

    // Criar 4 layers — uma por nível
    // canvas/ctx temporários — usados apenas durante o build
    const tmpCanvas = new Map<number, HTMLCanvasElement>();
    const tmpCtx    = new Map<number, CanvasRenderingContext2D>();
    for (let level = 0; level <= 3; level++) {
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      tmpCanvas.set(level, canvas);
      tmpCtx.set(level, ctx);
      // Após rasterização serão substituídos pelo idGrid em RAM
      this.layers.set(level, {
        pixels: new Int32Array(0), // placeholder — preenchido após drawImage
        width: w,
        height: h,
        colorIndex: new Map()
      });
    }

    // Para cada layer, construir SVG modificado com apenas
    // as regiões daquele nível pintadas com cores únicas
    for (let level = 0; level <= 3; level++) {
      const layer = this.layers.get(level)!;
      const regionsByLevel = [...regions.values()]
        .filter(r => r.level === level);

      if (regionsByLevel.length === 0) continue;

      // Modificar SVG via DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgRoot = doc.documentElement;

      // Normalização incondicional — força contrato de coordenadas
      // independente do padrão de exportação do Inkscape
      svgRoot.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
      svgRoot.setAttribute('width',   String(svgWidth));
      svgRoot.setAttribute('height',  String(svgHeight));

      // Remover <style> que pode interferir
      for (const style of Array.from(svgRoot.querySelectorAll('style'))) {
        style.remove();
      }

      const styleTag = document.createElementNS(
        'http://www.w3.org/2000/svg', 'style'
      );
      styleTag.textContent = [
        '* {',
        '  shape-rendering: crispEdges !important;',
        '  text-rendering: geometricPrecision !important;',
        '}'
      ].join('\n');
      svgRoot.prepend(styleTag);

      // Todos os elementos ficam pretos
      for (const el of Array.from(svgRoot.querySelectorAll('*'))) {
        el.setAttribute('fill', '#000000');
        el.setAttribute('stroke', 'none');
        el.removeAttribute('style');
      }

      // Pintar apenas regiões deste nível com cores únicas
      for (let i = 0; i < regionsByLevel.length; i++) {
        const region = regionsByLevel[i];
        const colorIdx = i + 1; // reservar 0 para "sem região"
        const color = this.indexToColor(colorIdx);
        layer.colorIndex.set(colorIdx, region.id);

        const groupEl = svgRoot.querySelector(
          `#${CSS.escape(region.id)}`
        );
        if (!groupEl) continue;

        groupEl.setAttribute('fill', color);
        for (const child of Array.from(groupEl.querySelectorAll('*'))) {
          child.setAttribute('fill', color);
        }
      }

      // Rasterizar SVG modificado nesta layer
      const serializer = new XMLSerializer();
      const modifiedSvg = serializer.serializeToString(svgRoot);
      const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);

      console.log(`[hitmap.build] layer ${level}:`,
        'regions painted:', regionsByLevel.length,
        'colorIndex size:', layer.colorIndex.size,
        'sample IDs:', [...layer.colorIndex.values()].slice(0, 3)
      );

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        const canvas = tmpCanvas.get(level)!;
        const ctx    = tmpCtx.get(level)!;
        img.onload = () => {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);

          // Extrair todos os pixels uma única vez
          const imageData = ctx.getImageData(0, 0, w, h);
          const raw = imageData.data; // Uint8ClampedArray — ordem RGBA garantida por spec

          // Pré-computar Grid de IDs — parsing feito aqui, nunca no mousemove
          const idGrid = new Int32Array(w * h);
          for (let i = 0; i < raw.length; i += 4) {
            const a = raw[i + 3];
            idGrid[i / 4] = a >= 128
              ? (raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]
              : -1; // -1 = transparente/vazio
          }

          // Guardar grid na layer
          layer.pixels = idGrid;

          // Destruir canvas invisível — libera VRAM
          // width e height já foram guardados na interface
          canvas.width = 0;

          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(`HitMap: falha ao rasterizar layer ${level}`));
        };
        img.src = url;
      });
    }

    console.log('[hitmap.build] COMPLETE — all layers ready');
    console.log('[hitmap.build] layer sizes:',
      [...this.layers.entries()].map(([lvl, l]) =>
        `level${lvl}:${l.colorIndex.size}`
      ).join(', ')
    );
  }

  private async computeHash(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async loadFromCache(
    hash: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('welfaredata-hitmap', 1);

        request.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('layers')) {
            db.createObjectStore('layers', { keyPath: 'hash' });
          }
        };

        request.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          const tx = db.transaction('layers', 'readonly');
          const store = tx.objectStore('layers');
          const get = store.get(hash);

          get.onsuccess = () => {
            if (!get.result) {
              db.close();
              resolve(false);
              return;
            }

            // Reconstituir layers do cache
            const cached = get.result.layers as Array<{
              level: number;
              pixels: number[];
              width: number;
              height: number;
              colorIndex: [number, string][];
            }>;

            this.layers.clear();
            for (const entry of cached) {
              this.layers.set(entry.level, {
                pixels:     new Int32Array(entry.pixels),
                width:      entry.width,
                height:     entry.height,
                colorIndex: new Map(entry.colorIndex),
              });
            }

            db.close();
            console.log('[hitmap] cache hit — hash:', hash);
            resolve(true);
          };

          get.onerror = () => {
            db.close();
            resolve(false);
          };
        };

        request.onerror = () => resolve(false);

      } catch {
        resolve(false);
      }
    });
  }

  private async saveToCache(hash: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('welfaredata-hitmap', 1);

        request.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains('layers')) {
            db.createObjectStore('layers', { keyPath: 'hash' });
          }
        };

        request.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          const tx = db.transaction('layers', 'readwrite');
          const store = tx.objectStore('layers');

          // Serializar layers para formato compatível com IndexedDB
          // Map → Array de entradas (Bulletproof cross-browser)
          // Int32Array → Array normal (Structured Clone seguro)
          const serialized = [...this.layers.entries()].map(
            ([level, layer]) => ({
              level,
              pixels:     Array.from(layer.pixels),
              width:      layer.width,
              height:     layer.height,
              colorIndex: [...layer.colorIndex.entries()],
            })
          );

          store.put({
            hash,
            layers:    serialized,
            timestamp: Date.now(),
          });

          tx.oncomplete = () => {
            db.close();
            console.log('[hitmap] cache saved — hash:', hash);
            resolve();
          };

          tx.onerror = () => {
            db.close();
            resolve(); // falha silenciosa — cache é opcional
          };
        };

        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  getRegionAt(
    canvasX: number,
    canvasY: number,
    camera: Camera,
    nav: { level: number; focusedId: string | null }
  ): string | null {
    if (!this.ready) return null;

    const m    = camera.inverseMatrix;
    const svgX = m.a * canvasX + m.c * canvasY + m.e;
    const svgY = m.b * canvasX + m.d * canvasY + m.f;
    const hitX = Math.round(svgX * this.hitScale);
    const hitY = Math.round(svgY * this.hitScale);

    if (nav.level === -1) {
      // ROOT: varrer todas as layers em ordem crescente
      // Retornar a região de menor nível com parentId === null
      // Isso suporta SVGs que começam em ps, lf, ph ou ci
      for (let lvl = 0; lvl <= 3; lvl++) {
        const layer = this.layers.get(lvl);
        if (!layer || layer.colorIndex.size === 0) continue;

        if (hitX < 0 || hitY < 0 ||
            hitX >= layer.width ||
            hitY >= layer.height) continue;

        const idx = layer.pixels[hitY * layer.width + hitX];
        if (idx === -1) continue;

        const regionId = layer.colorIndex.get(idx) ?? null;
        if (!regionId) continue;

        const region = this.regionMap.get(regionId);
        if (!region) continue;

        // Aceitar apenas regiões raiz (sem pai na hierarquia)
        if (region.parentId !== null) continue;

        return regionId;
      }
      return null;

    } else {
      // FOCADO: consultar layer do próximo nível
      const focusedRegion = nav.focusedId
        ? this.regionMap.get(nav.focusedId)
        : null;
      const targetLevel = focusedRegion
        ? focusedRegion.level + 1
        : nav.level + 1;

      if (targetLevel > 3) return null;

      const layer = this.layers.get(targetLevel);
      if (!layer) return null;

      if (hitX < 0 || hitY < 0 ||
          hitX >= layer.width ||
          hitY >= layer.height) return null;

      const idx = layer.pixels[hitY * layer.width + hitX];
      if (idx === -1) return null;

      const regionId = layer.colorIndex.get(idx) ?? null;

      if (!regionId) return null;

      const region = this.regionMap.get(regionId);
      if (!region) return null;

      // Aceitar apenas filhos diretos do elemento focado
      if (region.parentId !== nav.focusedId) return null;

      return regionId;
    }
  }

  hasRegionAt(
    canvasX: number,
    canvasY: number,
    camera: Camera,
    nav: { level: number; focusedId: string | null }
  ): boolean {
    if (!this.ready) return false;

    const m    = camera.inverseMatrix;
    const svgX = m.a * canvasX + m.c * canvasY + m.e;
    const svgY = m.b * canvasX + m.d * canvasY + m.f;
    const hitX = Math.round(svgX * this.hitScale);
    const hitY = Math.round(svgY * this.hitScale);

    if (nav.level === -1) {
      // Root: verificar todas as layers
      for (let lvl = 0; lvl <= 3; lvl++) {
        const layer = this.layers.get(lvl);
        if (!layer || layer.colorIndex.size === 0) continue;
        if (hitX < 0 || hitY < 0 ||
            hitX >= layer.width ||
            hitY >= layer.height) continue;
        const idx = layer.pixels[hitY * layer.width + hitX];
        if (idx !== -1) return true;
      }
      return false;
    } else {
      const focusedRegion = nav.focusedId
        ? this.regionMap.get(nav.focusedId)
        : null;
      const targetLevel = focusedRegion
        ? focusedRegion.level + 1
        : nav.level + 1;
      if (targetLevel > 3) return false;
      const layer = this.layers.get(targetLevel);
      if (!layer) return false;
      if (hitX < 0 || hitY < 0 ||
          hitX >= layer.width ||
          hitY >= layer.height) return false;
      const idx = layer.pixels[hitY * layer.width + hitX];
      return idx !== -1;
    }
  }

  private indexToColor(i: number): string {
    const r = (i >> 16) & 0xFF;
    const g = (i >> 8) & 0xFF;
    const b = i & 0xFF;
    return `rgb(${r},${g},${b})`;
  }

  get isReady(): boolean { return this.ready; }

  /** Debug: retorna dimensões dos canvas de cada layer */
  get layerSizes(): Record<number, { width: number; height: number; regions: number }> {
    const out: Record<number, { width: number; height: number; regions: number }> = {};
    for (const [lvl, layer] of this.layers) {
      out[lvl] = {
        width: layer.width,
        height: layer.height,
        regions: layer.colorIndex.size,
      };
    }
    return out;
  }
}
