# events — setupEvents()

## O que faz

`setupEvents()` é a **única função exportada** do módulo `events.ts`. Ela registra todos os _event listeners_ do DOM que permitem ao utilizador interagir com o canvas: clique (drill-down / drill-up), movimento do rato (tooltip), teclas de atalho (ESC, R) e redimensionamento da janela.

## Por que existe

Separar o registo de eventos num módulo dedicado mantém `main.ts` focado na orquestração do loop de renderização e impede que lógica de input se misture com lógica de câmara ou navegação. Todos os _side-effects_ de input passam por callbacks injectados — o módulo nunca altera directamente o estado da aplicação.

## Assinatura

```ts
export function setupEvents(
  canvas:       HTMLCanvasElement,
  hitmap:       HitMap,
  nav:          NavState,
  regions:      Map<string, Region>,
  camera:       Camera,
  _target:      Camera,          // reservado, não utilizado actualmente
  _svgWidth:    number,          // reservado, não utilizado actualmente
  _svgHeight:   number,          // reservado, não utilizado actualmente
  onDrillDown:  (regionId: string) => void,
  onDrillUp:    () => void,
  onReset:      () => void,
  onNeedsRedraw:() => void
): void
```

### Parâmetros

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `canvas` | `HTMLCanvasElement` | Elemento canvas onde os listeners `click`, `mousemove`, `mouseleave` são registados |
| `hitmap` | `HitMap` | Instância do hit-map utilizada para traduzir pixel → região |
| `nav` | `NavState` | Estado de navegação (nível actual, ID focado) — lido mas nunca escrito |
| `regions` | `Map<string, Region>` | Mapa completo de regiões — usado para obter dados extras (alias) |
| `camera` | `Camera` | Câmara actual — passada ao hitmap para coordenadas |
| `_target` | `Camera` | *Reservado*. Presente na assinatura mas não utilizado |
| `_svgWidth` | `number` | *Reservado*. Presente na assinatura mas não utilizado |
| `_svgHeight` | `number` | *Reservado*. Presente na assinatura mas não utilizado |
| `onDrillDown` | `(regionId) => void` | Callback invocado quando o utilizador clica numa região válida (nível < 3) |
| `onDrillUp` | `() => void` | Callback invocado ao clicar no vazio ou ao premir ESC |
| `onReset` | `() => void` | Callback invocado ao premir R — restaura a vista raiz |
| `onNeedsRedraw` | `() => void` | Callback invocado após resize — sinaliza que o canvas precisa de re-render |

### Retorno

`void` — a função não devolve nenhum valor. Os listeners são registados como side-effects.

## Listeners registados

| Evento | Alvo | Ficheiro detalhe |
|---|---|---|
| `click` | `canvas` | [click.md](click.md) |
| `mousemove` | `canvas` | [mousemove.md](mousemove.md) |
| `mouseleave` | `canvas` | [mousemove.md](mousemove.md) |
| `keydown` | `document` | Secção abaixo |
| `resize` | `window` | [resize.md](resize.md) |

> **Nota:** Não existe handler de `wheel` (zoom por scroll). Todo o controlo de zoom/escala é feito internamente pela câmara e navegação. Ver [wheel.md](wheel.md) para detalhes.

## Keydown — ESC e R

O listener de `keydown` está registado em `document` (não no canvas), o que significa que funciona independentemente do foco:

```ts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    onDrillUp();           // volta um nível hierárquico
  } else if (e.key === 'r' || e.key === 'R') {
    onReset();             // restaura vista raiz
  }
});
```

- **ESC** → `onDrillUp()` — comportamento idêntico ao clique no vazio
- **R** → `onReset()` — salta directamente para o nível raiz, ignorando níveis intermédios

## Exemplo de uso

```ts
// em main.ts, após inicializar camera, hitmap, nav e regiões:
setupEvents(
  canvas, hitmap, nav, regions, camera, target,
  svgWidth, svgHeight,
  (regionId) => drillDown(regionId, nav, regions, camera, target, rasterCache),
  () => drillUp(nav, camera, target),
  () => resetView(nav, camera, target, svgWidth, svgHeight, canvas),
  () => { camera.dirty = true; }
);
```

## Dependências

| Módulo | Importação | Utilização |
|---|---|---|
| `types.ts` | `NavState`, `Region`, `Camera` | Tipos dos parâmetros |
| `hitmap.ts` | `HitMap` | `getRegionAt()`, `hasRegionAt()` para tradução pixel→região |
| `parser.ts` | `getAlias` | Conversão de regionId para alias legível (tooltip) |

## Decisões arquitecturais

1. **Callback injection** — `setupEvents` não importa `drillDown`, `drillUp` nem `resetView` directamente. Recebe-os como callbacks, o que desacopla o módulo do fluxo de navegação e facilita testes unitários.

2. **Parâmetros reservados** — `_target`, `_svgWidth`, `_svgHeight` estão presentes na assinatura com prefixo `_` (convenção TypeScript para "não utilizado"). Foram incluídos antecipando funcionalidades futuras (ex.: zoom por scroll, limites de pan) sem exigir alteração da interface.

3. **keydown em `document`** — registo global garante que os atalhos funcionam mesmo quando o canvas não tem foco (ex.: após interacção com o HUD ou o body).

4. **Sem remoção de listeners** — não há `removeEventListener`. A aplicação é single-page e os handlers vivem durante toda a sessão, tornando cleanup desnecessário.
