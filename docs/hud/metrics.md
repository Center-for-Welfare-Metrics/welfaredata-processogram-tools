# hud — Métricas

## O que faz

Este documento detalha as **7 métricas** apresentadas pelo HUD e a lógica de cálculo de cada uma, implementadas no método `updateIfNeeded()` da classe `Hud`.

## Frequência de actualização

O DOM é actualizado **a cada 8 frames**:

```ts
this.frameCount++;
if (this.frameCount % 8 !== 0) return;
```

A 60 FPS, isto significa ~7.5 actualizações por segundo — suficiente para leitura humana, sem custo de layout/repaint em cada frame.

> **Nota:** `trackFrame(dt)` é chamado em **todos** os frames para manter o buffer FPS preciso. Apenas as escritas no DOM são throttled.

---

## 1. FPS (Frames Per Second)

**Elemento:** `hud-fps`

### Cálculo

```ts
// Em trackFrame(dt), chamado em todos os frames:
this.fpsBuffer[this.fpsIndex % 30] = 1000 / dt;
this.fpsIndex++;

// Em updateIfNeeded(), a cada 8 frames:
let sum = 0;
const count = Math.min(this.fpsIndex, 30);
for (let i = 0; i < count; i++) {
  sum += this.fpsBuffer[i];
}
const avgFps = count > 0 ? sum / count : 0;
```

- **Buffer circular:** `Float64Array(30)` — armazena os últimos 30 FPS instantâneos
- **FPS instantâneo:** `1000 / dt` onde `dt` é o delta-time em ms entre frames
- **Média:** soma dos valores no buffer ÷ `min(fpsIndex, 30)`
- **Cold start:** Antes de 30 frames, a média usa apenas os frames disponíveis

### Código de cores

```ts
this.fpsEl.className = 'hud-val ' + (
  avgFps >= 55 ? 'fps-green' :
  avgFps >= 30 ? 'fps-yellow' :
                 'fps-red'
);
```

| FPS | Classe CSS | Significado |
|---|---|---|
| ≥ 55 | `fps-green` | Desempenho óptimo (perto de 60 FPS) |
| 30–54 | `fps-yellow` | Aceitável mas degradado |
| < 30 | `fps-red` | Desempenho crítico — possível stuttering visível |

### Exemplo

```
Últimos 30 frames: [60, 59, 61, 58, 60, ...]
Média: 59.4
Exibido: "59"
Classe: "hud-val fps-green"
```

---

## 2. Level (Nível de navegação)

**Elemento:** `hud-level`

```ts
const levelText = nav.level === -1
  ? 'root'
  : LEVEL_NAMES[nav.level] ?? `L${nav.level}`;
this.levelEl.textContent = levelText;
```

| `nav.level` | Texto exibido |
|---|---|
| -1 | `root` |
| 0 | `ps` (production site) |
| 1 | `lf` (laying farm) |
| 2 | `ph` (pen house) |
| 3 | `ci` (chicken) |
| outro | `L{n}` (fallback) |

Usa a constante `LEVEL_NAMES` importada de `types.ts`.

---

## 3. Focus (Região focada)

**Elemento:** `hud-focus`

```ts
this.focusEl.textContent = nav.focusedId ?? '--';
```

| Estado | Texto exibido |
|---|---|
| Região focada | `"lf_02"`, `"ph_03"`, etc. |
| Nenhuma região focada | `"--"` |

---

## 4. Scale (Escala da câmara)

**Elemento:** `hud-scale`

```ts
this.scaleEl.textContent = camera.scale.toFixed(2);
```

Mostra a escala actual com 2 casas decimais. Exemplos: `"1.00"`, `"2.45"`, `"0.50"`.

---

## 5. Regions (Contagem de regiões)

**Elemento:** `hud-regions`

```ts
this.regionsEl.textContent = String(navCount);
```

`navCount` é o número de regiões no nível de navegação actual, passado por `main.ts`. Indica quantas regiões são potencialmente clicáveis.

---

## 6. Loading (Tempo de carregamento)

**Elemento:** `hud-loading`

```ts
setLoadTime(ms: number): void {
  this.loadingEl.textContent = `${ms.toFixed(0)}ms`;
}
```

Chamado **uma única vez** após o carregamento do ficheiro SVG. Exemplo: `"142ms"`.

Este é o único valor que **não** é actualizado no loop — é definido por `setLoadTime()` separadamente.

---

## 7. Tier (Tier de rasterização)

**Elemento:** `hud-tier`

```ts
this.tierEl.textContent = nav.focusedId && dynamicCache.has(nav.focusedId)
  ? 'dynamic'
  : currentTier;
```

| Condição | Texto |
|---|---|
| Região focada com tile dinâmico no cache | `"dynamic"` |
| Sem tile dinâmico | Valor de `currentTier` (`"low"` ou `"mid"`) |

A lógica reflecte a prioridade de rendering: se existe um `DynamicTile` para a região focada, o renderer usa esse tile de alta resolução (`dynamic`). Caso contrário, usa o tier global (`low` = 1× resolução, `mid` = 4× resolução).

---

## Resumo das métricas

| # | Métrica | Elemento | Fonte | Frequência |
|---|---|---|---|---|
| 1 | FPS | `hud-fps` | Buffer circular 30 frames | Cada 8 frames |
| 2 | Level | `hud-level` | `nav.level` + `LEVEL_NAMES` | Cada 8 frames |
| 3 | Focus | `hud-focus` | `nav.focusedId` | Cada 8 frames |
| 4 | Scale | `hud-scale` | `camera.scale` | Cada 8 frames |
| 5 | Regions | `hud-regions` | `navCount` | Cada 8 frames |
| 6 | Loading | `hud-loading` | `setLoadTime(ms)` | Uma vez (one-shot) |
| 7 | Tier | `hud-tier` | `dynamicCache` + `currentTier` | Cada 8 frames |

## Dependências

| Módulo | Importação | Utilização |
|---|---|---|
| `types.ts` | `LEVEL_NAMES` | Conversão `nav.level` → nome legível |
| `types.ts` | `NavState` | Tipo de `nav` (level, focusedId) |
| `types.ts` | `Camera` | Tipo de `camera` (scale) |
| `types.ts` | `DynamicTile` | Tipo do valor do `dynamicCache` |

## Decisões arquitecturais

1. **Throttle por contagem de frames** — O uso de `frameCount % 8` em vez de timer (`setInterval`) garante sincronização com o loop de render e zero overhead quando o rendering está pausado (nenhum frame = nenhum update do HUD).

2. **FPS rolling average vs. instantâneo** — A média de 30 frames suaviza flutuações naturais (GC pauses, compositor delays) e dá um valor mais estável para avaliação de desempenho.

3. **Código de cores com limiares fixos** — 55 e 30 FPS foram escolhidos como limiares práticos: ≥55 é "quase 60", ≥30 é "jogável", <30 é "problemático". São aplicados via classes CSS, permitindo personalização visual sem alterar lógica.

4. **Sem formatação elaborada** — `toFixed(0)` para FPS/loading, `toFixed(2)` para scale. Sem unidades extras ou ícones — privilegia simplicidade e velocidade de rendering do DOM.
