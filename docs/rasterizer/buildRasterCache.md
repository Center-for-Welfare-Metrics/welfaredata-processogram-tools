# buildRasterCache() — Pré-rasterização do SVG em dois tiers

## O que faz

Recebe a configuração do SVG (imagem, dimensões, regiões) e produz um `RasterCache` com dois canvas pré-rasterizados: **low** (1×) e **mid** (multiplicador adaptativo 4–8×). O renderer seleciona entre eles com base no nível de zoom.

```ts
export async function buildRasterCache(
  config: RasterizerConfig
): Promise<RasterCache> {
  const { svgImage, svgWidth, svgHeight, regions } = config;
  const maxDim = Math.max(svgWidth, svgHeight);

  const buildTier = (mult: number): HTMLCanvasElement => {
    // ... (ver buildTier.md)
  };

  // Adaptive mid tier multiplier (4–8×)
  const ciRegions = [...regions.values()].filter(r => r.level === 3);
  let midMult = 4;
  if (ciRegions.length > 0) {
    const smallestDim = Math.min(...ciRegions.map(r => Math.min(r.bbox.width, r.bbox.height)));
    const rawMult = (window.innerWidth / smallestDim) / svgWidth;
    midMult = Math.max(4, Math.min(8, rawMult));
  }

  const low = buildTier(1);
  const mid = buildTier(midMult);

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
| mid  | 4–8× (adaptativo) | 8000×6400 a 16000×12800   | Zoom próximo            |

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

| Campo | Descrição                                                                |
|-------|--------------------------------------------------------------------------|
| `low` | Canvas com SVG rasterizado a 1× (resolução original)                    |
| `mid` | Canvas com SVG rasterizado a 4–8× adaptativo (com MAX_CANVAS_DIM clamp) |

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

## Multiplicador adaptativo do mid tier

### O problema com o multiplicador fixo de 4×

Com um multiplicador fixo de 4×, SVGs pequenos ou SVGs com elementos `--ci` de dimensões reduzidas sofrem degradação de qualidade ao nível de zoom máximo de um elemento focado. O mid tier é produzido a uma resolução insuficiente para cobrir o intervalo entre o zoom da visão geral e o zoom de foco em um elemento pequeno.

### A lógica adaptativa

O multiplicador do mid tier é calculado a partir do menor elemento `--ci` (level 3) presente no SVG:

```ts
const ciRegions = [...regions.values()].filter(r => r.level === 3);
let midMult = 4; // fallback para SVGs sem nível --ci
if (ciRegions.length > 0) {
  const smallestDim = Math.min(
    ...ciRegions.map(r => Math.min(r.bbox.width, r.bbox.height))
  );
  const rawMult = (window.innerWidth / smallestDim) / svgWidth;
  midMult = Math.max(4, Math.min(8, rawMult));
}
```

**Sequência de cálculo:**

1. Filtrar todas as regiões no level 3 (`--ci`) — os elementos clicáveis mais profundos
2. Se não há regiões `--ci` (SVG com menos de 4 níveis), usar fallback de 4×
3. Encontrar o menor elemento: `Math.min(bbox.width, bbox.height)` em todas as regiões `--ci`
4. Calcular o multiplicador necessário para renderizar esse elemento na resolução do viewport: `(window.innerWidth / smallestDim) / svgWidth`
5. Aplicar os limites: mínimo 4× (nunca pior que o valor original), máximo 8× (previne consumo excessivo de memória)
6. O `MAX_CANVAS_DIM` clamp dentro de `buildTier()` atua como rede de segurança final

### Restrições aplicadas

| Restrição | Valor | Motivo |
|-----------|-------|--------|
| Limite inferior | 4× | Garante retrocompatibilidade — SVGs que já funcionam não são afetados |
| Limite superior | 8× | Previne consumo de memória excessivo (escala quadrática) |
| `MAX_CANVAS_DIM` | 8192px | Segurança GPU — aplicado dentro de `buildTier()` |

### Por que o limite superior é 8× e não mais?

Elementos que exigem mais de 8× de resolução para qualidade perfeita estão além da capacidade prática do tier estático. Para esses casos, o mecanismo de **ViewBox Shifting** (Fix 2b) atua como segunda camada de qualidade — ele rasteriza a região focada sob demanda em resolução máxima, independentemente do mid tier. Os dois mecanismos são complementares: o mid tier adaptativo cobre a maioria dos casos; o ViewBox Shifting cobre os casos extremos.

### Log de diagnóstico

Quando o caminho adaptativo é ativado, um log é emitido:

```
[rasterizer] adaptive mid tier: smallest ci bbox dim: 45.0 | raw mult: 6.84 | clamped mult: 6.84 | mid canvas: 4323 x 3456
```

**Exemplos esperados por SVG:**

| SVG | svgWidth | Menor ci dim | Raw mult | Clamped mult | Comportamento |
|-----|----------|-------------|----------|--------------|---------------|
| Hatchery | 1755 | ~grande | < 4 | 4 (limite inf.) | Idêntico ao anterior |
| Pig | 632 | ~pequeno | > 4 | 4–8 (adaptativo) | Melhora de qualidade |

Para qualquer SVG onde todos os elementos `--ci` são grandes o suficiente para que o multiplicador calculado fique abaixo de 4, o limite inferior entra em ação e o comportamento é idêntico à implementação anterior.

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
