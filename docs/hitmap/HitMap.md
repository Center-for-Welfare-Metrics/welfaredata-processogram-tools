# HitMap — Sistema de hit-testing por cores

## O que faz

A classe `HitMap` permite descobrir "em qual região do SVG o usuário clicou/passou o mouse?" sem usar APIs de DOM ou SVG. Ela rasteriza o SVG em canvas temporários onde cada região é pintada com uma **cor única**, extrai todos os pixels numa única passada e pré-computa um **Grid de IDs** (`Int32Array`) por layer. Para testar um hit, basta fazer um lookup direto no array — zero `getImageData` no hot path.

Os grids de IDs são **persistidos via IndexedDB** usando um hash SHA-1 do SVG como cache key. Em sessões subsequentes com o mesmo SVG, o pipeline de rasterização é completamente pulado — os layers são reconstituídos diretamente do cache local. Falhas do IndexedDB são sempre silenciosas — o motor continua funcionando sem cache.

## Por que existe

O SVG original pode ter milhares de elementos com geometrias complexas (curvas, sobreposições, transparências). Fazer hit-testing via `elementFromPoint()` ou cálculos geométricos seria lento e propenso a erros de borda. A abordagem por **color-picking em canvas invisível** é:

1. **O(1) por consulta** — lookup num `Int32Array` é uma operação constante, sem chamadas ao canvas
2. **Pixel-perfect** — captura a geometria exata renderizada, incluindo curvas e sobreposições
3. **Independente de DOM** — funciona após o SVG ter sido convertido para grid de IDs
4. **Zero-allocation no hot path** — nenhum `getImageData`, nenhum `Uint8ClampedArray` alocado por consulta

## Como funciona

### As 4 layers

O sistema hierárquico do SVG tem 4 níveis, definidos em `types.ts`:

```ts
export const LEVEL_NAMES = ['ps', 'lf', 'ph', 'ci'] as const;
// level 0 = ps (Poultry Shed)
// level 1 = lf (Laying Floor)
// level 2 = ph (Poultry House)
// level 3 = ci (Cage/Individual)
```

Cada nível tem sua **própria layer** (canvas independente). Isso permite que regiões de níveis diferentes se sobreponham sem conflitos de cor — um aviário (ps) pode conter galpões (lf) na mesma posição geométrica.

```ts
private layers: Map<number, HitLayer> = new Map();
```

### Estrutura de cada layer

```ts
interface HitLayer {
  pixels: Int32Array;              // Grid de IDs pré-computado (w × h)
  width: number;                   // Largura do grid
  height: number;                  // Altura do grid
  colorIndex: Map<number, string>; // Mapa: índice de cor → ID da região
}
```

Cada posição `pixels[y * width + x]` contém:
- O índice de cor da região (inteiro > 0) — decodificável via `colorIndex`
- `-1` se o pixel é transparente/vazio (sem região)

Os canvas e contextos 2D são **temporários** — existem apenas durante o `build()` para rasterização e extração de pixels. Após o `build()`, são destruídos para liberar VRAM.

### HIT_SCALE

```ts
const HIT_SCALE = 0.5;
```

Os canvas da hitmap operam a **metade da resolução** do SVG original. Um SVG de 2000×1600 gera hitmaps de 1000×800. Isso:
- Reduz uso de memória em 4x (por layer)
- Reduz tempo de rasterização
- A precisão de 2px (0.5 scale) é suficiente para hit-testing com o dedo ou mouse

### Relação com camera.inverseMatrix

Quando o usuário clica em `(canvasX, canvasY)`, a hitmap precisa converter para coordenadas SVG:

```ts
const m    = camera.inverseMatrix;
const svgX = m.a * canvasX + m.c * canvasY + m.e;
const svgY = m.b * canvasX + m.d * canvasY + m.f;
const hitX = Math.round(svgX * this.hitScale);
const hitY = Math.round(svgY * this.hitScale);
```

1. `camera.inverseMatrix` converte canvas → SVG
2. `* this.hitScale` converte SVG → hitmap (porque o canvas da hitmap é escalado)

## Propriedades

| Propriedade  | Tipo                       | Descrição                                |
|-------------|----------------------------|------------------------------------------|
| `layers`    | `Map<number, HitLayer>`   | 4 layers, uma por nível hierárquico       |
| `regionMap` | `Map<string, Region>`      | Referência ao mapa de regiões do parser  |
| `hitScale`  | `number`                   | Fator de escala (0.5)                    |
| `ready`     | `boolean`                  | Se o build completou com sucesso         |

## Métodos

| Método                  | Visibilidade | Descrição                                                    |
|-------------------------|--------------|--------------------------------------------------------------|
| `build()`               | público      | Orquestra hash → cache → rasterização → persistência         |
| `getRegionAt()`         | público      | Retorna o ID da região sob um ponto, ou `null`               |
| `hasRegionAt()`         | público      | Retorna `true` se há alguma região sob um ponto              |
| `fallbackToRasterize()` | privado      | Pipeline completo de rasterização SVG → idGrid               |
| `computeHash()`         | privado      | Calcula hash SHA-1 do SVG via `crypto.subtle`                |
| `loadFromCache()`       | privado      | Tenta reconstituir layers a partir do IndexedDB              |
| `saveToCache()`         | privado      | Serializa e persiste layers no IndexedDB                     |
| `indexToColor()`        | privado      | Converte índice numérico para cor RGB                        |
| `isReady`               | getter       | Se o build completou                                         |
| `layerSizes`            | getter       | Debug: dimensões de cada layer                               |

## Fluxo do build()

```
build(svgText, regions, svgWidth, svgHeight)
  │
  ├─ computeHash(svgText)           → hash SHA-1
  │
  ├─ loadFromCache(hash)            → tenta IndexedDB
  │   ├─ cache hit  → reconstitui layers → ready = true → return
  │   └─ cache miss → continua
  │
  ├─ fallbackToRasterize(...)       → pipeline completo
  │   ├─ 4 canvas temporários
  │   ├─ SVG modificado por layer (crispEdges, coloração única)
  │   ├─ Blob URL → Image → drawImage → getImageData
  │   ├─ Extração de idGrid (Int32Array)
  │   └─ Destruição dos canvas (VRAM)
  │
  ├─ saveToCache(hash)              → persiste no IndexedDB
  │
  └─ ready = true
```

## Dependências

| Direção    | Módulo          | Relação                                      |
|------------|-----------------|----------------------------------------------|
| Importa    | `types.ts`      | Interfaces `Region`, `Camera`                |
| Usado por  | `events.ts`     | `getRegionAt()` em click/hover               |
| Usado por  | `main.ts`       | `build()` no carregamento, `hasRegionAt()` para cursor |
| Depende de | `camera.ts`     | `camera.inverseMatrix` para conversão de coordenadas |

## Decisões arquiteturais

### Por que Grid de IDs pré-computado em vez de getImageData on-demand?

`getImageData()` no hot path do `mousemove` (60fps) tem dois custos:
1. **Transferência GPU→CPU** — mesmo com `willReadFrequently`, cada chamada força sincronização
2. **Alocação de `Uint8ClampedArray`** — 4 bytes por pixel, pressionando o GC

Com o Grid de IDs (`Int32Array`), o `build()` faz `getImageData` **uma única vez** por layer, decodifica todos os pixels e armazena o resultado. Consultas via `getRegionAt()`/`hasRegionAt()` são um simples `array[offset]` — zero syscalls, zero alocações.

### Por que canvas temporários?

Os canvas existem apenas durante o `build()` como buffers de rasterização. Após extrair os pixels para o `Int32Array`, o canvas é destruído (`canvas.width = 0`) para liberar VRAM. Isso elimina a retenção de 4 canvas off-screen em memória de GPU.

### Por que 4 layers separadas em vez de 1?

Regiões de níveis diferentes podem se sobrepor geometricamente (um aviário contém seus galpões). Se todas estivessem no mesmo grid, a cor do galpão sobrescreveria a do aviário e o nível raiz ficaria inacessível. Com layers separadas, cada nível tem seu próprio espaço de cores.

### Por que willReadFrequently no build?

```ts
canvas.getContext('2d', { willReadFrequently: true })
```

A flag `willReadFrequently` é usada durante o `build()` para otimizar o único `getImageData()` que extrai todos os pixels. Após a extração, o canvas é destruído.

### Por que HIT_SCALE = 0.5?

Resolução total (1:1) consumiria 4x mais memória no `Int32Array` sem benefício perceptível. Para regiões com dezenas de pixels de largura mínima, meia resolução ainda oferece precisão de 2px — imperceptível para o usuário.
