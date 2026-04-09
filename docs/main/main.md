# main.ts — Orquestração central do sistema

## O que faz

O `main.ts` é o ponto de entrada da aplicação. Instancia todos os módulos, gerencia o estado global, conecta os callbacks de navegação e eventos, e executa o loop de renderização via `requestAnimationFrame`.

## Por que existe

Um módulo orquestrador central simplifica o fluxo de inicialização e garante que todos os módulos compartilhem as mesmas referências de estado. Sem ele, cada módulo precisaria buscar suas dependências independentemente, complicando o wiring.

## Ordem de inicialização

A inicialização acontece em duas fases:

### Fase 1 — Setup estático (ao carregar a página)

```ts
// State
let nav: NavState = { level: -1, focusedId: null, history: [] };
let camera = new Camera();
let target = new Camera();
let rasterCache: RasterCache = { low: null, mid: null };
const dynamicCache = new Map<string, DynamicTile>();
let regions = new Map<string, Region>();

// DOM
const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const uploadPhase = document.getElementById('upload-phase')!;
// ... etc
```

### Fase 2 — Setup dinâmico (quando o usuário carrega um SVG)

Executado dentro de `handleFile()` — ver [handleFile.md](handleFile.md).

## Módulos instanciados

| Módulo         | Instância    | Quando                     | Tipo          |
|----------------|-------------|----------------------------|---------------|
| `Camera`       | `camera`    | Estático                   | Classe        |
| `Camera`       | `target`    | Estático                   | Classe        |
| `Renderer`     | `renderer`  | Em `setupCanvas()`         | Classe        |
| `HitMap`       | `hitmap`    | Em `handleFile()`          | Classe        |
| `Hud`          | `hud`       | Em `handleFile()`          | Classe        |

## Como o rAF loop é iniciado

```ts
// Ao final de handleFile()
lastFrameTime = performance.now();
renderLoop(lastFrameTime);
```

O loop é registrado uma vez e roda indefinidamente:

```ts
function renderLoop(now: number): void {
  animFrameId = requestAnimationFrame(renderLoop);

  // 1. Track frame timing (para HUD FPS)
  const dt = now - lastFrameTime;
  lastFrameTime = now;
  hud.trackFrame(dt);

  // 2. Animação da câmera (se em progresso)
  if (isAnimating) {
    const moved = animateCamera(camera, target);
    if (moved) {
      needsRedraw = true;
    } else {
      isAnimating = false;
      needsRedraw = true; // último frame após snap
    }
  }

  // 3. Renderização condicional (skip se nada mudou)
  if (!needsRedraw) {
    hud.updateIfNeeded(nav, camera, ...);
    return;
  }
  needsRedraw = false;

  renderer.render(nav, camera, rasterCache, dynamicCache, regions, svgWidth, svgHeight);
  hud.updateIfNeeded(nav, camera, ...);
}
```

O loop:
- Roda a 60fps (via `requestAnimationFrame`)
- `needsRedraw` evita re-renderização quando nada mudou (ex: mouse parado, câmera parada)
- `isAnimating` controla se `animateCamera()` deve ser chamado

## Variáveis globais e por que existem

| Variável          | Tipo                            | Por que global                                    |
|-------------------|---------------------------------|---------------------------------------------------|
| `nav`             | `NavState`                      | Compartilhado entre events, hitmap, renderer, hud |
| `camera`          | `Camera`                        | Estado mutável lido por renderer e hitmap         |
| `target`          | `Camera`                        | Alvo da animação, setado por navigation           |
| `rasterCache`     | `RasterCache`                   | Produzido pelo rasterizer, consumido pelo renderer |
| `dynamicCache`    | `Map<string, DynamicTile>`      | Cache de tiles por região focada                  |
| `regions`         | `Map<string, Region>`           | Produzido pelo parser, consumido por todos        |
| `svgWidth/Height` | `number`                        | Dimensões do SVG, usadas por câmera e hitmap      |
| `svgText`         | `string`                        | Texto bruto para rebuilds (hitmap, dynamic tiles)  |
| `svgImage`        | `HTMLImageElement \| null`      | Imagem carregada para rasterização                |
| `needsRedraw`     | `boolean`                       | Flag de dirty rendering — evita frames redundantes |
| `isAnimating`     | `boolean`                       | Controla se animateCamera() é chamado             |
| `animFrameId`     | `number \| null`                | ID do rAF para cancelamento no cleanup            |
| `rasterizerConfig`| `RasterizerConfig \| null`      | Config para buildDynamicTile on-demand            |

Essas variáveis são "globais" dentro do módulo (module-scoped) — não são globais do `window`. Elas existem porque o main.ts é o hub que conecta todos os módulos, e cada módulo precisa ler ou escrever partes desse estado.

## Navigation callbacks

O main.ts define callbacks que fazem bridge entre events.ts e navigation.ts:

```ts
function onDrillDown(regionId: string): void {
  drillDown(regionId, nav, regions, camera, target,
    window.innerWidth, window.innerHeight, onTileNeeded);
  isAnimating = true;
  needsRedraw = true;
}

function onDrillUp(): void {
  drillUp(nav, target);
  isAnimating = true;
  needsRedraw = true;
}

function onReset(): void {
  resetView(nav, target, svgWidth, svgHeight,
    window.innerWidth, window.innerHeight);
  isAnimating = true;
  needsRedraw = true;
}
```

Cada callback:
1. Chama a função de navigation correspondente
2. Ativa `isAnimating` para que o loop chame `animateCamera()`
3. Seta `needsRedraw` para garantir renderização imediata

## Dependências

| Direção    | Módulo           | Relação                              |
|------------|------------------|--------------------------------------|
| Importa    | `parser.ts`      | `parseSvg()` no carregamento         |
| Importa    | `rasterizer.ts`  | `buildRasterCache()`, `buildDynamicTile()` |
| Importa    | `camera.ts`      | Classe `Camera`, `animateCamera()`, `fitToCanvas()` |
| Importa    | `hitmap.ts`      | Classe `HitMap`                      |
| Importa    | `navigation.ts`  | `drillDown()`, `drillUp()`, `resetView()` |
| Importa    | `renderer.ts`    | Classe `Renderer`                    |
| Importa    | `hud.ts`         | Classe `Hud`                         |
| Importa    | `events.ts`      | `setupEvents()`                      |
