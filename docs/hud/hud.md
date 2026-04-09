# hud — Classe Hud

## O que faz

A classe `Hud` é o **heads-up display** de debug do projecto. Apresenta métricas de desempenho e estado de navegação directamente na interface, actualizando o DOM a cada 8 frames para minimizar overhead.

## Por que existe

Num renderer baseado em canvas com `requestAnimationFrame`, não há ferramentas nativas de inspeção de estado (ao contrário de DOM/React DevTools). O HUD fornece visibilidade contínua sobre FPS, nível de navegação, região focada, escala, contagem de regiões, tempo de carregamento e tier de rasterização — informações essenciais durante o desenvolvimento e debugging.

## API

### Constructor

```ts
constructor()
```

Captura referências aos 7 elementos DOM do HUD via `document.getElementById()`:

| Elemento | ID no HTML | Métrica |
|---|---|---|
| `fpsEl` | `hud-fps` | FPS médio (30 frames) |
| `levelEl` | `hud-level` | Nível de navegação actual |
| `focusEl` | `hud-focus` | ID da região focada |
| `scaleEl` | `hud-scale` | Escala da câmara |
| `regionsEl` | `hud-regions` | Contagem de regiões visíveis |
| `loadingEl` | `hud-loading` | Tempo de carregamento do SVG |
| `tierEl` | `hud-tier` | Tier de rasterização actual |

Inicializa um `Float64Array(30)` como buffer circular para cálculo de FPS.

### trackFrame(dt)

```ts
trackFrame(dt: number): void
```

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `dt` | `number` | Delta-time em milissegundos desde o último frame |

Regista o FPS instantâneo (`1000 / dt`) no buffer circular. Chamado em **todos os frames** pelo loop de renderização.

### setLoadTime(ms)

```ts
setLoadTime(ms: number): void
```

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `ms` | `number` | Tempo em milissegundos do carregamento SVG |

Actualiza o elemento `hud-loading` com o tempo de carregamento formatado (ex.: `"142ms"`). Chamado uma única vez após `handleFile()` completar.

### updateIfNeeded(nav, camera, dynamicCache, currentTier, navCount)

```ts
updateIfNeeded(
  nav: NavState,
  camera: Camera,
  dynamicCache: Map<string, DynamicTile>,
  currentTier: string,
  navCount: number
): void
```

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `nav` | `NavState` | Estado de navegação actual |
| `camera` | `Camera` | Câmara actual (para escala) |
| `dynamicCache` | `Map<string, DynamicTile>` | Cache de tiles dinâmicos |
| `currentTier` | `string` | Tier de rasterização (ex.: `"low"`, `"mid"`) |
| `navCount` | `number` | Contagem de regiões no nível actual |

**Retorno:** `void`

Actualiza o DOM **apenas a cada 8 frames** (`frameCount % 8 !== 0` → return cedo). Detalhes em [metrics.md](metrics.md).

## Exemplo de uso concreto

```ts
// Em main.ts — inicialização
const hud = new Hud();

// Após carregar o SVG
hud.setLoadTime(142);  // mostra "142ms" no HUD

// No loop de renderização (cada frame)
function loop(time: number) {
  const dt = time - lastTime;
  lastTime = time;

  hud.trackFrame(dt);   // regista FPS em todos os frames

  // ... rendering ...

  hud.updateIfNeeded(nav, camera, dynamicCache, currentTier, navCount);
  // ^ actualiza DOM apenas a cada 8 frames

  requestAnimationFrame(loop);
}
```

## Dependências

| Módulo | Importação | Utilização |
|---|---|---|
| `types.ts` | `NavState`, `Camera`, `DynamicTile` | Tipos dos parâmetros de `updateIfNeeded` |
| `types.ts` | `LEVEL_NAMES` | Array de nomes legíveis para os níveis de navegação |

### Dependências DOM

O HUD requer 7 elementos HTML com IDs específicos no `index.html`:

```html
<span id="hud-fps"></span>
<span id="hud-level"></span>
<span id="hud-focus"></span>
<span id="hud-scale"></span>
<span id="hud-regions"></span>
<span id="hud-loading"></span>
<span id="hud-tier"></span>
```

O uso de `!` (non-null assertion) no `getElementById` assume que estes elementos existem. Se algum faltar, o constructor lançará um erro de runtime.

## Decisões arquitecturais

1. **Classe vs. função** — `Hud` é a única classe no módulo (os outros módulos usam funções puras ou objectos simples). A escolha justifica-se pelo estado interno mutável (buffer FPS, contadores) e pela necessidade de manter referências a 7 elementos DOM.

2. **Buffer circular `Float64Array(30)`** — Usa typed array por performance (evita GC de array dinâmico) e limita memória a exactamente 30 slots × 8 bytes = 240 bytes. A média de 30 frames dá um FPS suavizado sem lag excessivo.

3. **Update throttled a cada 8 frames** — A 60 FPS, o DOM actualiza ~7.5× por segundo. Isto é suficiente para o olho humano ler os valores e evita o custo de layout/repaint em cada frame.

4. **Sem `removeEventListener` nem `destroy()`** — O HUD vive durante toda a sessão (single-page app), não necessitando cleanup.

5. **`setLoadTime` separado** — Não é chamado no loop de render (é evento one-shot), por isso tem método próprio em vez de ser incluído em `updateIfNeeded`.
