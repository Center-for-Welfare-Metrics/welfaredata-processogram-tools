# RasterCache — Cache de tiers pré-rasterizados

## O que faz

A interface `RasterCache` armazena referências para dois canvas pré-rasterizados do SVG em resoluções diferentes. O renderer seleciona o tier mais adequado com base no nível de zoom.

```ts
export interface RasterCache {
  low: HTMLCanvasElement | null;
  mid: HTMLCanvasElement | null;
}
```

## Cada campo

### `low: HTMLCanvasElement | null`

Canvas com o SVG rasterizado a **1× multiplicador** (resolução original).

- **Quando é `null`**: antes de `buildRasterCache()` completar
- **Resolução**: `svgWidth × svgHeight` pixels (ex: 2000×1600 para SVG de 2000×1600)
- **Quando é usado**: zoom normal e afastado, quando `stretchFactor <= 1.5`
- **Sempre disponível**: é o baseline — nunca é `null` após o carregamento

### `mid: HTMLCanvasElement | null`

Canvas com o SVG rasterizado a **4× multiplicador** (alta resolução).

- **Quando é `null`**: antes de `buildRasterCache()` completar. Pode também ser efetivamente igual ao low se o SVG for muito grande e o clamp reduzir o multiplicador para 1
- **Resolução**: `svgWidth×4 × svgHeight×4` pixels (com clamp a `MAX_CANVAS_DIM`)
- **Quando é usado**: zoom próximo, quando `stretchFactor > 1.5`
- **Fallback**: se `mid` for `null` ou indisponível, o renderer usa `low`

## Quando cada um é usado

```ts
// renderer.ts — lógica de seleção
const currentPhysicalWidth = svgWidth * camera.scale;
const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
const source = stretchFactor > 1.5
  ? (rasterCache.mid ?? rasterCache.low!)
  : rasterCache.low!;
```

| stretchFactor | Tier usado | Qualidade visual           |
|---------------|------------|----------------------------|
| ≤ 1.0         | low        | 1:1 ou comprimido — nítido |
| 1.0 – 1.5     | low        | Ligeiro esticamento — ok   |
| > 1.5          | mid        | Alta resolução — nítido    |

## Relação com buildRasterCache

```ts
// rasterizer.ts
export async function buildRasterCache(config: RasterizerConfig): Promise<RasterCache> {
  const low = buildTier(1);
  const mid = buildTier(4);
  return { low, mid };
}
```

`buildRasterCache()` é o **produtor** — cria os canvas e os retorna como `RasterCache`. O `renderer.render()` é o **consumidor** — lê `low` e `mid` a cada frame.

## Relação com renderer

O renderer usa `RasterCache` de duas formas:

1. **Modo root**: desenha `low` ou `mid` baseado no stretchFactor
2. **Modo focado**: desenha `low` com dimming (background escurecido), depois sobrepõe o `DynamicTile` da região focada. Se o tile não está pronto, usa `low`/`mid` como fallback temporário

## Ciclo de vida

```
handleFile()
  └→ buildRasterCache(config) → rasterCache = { low, mid }
       │
       └→ renderLoop()
            └→ renderer.render(... rasterCache ...)
                 └→ drawImage(rasterCache.low ou rasterCache.mid)
```

No `cleanup()`, os canvas são explicitamente zerados para liberar memória:

```ts
if (rasterCache.low) {
  rasterCache.low.width = 0;
  rasterCache.low.height = 0;
  rasterCache.low = null;
}
```

Setar `width = 0` e `height = 0` libera o buffer de bitmap do canvas imediatamente, sem esperar pelo GC.

## Dependências

| Direção        | Módulo           | Relação                             |
|----------------|------------------|-------------------------------------|
| Definida em    | `types.ts`       | Interface exportada                 |
| Produzida por  | `rasterizer.ts`  | `buildRasterCache()`               |
| Consumida por  | `renderer.ts`    | `render()` seleciona low ou mid    |
| Consumida por  | `main.ts`        | Armazenada como variável global    |
