import type { NavState, Camera, RasterCache, DynamicTile, Region } from './types';
import { BG_COLOR, DIM_ALPHA } from './types';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement) {
    this.dpr = window.devicePixelRatio || 1;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  render(
    nav: NavState,
    camera: Camera,
    rasterCache: RasterCache,
    dynamicCache: Map<string, DynamicTile>,
    _regions: Map<string, Region>,
    svgWidth: number,
    svgHeight: number
  ): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const canvas = ctx.canvas;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!rasterCache.low) return;

    const setCamera = () => {
      ctx.setTransform(
        camera.scale * dpr, 0, 0, camera.scale * dpr,
        camera.translateX * dpr, camera.translateY * dpr
      );
    };

    if (nav.focusedId === null) {
      const currentPhysicalWidth = svgWidth * camera.scale;
      const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
      const source = stretchFactor > 1.5
        ? (rasterCache.mid ?? rasterCache.low!)
        : rasterCache.low!;
      setCamera();
      ctx.drawImage(source, 0, 0, svgWidth, svgHeight);
    } else {
      setCamera();
      ctx.globalAlpha = DIM_ALPHA;
      ctx.drawImage(rasterCache.low!, 0, 0, svgWidth, svgHeight);
      ctx.globalAlpha = 1.0;

      const dyn = dynamicCache.get(nav.focusedId);
      if (dyn) {
        setCamera();
        const pad = dyn.padding ?? 0;
        const viewBoxW = dyn.bbox.width  + pad * 2;
        const viewBoxH = dyn.bbox.height + pad * 2;
        ctx.drawImage(
          dyn.canvas,
          0, 0, dyn.canvas.width, dyn.canvas.height,
          dyn.bbox.x - pad,
          dyn.bbox.y - pad,
          viewBoxW,
          viewBoxH
        );
      } else {
        const currentPhysicalWidth = svgWidth * camera.scale;
        const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
        const fgSource = stretchFactor > 1.5
          ? (rasterCache.mid ?? rasterCache.low!)
          : rasterCache.low!;
        setCamera();
        ctx.drawImage(fgSource, 0, 0, svgWidth, svgHeight);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  getCurrentTier(camera: Camera): string {
    return camera.scale < 4 ? 'low' : 'mid';
  }
}
