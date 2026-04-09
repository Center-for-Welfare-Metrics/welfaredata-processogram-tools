# buildRasterCache() — Pré-rasterização do SVG em dois tiers

## O que faz

Recebe a configuração do SVG (imagem, dimensões, regiões) e produz um `RasterCache` com dois canvas pré-rasterizados: **low** (1×) e **mid** (4×). O renderer seleciona entre eles com base no nível de zoom.

```ts
export async function buildRasterCache(
  config: RasterizerConfig
): Promise<RasterCache> {
  const { svgImage, svgWidth, svgHeight } = config;
  const maxDim = Math.max(svgWidth, svgHeight);

  const buildTier = (mult: number): HTMLCanvasElement => {
    // ... (ver buildTier.md)
  };

  const low = buildTier(1);
  const mid = buildTier(4);

  return { low, mid };
}
```

## Por que existe

Renderizar o SVG original a cada frame (60fps) via `drawImage(svgImage, ...)` é possível mas caro — o browser precisa re-rasterizar o SVG toda vez. Pré-rasterizar em canvas BMPs permite `drawImage()` com custo mínimo (cópia de bitmap).

## Como funciona

### Os dois tiers

| Tier | Multiplicador | Resolução para SVG 2000×1600 | Uso                     |
|------|---------------|-------------------------------|-------------------------|
| low  | 1×            | 2000×1600                     | Zoom normal e afastado  |
| mid  | 4×            | 8000×6400                     | Zoom próximo            |

O **low** é a imagem de trabalho — usada na maioria do tempo. O **mid** entra quando o `stretchFactor` no renderer ultrapassa 1.5 (ver [stretchFactor.md](../renderer/stretchFactor.md)).

### MAX_CANVAS_DIM e o safety clamp

```ts
const maxDim = Math.max(svgWidth, svgHeight);

const buildTier = (mult: number): HTMLCanvasElement => {
  let m = mult;
  if (maxDim * m > MAX_CANVAS_DIM) {
    m = Math.floor(MAX_CANVAS_DIM / maxDim);
  }
  if (m < 1) m = 1;
  // ...
};
```

`MAX_CANVAS_DIM = 8192` é o limite seguro de dimensão de canvas em browsers:

- **Chrome**: suporta até 16384×16384, mas performance degrada acima de 8192
- **Safari**: limite hard de 4096 em dispositivos iOS antigos, 16384 em desktop
- **Firefox**: suporta até 32768, mas usa memória proporcional

O safety clamp garante que nenhum tier exceda esse limite:

1. Se `maxDim * mult > 8192`, reduz o multiplicador: `m = floor(8192 / maxDim)`
2. Se o multiplicador resultante é < 1, garante mínimo de 1 (nunca reduz abaixo do original)

**Exemplo**: SVG de 3000×2400 com mult=4:
```
maxDim = 3000
3000 × 4 = 12000 > 8192
m = floor(8192 / 3000) = floor(2.73) = 2
Canvas: 6000×4800 ✓ (dentro do limite)
```

### Configuração

```ts
export interface RasterizerConfig {
  svgText: string;                // SVG bruto (usado no buildDynamicTile)
  svgImage: HTMLImageElement;     // Imagem SVG carregada
  svgWidth: number;               // Largura em unidades SVG
  svgHeight: number;              // Altura em unidades SVG
  regions: Map<string, Region>;   // Mapa de regiões (usado no buildDynamicTile)
}
```

## Parâmetros

| Parâmetro | Tipo               | Descrição                              |
|-----------|--------------------|----------------------------------------|
| `config`  | `RasterizerConfig` | Configuração completa do SVG           |

## Retorno

```ts
interface RasterCache {
  low: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
}
```

| Campo | Descrição                                              |
|-------|--------------------------------------------------------|
| `low` | Canvas com SVG rasterizado a 1× (resolução original)  |
| `mid` | Canvas com SVG rasterizado a 4× (ou clamp)            |

## Exemplos de uso

```ts
// main.ts — durante o carregamento
rasterizerConfig = { svgText, svgImage, svgWidth, svgHeight, regions };
rasterCache = await buildRasterCache(rasterizerConfig);
// Agora renderer.render() pode usar rasterCache.low e rasterCache.mid
```

## Relação com stretchFactor no renderer

O renderer compara a largura física (em tela) com a largura do tier low:

```ts
const stretchFactor = (svgWidth * camera.scale) / rasterCache.low!.width;
const source = stretchFactor > 1.5
  ? (rasterCache.mid ?? rasterCache.low!)
  : rasterCache.low!;
```

Se o low está sendo esticado mais que 1.5×, o mid assume para manter qualidade visual.

## Dependências

| Direção    | Módulo          | Relação                              |
|------------|-----------------|--------------------------------------|
| Importa    | `types.ts`      | `RasterCache`, `Region`, `MAX_CANVAS_DIM` |
| Chamado por | `main.ts`      | No `handleFile()` após loadSvgImage |
| Produz dados para | `renderer.ts` | `rasterCache.low` e `rasterCache.mid` |

## Decisões arquiteturais

### Por que dois tiers e não três?

Dois tiers cobrem os cenários comuns:
- **Zoom afastado/normal** → low (1×) é suficiente
- **Zoom próximo** → mid (4×) oferece detalhamento

Um terceiro tier (8× ou 16×) consumiria memória enorme (proporcional a mult²) com ganho marginal — para zoom extremo, o sistema usa `DynamicTile` que rasteriza sob demanda apenas a região focada.

A memória de um tier escala quadraticamente:
- Low 2000×1600 = 12.8 MB (RGBA)
- Mid 8000×6400 = 204.8 MB
- High 16000×12800 = 819.2 MB ← inviável

### Por que async mas sem await interno?

A função é marcada `async` por convenção da interface (o chamador pode precisar). Internamente, `buildTier()` é síncrono — o `drawImage()` de um `HTMLImageElement` já carregado é instantâneo. Não é necessário nenhum await.
