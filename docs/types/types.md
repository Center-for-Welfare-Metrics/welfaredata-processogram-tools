# types.ts — Interfaces e constantes do sistema

## O que faz

Define todas as interfaces TypeScript e constantes numéricas usadas pelo projeto. É o contrato tipado que todos os módulos compartilham.

## Por que existe

Centralizar tipos em um arquivo dedicado:
- Elimina dependências circulares (nenhum módulo de lógica importa outro módulo de lógica)
- Cria uma referência única para entender o modelo de dados
- Permite que qualquer módulo importe apenas o tipo necessário

## Interfaces

### BBox

```ts
export interface BBox {
  x: number;       // Coordenada X do canto superior-esquerdo
  y: number;       // Coordenada Y do canto superior-esquerdo
  width: number;   // Largura em unidades SVG
  height: number;  // Altura em unidades SVG
}
```

Retângulo delimitador de uma região no espaço de coordenadas do SVG. Usado por `bboxToCamera()`, `buildDynamicTile()` e informações do HUD.

### Region

```ts
export interface Region {
  id: string;                // ID original do elemento SVG
  bbox: BBox;                // Bounding box no espaço global
  level: number;             // Nível hierárquico (0-3)
  alias: string;             // Sufixo de tipo ("ps", "lf", "ph", "ci")
  parentId: string | null;   // ID do ancestral navegável mais próximo
  strokePadding: number;     // Margem extra para recorte de bitmap
}
```

Descrito em detalhe em [Region.md](../parser/Region.md).

### Camera

```ts
export interface Camera {
  scale: number;       // Fator de zoom (1.0 = tamanho original)
  translateX: number;  // Translação horizontal em pixels
  translateY: number;  // Translação vertical em pixels
}
```

Interface que tanto a classe `Camera` (estado mutável) quanto os plain objects retornados por `bboxToCamera()` (targets imutáveis) implementam.

### NavState

```ts
export interface NavState {
  level: number;                 // Nível atual (-1 = root)
  focusedId: string | null;      // ID da região em foco
  history: NavHistoryEntry[];    // Pilha de estados anteriores
}
```

Descrito em detalhe em [NavState.md](NavState.md).

### NavHistoryEntry

```ts
export interface NavHistoryEntry {
  id: string | null;   // focusedId do estado salvo
  level: number;       // Nível do estado salvo
  camera: Camera;      // Snapshot da câmera
}
```

Snapshot de um estado de navegação, salvo na pilha de `NavState.history` a cada drill-down.

### RasterCache

```ts
export interface RasterCache {
  low: HTMLCanvasElement | null;   // Tier 1× (resolução original)
  mid: HTMLCanvasElement | null;   // Tier 4× (alta resolução)
}
```

Descrito em detalhe em [RasterCache.md](RasterCache.md).

### DynamicTile

```ts
export interface DynamicTile {
  canvas: HTMLCanvasElement;  // Canvas com a região rasterizada
  bbox: BBox;                 // Posição no espaço SVG
  scale: number;              // Escala usada na rasterização
  padding: number;            // Margem extra em unidades SVG
}
```

Cache de renderização sob demanda para regiões focadas. Gerado por `buildDynamicTile()` e consumido pelo `renderer.render()`.

## Constantes

```ts
export const LEVEL_NAMES = ['ps', 'lf', 'ph', 'ci'] as const;
export const LERP_FACTOR = 0.08;
export const SNAP_THRESHOLD = 0.5;
export const MAX_CANVAS_DIM = 8192;
export const BG_COLOR = '#0a0a0a';
export const DIM_ALPHA = 0.15;
```

| Constante        | Valor    | Usado por         | Descrição                                        |
|------------------|----------|--------------------|--------------------------------------------------|
| `LEVEL_NAMES`    | `['ps','lf','ph','ci']` | `hud.ts`  | Nomes dos níveis para exibição no HUD           |
| `LERP_FACTOR`    | `0.08`   | `camera.ts`       | Fração da distância interpolada por frame        |
| `SNAP_THRESHOLD` | `0.5`    | `camera.ts`       | Limiar para snap final da animação (pixels)      |
| `MAX_CANVAS_DIM` | `8192`   | `rasterizer.ts`   | Limite seguro de dimensão de canvas              |
| `BG_COLOR`       | `#0a0a0a`| `renderer.ts`     | Cor de fundo do canvas (preto quase puro)        |
| `DIM_ALPHA`      | `0.15`   | `renderer.ts`     | Opacidade do fundo no modo dimming               |

## Dependências

| Direção       | Módulos                       | Relação                         |
|---------------|-------------------------------|---------------------------------|
| Importado por | Todos os módulos do projeto   | Tipos e constantes compartilhados |
| Não importa   | Nenhum módulo                 | Arquivo folha (sem dependências) |
