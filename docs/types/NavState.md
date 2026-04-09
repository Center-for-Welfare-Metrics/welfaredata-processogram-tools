# NavState — Estado de navegação hierárquica

## O que faz

A interface `NavState` captura o estado completo da navegação do usuário: em que nível está, qual região está focada, e o histórico de estados anteriores para permitir drill-up.

```ts
export interface NavState {
  level: number;
  focusedId: string | null;
  history: NavHistoryEntry[];
}
```

## Cada campo

### `level: number`

Nível hierárquico atual:

| Valor | Significado                       |
|-------|-----------------------------------|
| -1    | ROOT — visão geral, sem foco      |
| 0     | ps — Poultry Shed (aviário)       |
| 1     | lf — Laying Floor (piso)          |
| 2     | ph — Poultry House (galpão)       |
| 3     | ci — Cage/Individual (gaiola)     |

### `focusedId: string | null`

ID da região atualmente em foco. `null` quando no ROOT.

### `history: NavHistoryEntry[]`

Pilha (stack) de estados anteriores. Cada entrada salva o snapshot completo antes de um drill-down:

```ts
interface NavHistoryEntry {
  id: string | null;   // focusedId do momento
  level: number;       // Nível do momento
  camera: Camera;      // Posição/zoom da câmera do momento
}
```

## Como evoluem durante a navegação

### Estado em cada nível — Exemplo completo

**1. Início (ROOT)**
```ts
{ level: -1, focusedId: null, history: [] }
```
O hitmap busca regiões com `parentId === null` em todas as layers.

**2. Drill-down em `shed-north--ps`**
```ts
{
  level: 0,
  focusedId: "shed-north--ps",
  history: [
    { id: null, level: -1, camera: { scale: 0.5, translateX: 200, translateY: 50 } }
  ]
}
```
O hitmap busca regiões com `parentId === "shed-north--ps"` na layer 1.
O renderer mostra dimming + highlight do aviário.

**3. Drill-down em `floor-01_lf`**
```ts
{
  level: 1,
  focusedId: "floor-01_lf",
  history: [
    { id: null, level: -1, camera: { scale: 0.5, translateX: 200, translateY: 50 } },
    { id: "shed-north--ps", level: 0, camera: { scale: 1.2, translateX: -100, translateY: -80 } }
  ]
}
```
O hitmap busca regiões com `parentId === "floor-01_lf"` na layer 2.

**4. Drill-down em `house-A--ph`**
```ts
{
  level: 2,
  focusedId: "house-A--ph",
  history: [
    { id: null, level: -1, camera: {/*...*/} },
    { id: "shed-north--ps", level: 0, camera: {/*...*/} },
    { id: "floor-01_lf", level: 1, camera: {/*...*/} }
  ]
}
```
O hitmap busca regiões com `parentId === "house-A--ph"` na layer 3.

**5. Drill-up de volta para `floor-01_lf`**
```ts
{
  level: 1,
  focusedId: "floor-01_lf",
  history: [
    { id: null, level: -1, camera: {/*...*/} },
    { id: "shed-north--ps", level: 0, camera: {/*...*/} }
  ]
}
```
O último entry foi removido (pop). Câmera restaurada para o snapshot salvo.

**6. Reset**
```ts
{ level: -1, focusedId: null, history: [] }
```
Histórico inteiro limpo. Câmera recalculada para fit do SVG inteiro.

## Onde é usado

| Módulo          | Leitura / Escrita | Campos usados              |
|-----------------|-------------------|----------------------------|
| `navigation.ts` | Leitura + Escrita | `level`, `focusedId`, `history` |
| `hitmap.ts`     | Leitura           | `level`, `focusedId`       |
| `renderer.ts`   | Leitura           | `focusedId`                |
| `events.ts`     | Leitura           | `level`, `focusedId`       |
| `hud.ts`        | Leitura           | `level`, `focusedId`       |
| `main.ts`       | Leitura + Escrita | Todos (inicialização)      |

## Decisões arquiteturais

### Por que level -1 para ROOT?

O ROOT não é um nível da hierarquia do SVG — é a "ausência de foco". Usar -1 como sentinel torna as comparações no hitmap naturais: `if (nav.level === -1)` → modo root. Um enum seria mais explícito mas adicionaria verbosidade sem benefício prático.

### Por que mutable e não immutable/reducer?

O `NavState` é lido e escrito apenas em código síncrono (event handlers + render loop). Não há async interleaving que cause torn state. Mutação in-place é mais simples e performante que criar novos objetos a cada transição.

### Por que a câmera é salva como snapshot plain object?

```ts
camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
```

Se o código salvasse a referência (`camera: camera`), drill-up restauraria o estado **atual** (que já mudou), não o estado do momento do drill-down. O spread/snapshot garante isolamento.
