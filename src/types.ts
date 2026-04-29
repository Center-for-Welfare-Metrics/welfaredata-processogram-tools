export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Region {
  id: string;
  bbox: BBox;
  level: number;
  alias: string;
  parentId: string | null;
  strokePadding: number;
}

export interface NavState {
  level: number;
  focusedId: string | null;
  history: NavHistoryEntry[];
  skippedLevels: string[];
}

export interface NavHistoryEntry {
  id: string | null;
  level: number;
  camera: { scale: number; translateX: number; translateY: number };
}

export interface RasterCache {
  low: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
}

export interface DynamicTile {
  canvas: HTMLCanvasElement;
  bbox: BBox;
  scale: number;
  padding: number;
}

export const LEVEL_NAMES = ['ps', 'lf', 'ph', 'ci'] as const;
export const LERP_FACTOR = 0.08;
export const SNAP_THRESHOLD = 0.5;
export const MAX_CANVAS_DIM = 8192;
export const BG_COLOR = '#0a0a0a';
export const DIM_ALPHA = 0.15;

export interface BreadcrumbItem {
  id: string;
  label: string;
  level: number;
  isSkipped: boolean;
}
