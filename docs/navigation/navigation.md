# Navigation — Modelo de navegação em profundidade

## O que faz

O módulo `navigation.ts` implementa a **navegação hierárquica** do sistema: drill-down (entrar numa região), drill-up (voltar ao nível anterior) e reset (voltar à visão geral). Controla o `NavState` e calcula as câmeras-alvo para animação.

## Por que existe

O SVG de aviários tem uma hierarquia de 4 níveis (aviário → piso → galpão → gaiola). O usuário precisa clicar para "entrar" num nível e poder voltar. O `navigation.ts` encapsula toda a lógica de transição entre níveis, mantendo um histórico para permitir retorno.

## O Depth Model — 4 níveis hierárquicos

```
Level -1: ROOT (visão geral — todos os aviários)
Level  0: ps  (Poultry Shed — aviário individual)
Level  1: lf  (Laying Floor — piso)
Level  2: ph  (Poultry House — galpão)
Level  3: ci  (Cage/Individual — gaiola)
```

A navegação segue o modelo de profundidade:
- **Drill-down** → avança 1 nível (ROOT → ps → lf → ph → ci)
- **Drill-up** → volta 1 nível (ci → ph → lf → ps → ROOT)
- **Reset** → volta direto para ROOT

### NavState

```ts
export interface NavState {
  level: number;              // Nível atual (-1 = root)
  focusedId: string | null;   // ID da região em foco (null = root)
  history: NavHistoryEntry[];  // Pilha de estados anteriores
}
```

| Campo       | ROOT           | Drill-down em "shed-01--ps" | Drill-down em "floor-01_lf" |
|-------------|----------------|----------------------------|-----------------------------|
| `level`     | -1             | 0                          | 1                           |
| `focusedId` | `null`         | `"shed-01--ps"`            | `"floor-01_lf"`             |
| `history`   | `[]`           | `[{root state}]`           | `[{root}, {shed state}]`    |

### Relação com camera/target

A navegação **não modifica a câmera diretamente**. Em vez disso:

1. Calcula a câmera-alvo via `bboxToCamera()`
2. Seta o `target` com `target.setTransform()`
3. O loop rAF no `main.ts` interpola `camera` em direção ao `target` via `animateCamera()`

Isso mantém a separação entre lógica de navegação e animação.

## Funções exportadas

| Função        | Descrição                                      |
|---------------|-------------------------------------------------|
| `drillDown()` | Avança um nível na hierarquia                  |
| `drillUp()`   | Volta um nível na hierarquia                   |
| `resetView()` | Volta para ROOT com visão geral                |

## Dependências

| Direção    | Módulo        | Relação                                    |
|------------|---------------|--------------------------------------------|
| Importa    | `types.ts`    | `NavState`, `Region`, `Camera`             |
| Importa    | `camera.ts`   | `bboxToCamera()` para calcular target      |
| Chamado por | `main.ts`    | Via callbacks `onDrillDown`, `onDrillUp`, `onReset` |
| Chamado por | `events.ts`  | Indiretamente, via callbacks passados ao `setupEvents()` |

## Decisões arquiteturais

### Por que NavState é mutado in-place?

O `NavState` é passado por referência e modificado diretamente pelas funções de navegação. Isso simplifica o fluxo — não precisa de reducer, dispatch ou setState. Como o estado é lido apenas no loop de renderização (que é síncrono), não há risco de torn reads.

### Por que history é uma pilha (push/pop)?

A navegação é estritamente linear (profundidade). O usuário não pode pular de ci para ps — precisa voltar nível a nível. Uma pilha (stack) modela isso naturalmente, com `push` no drill-down e `pop` no drill-up.

### Por que a câmera anterior é salva como snapshot?

```ts
nav.history.push({
  id: nav.focusedId,
  level: nav.level,
  camera: { scale: camera.scale, translateX: camera.translateX, translateY: camera.translateY }
});
```

O snapshot preserva a posição exata do pan/zoom do usuário. Ao voltar (drill-up), a câmera é restaurada para essa posição — o usuário vê exatamente o que via antes.
