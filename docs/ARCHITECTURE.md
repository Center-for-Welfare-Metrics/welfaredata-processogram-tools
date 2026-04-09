# ARCHITECTURE.md — Visão geral do WelfareData Canvas Navigator

## O que é

O WelfareData Canvas Navigator é um visualizador interativo de plantas de aviários em SVG. O usuário carrega um SVG com regiões hierarquicamente nomeadas (aviários → pisos → galpões → gaiolas) e pode navegar por drill-down/drill-up, com animações suaves e hit-testing pixel-perfect.

## Diagrama do fluxo de dados

```
SVG File (upload ou drag & drop)
  │
  ▼
parseSvg()                              [parser.ts]
  ├─ regions: Map<string, Region>       → mapa de regiões navegáveis
  ├─ svgWidth, svgHeight                → dimensões canônicas do SVG
  └─ suspiciousIds                      → audit de IDs (via auditRegions())
  │
  ▼
loadSvgImage()                          [main.ts]
  └─ svgImage: HTMLImageElement         → imagem para rasterização
  │
  ▼
buildRasterCache()                      [rasterizer.ts]
  ├─ low: HTMLCanvasElement (1×)        → tier de zoom normal
  └─ mid: HTMLCanvasElement (4×)        → tier de zoom próximo
  │
  ▼
hitmap.build()                          [hitmap.ts]
  ├─ computeHash(svgText) → SHA-1 cache key
  ├─ loadFromCache(hash)  → IndexedDB lookup
  │   └─ cache hit: reconstituir layers → skip rasterização
  ├─ fallbackToRasterize() → 4 HitLayers (Int32Array id grids)
  └─ saveToCache(hash)    → persistir no IndexedDB
  │
  ▼
setupCanvas() + setupEvents()           [main.ts, events.ts]
  └─ Canvas fullscreen + handlers
  │
  ▼
╔═══════════════════════════════════════════════════════════════╗
║                    rAF LOOP (60fps)                          ║
║                                                               ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  animateCamera(camera, target)        [camera.ts]    │    ║
║  │  └─ camera.setTransform() — lerp ou snap             │    ║
║  └──────────────────────────────────────────────────────┘    ║
║                         │                                     ║
║                         ▼                                     ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  renderer.render()                    [renderer.ts]  │    ║
║  │  ├─ modo root: drawImage(low ou mid)                 │    ║
║  │  └─ modo focado: dim + dynamicTile                   │    ║
║  └──────────────────────────────────────────────────────┘    ║
║                         │                                     ║
║                         ▼                                     ║
║  ┌──────────────────────────────────────────────────────┐    ║
║  │  hud.updateIfNeeded()                 [hud.ts]       │    ║
║  │  └─ FPS, level, focus, scale, tier                   │    ║
║  └──────────────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════════════╝
          │
          │  (eventos do usuário)
          ▼
  ┌─────────────────────────────────────────────────────────┐
  │  mousemove → hitmap.getRegionAt() → tooltip             │
  │  click     → hitmap.getRegionAt()                       │
  │             ├─ região encontrada → drillDown()          │
  │             └─ área vazia        → drillUp()            │
  │  ESC       → drillUp()                                  │
  │  R         → resetView()                                │
  │  resize    → redimensionar canvas + needsRedraw         │
  └─────────────────────────────────────────────────────────┘
```

## Módulos e suas responsabilidades

| Módulo           | Arquivo         | Responsabilidade                                    |
|------------------|-----------------|-----------------------------------------------------|
| **Parser**       | `parser.ts`     | Extrair regiões, dimensões e hierarquia do SVG      |
| **Audit**        | `audit.ts`      | Detectar IDs suspeitos (backgrounds, canvas)        |
| **Camera**       | `camera.ts`     | Estado de zoom/pan, Dirty Flag, interpolação        |
| **HitMap**       | `hitmap.ts`     | Hit-testing pixel-perfect via Grid de IDs + cache IndexedDB |
| **Renderer**     | `renderer.ts`   | Desenhar frames no canvas principal                 |
| **Rasterizer**   | `rasterizer.ts` | Pré-rasterizar SVG em tiers + tiles dinâmicos       |
| **Navigation**   | `navigation.ts` | Drill-down/up/reset com histórico                   |
| **Events**       | `events.ts`     | Handlers de mouse, teclado, resize                  |
| **HUD**          | `hud.ts`        | Overlay de debug (FPS, nível, scale, tier)          |
| **Types**        | `types.ts`      | Interfaces e constantes compartilhadas              |
| **Main**         | `main.ts`       | Orquestração, estado global, rAF loop               |

## Decisões arquiteturais principais

### 1. Por que Canvas 2D ao invés de DOM SVG?

**Problema**: SVGs de aviários podem ter milhares de elementos. Manipular o DOM SVG diretamente (pan/zoom via CSS transforms, hover via CSS :hover) é lento porque:
- Cada mudança de `transform` recalcula layout de todos os elementos
- Browsers re-renderizam o SVG inteiro a cada frame durante pan/zoom
- Hit-testing via `elementFromPoint()` percorre a árvore DOM

**Solução**: Rasterizar o SVG em bitmaps (canvas) e usar Canvas 2D para renderização:
- `drawImage()` de bitmap é O(1) — nenhuma interpretação de geometria
- Pan/zoom via `ctx.setTransform()` é instantâneo — apenas muda a matriz
- O overhead é mover pixels, não interpretar vetores

**Trade-off**: Perde-se a capacidade de estilizar elementos individuais via CSS. O sistema compensa com DynamicTiles (rasterização sob demanda da região focada).

### 2. Por que hit-testing por cor com Grid de IDs pré-computado?

**Problema com bbox**: Bounding boxes são retangulares. Regiões de SVGs de aviários frequentemente têm formas irregulares (paredes em L, corredores, áreas recortadas). Hit-testing por bbox retornaria positivo em áreas vazias dentro do retângulo envolvente.

**Solução por cor + idGrid**: Cada região é pintada com uma cor única em um canvas temporário. Durante o `build()`, todos os pixels são extraídos numa única passada e decodificados para um `Int32Array` (Grid de IDs). Consultas em `getRegionAt()`/`hasRegionAt()` são um simples `array[offset]`:
- Pixel-perfect — respeita a geometria real do SVG
- O(1) por consulta — lookup direto no `Int32Array`, sem `getImageData`
- Zero-allocation — nenhum objeto criado no hot path do mousemove
- Sem float imprecision — índices são inteiros de 32 bits

**Trade-off**: Requer 4 `Int32Array` extras na memória (um por nível). Com `HIT_SCALE = 0.5`, o custo é moderado. Os canvas temporários são destruídos após extração, liberando VRAM.

### 3. Por que Dirty Flag na câmera?

**Problema**: A matriz inversa da câmera (usada no hit-testing) é computed a partir de `scale/tx/ty`. Sem cache, seria recalculada a cada `mousemove` (60+ vezes/segundo) mesmo que a câmera não tenha se movido.

**Solução**: `_dirty` flag setada por `setTransform()`, consultada pelo getter `inverseMatrix`:
- Se `_dirty === true`: recalcula e cachea
- Se `_dirty === false`: retorna cache

**Custo**: 1 boolean extra por instância de Camera. Economia: evita inversão de matriz em frames onde a câmera está parada.

### 4. Por que zero-allocation no hot path?

**Problema**: `getRegionAt()` e `hasRegionAt()` são chamados em `mousemove` (60fps). Se cada chamada alocasse objetos temporários (ex: `{ x, y }` para coordenadas) ou chamasse `getImageData()` (que aloca `Uint8ClampedArray`), o garbage collector seria pressionado, causando micro-stutters.

**Solução**: A conversão de coordenadas usa apenas multiplicações e somas com variáveis locais primitivas, e a consulta ao hitmap é um lookup direto num `Int32Array` pré-computado:

```ts
const m    = camera.inverseMatrix;     // referência, não cópia
const svgX = m.a * canvasX + m.c * canvasY + m.e;  // primitivo
const svgY = m.b * canvasX + m.d * canvasY + m.f;  // primitivo
const hitX = Math.round(svgX * this.hitScale);      // primitivo
const hitY = Math.round(svgY * this.hitScale);      // primitivo
const idx  = layer.pixels[hitY * layer.width + hitX]; // lookup direto
```

Nenhum objeto é criado, nenhum `getImageData` é chamado — zero pressão no GC.

### 5. Por que normalização incondicional do viewBox?

**Problema**: SVGs exportados de diferentes editores (Inkscape, Illustrator, Figma) usam convenções diferentes:
- Inkscape: `viewBox="0 0 210 297"` + `width="210mm"` (unidades em mm)
- Illustrator: `viewBox` pode estar ausente, com width/height em px
- Figma: `viewBox` e width/height em px, mas pode ter offset (viewBox não começa em 0,0)

**Solução**: O parser e a hitmap forçam:
```ts
svgRoot.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
svgRoot.setAttribute('width', String(svgWidth));
svgRoot.setAttribute('height', String(svgHeight));
```

Isso cria um **contrato**: "o sistema de coordenadas é sempre [0, 0, W, H] em unidades abstratas". Todos os módulos downstream (hitmap, rasterizer, renderer) podem assumir esse contrato.

**Trade-off**: Se o SVG tiver viewBox com offset (ex: `viewBox="100 200 800 600"`), a normalização usa os valores `800×600` do parser, preservando as dimensões corretas.

### 6. Por que stretchFactor ao invés de scale fixo?

**Problema**: Um threshold fixo (ex: "troca para mid quando `camera.scale > 4`") depende do tamanho do SVG:
- SVG de 500px: scale 4 = 2000px em tela — pouco zoom
- SVG de 4000px: scale 4 = 16000px em tela — zoom extremo

**Solução**: O `stretchFactor` é uma **razão** entre o tamanho em tela e o tamanho do tier:

$$
stretchFactor = \frac{svgWidth \times camera.scale}{rasterCache.low.width}
$$

Se o valor > 1.5, o tier low está sendo esticado — hora de trocar para mid. Essa fórmula é auto-adaptativa para qualquer tamanho de SVG.

### 7. Por que Audit Layer separado do parser?

**Problema**: O parser precisa extrair regiões. A detecção de IDs suspeitos é uma preocupação diferente — é validação, não parsing.

**Solução**: `audit.ts` é um módulo dedicado que recebe o `Map<string, Region>` e retorna uma lista de IDs suspeitos. O parser chama `auditRegions()` no final mas não depende do resultado para funcionar.

**Benefícios**:
- O audit pode evoluir independentemente (novos padrões, config, severity levels)
- Pode ser desabilitado sem tocar no parser
- Testável em isolamento

### 8. Por que persistência do idGrid via IndexedDB?

**Problema**: O pipeline de rasterização da hitmap (criar canvas, clonar SVG, colorir regiões, Blob→Image→drawImage→getImageData) pode levar centenas de milissegundos para SVGs grandes. Esse custo é pago a cada carregamento da página, mesmo que o SVG não tenha mudado.

**Solução**: O `build()` foi refatorado para um orquestrador com 4 etapas:
1. Computa hash SHA-1 do SVG via `crypto.subtle`
2. Tenta carregar layers do IndexedDB (`loadFromCache()`)
3. Em caso de cache miss, executa rasterização completa (`fallbackToRasterize()`)
4. Persiste layers no IndexedDB (`saveToCache()`)

O banco IndexedDB `welfaredata-hitmap` armazena os layers serializados (Int32Array → number[], Map → Array de tuplas) com o hash SHA-1 como keyPath.

**Trade-offs**:
- Custo de armazenamento: ~25-40 MB por SVG (4 layers de 800K pixels cada, serializados como number[])
- O IndexedDB suporta centenas de MB — aceitável para dezenas de SVGs
- Falhas do IndexedDB são silenciosas — o sistema funciona sem cache
- SHA-1 não é seguro criptograficamente, mas é perfeito para detecção de mudanças
- `crypto.subtle` requer contexto seguro (HTTPS ou localhost)

## Estrutura de documentação

```
docs/
├── ARCHITECTURE.md          ← este arquivo
├── camera/
│   ├── Camera.md
│   ├── setTransform.md
│   ├── inverseMatrix.md
│   ├── animateCamera.md
│   ├── bboxToCamera.md
│   └── fitToCanvas.md
├── hitmap/
│   ├── HitMap.md
│   ├── build.md
│   ├── fallbackToRasterize.md
│   ├── computeHash.md
│   ├── loadFromCache.md
│   ├── saveToCache.md
│   ├── getRegionAt.md
│   ├── hasRegionAt.md
│   └── indexToColor.md
├── renderer/
│   ├── Renderer.md
│   ├── render.md
│   └── stretchFactor.md
├── audit/
│   └── audit.md
├── parser/
│   ├── parseSvg.md
│   └── Region.md
├── navigation/
│   ├── navigation.md
│   ├── drillDown.md
│   ├── drillUp.md
│   └── resetView.md
├── rasterizer/
│   ├── buildRasterCache.md
│   └── buildTier.md
├── types/
│   ├── types.md
│   ├── NavState.md
│   └── RasterCache.md
└── main/
    ├── main.md
    ├── handleFile.md
    └── setupCanvas.md
```
