# events — mousemove & mouseleave handlers

## O que faz

O handler de `mousemove` implementa o **tooltip de identificação de regiões**: ao mover o rato sobre o canvas, consulta o hitmap para verificar se existe uma região sob o cursor e, se sim, apresenta um tooltip flutuante com o `regionId` e o `alias` legível. O handler de `mouseleave` esconde o tooltip quando o cursor sai do canvas.

## Por que existe

O tooltip dá feedback visual imediato ao utilizador sobre qual região está sob o cursor, sem necessidade de clicar. Isto é essencial para explorar a hierarquia — o utilizador vê o nome da região antes de decidir se quer fazer drill-down.

## Como funciona

### mousemove

```
Rato move sobre o canvas
  │
  ├─ getBoundingClientRect() → coordenadas CSS
  │    canvasX = clientX - rect.left
  │    canvasY = clientY - rect.top
  │
  ├─ hitmap.getRegionAt(canvasX, canvasY, camera, nav)
  │    └─ devolve regionId | null
  │
  ├─ SE regionId existe
  │    ├─ regions.get(regionId) → Region | undefined
  │    ├─ getAlias(regionId) → alias legível
  │    ├─ tooltip.textContent = "regionId [alias]"
  │    ├─ tooltip.style.display = 'block'
  │    └─ tooltip posicionado em (clientX + 14, clientY + 14)
  │
  └─ SE regionId é null
       └─ tooltip.style.display = 'none'
```

### mouseleave

```
Cursor sai do canvas
  └─ tooltip.style.display = 'none'
```

## Código fonte

### mousemove

```ts
canvas.addEventListener('mousemove', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  const regionId = hitmap.getRegionAt(canvasX, canvasY, camera, nav);
  if (regionId) {
    const region = regions.get(regionId);
    const alias = region ? getAlias(regionId) : '';
    tooltip.textContent = `${regionId} [${alias}]`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY + 14) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
});
```

### mouseleave

```ts
canvas.addEventListener('mouseleave', () => {
  tooltip.style.display = 'none';
});
```

## Parâmetros utilizados

| Parâmetro | Papel |
|---|---|
| `canvas` | Alvo dos listeners `mousemove` e `mouseleave` |
| `hitmap` | `getRegionAt()` — traduz coordenadas CSS em `regionId` |
| `camera` | Passado ao hitmap para transformação mundo ↔ ecrã |
| `nav` | Passado ao hitmap para contexto de nível/foco |
| `regions` | `regions.get(regionId)` — obtém o objecto `Region` (usado como guarda para alias) |

### Elemento DOM: tooltip

```ts
const tooltip = document.getElementById('tooltip')!;
```

O tooltip é um elemento HTML pré-existente no `index.html`, identificado por `id="tooltip"`. A função `setupEvents` captura-o uma vez no início e reutiliza a referência em ambos os handlers.

## Formato do tooltip

```
regionId [alias]
```

Exemplos:
- `ps_01 [Pavilhão Sul 1]`
- `lf_02 [Lote Fêmeas 2]`
- `ph_03 [Pen House 3]`

O alias é derivado pela função `getAlias()` de `parser.ts`, que extrai um nome legível a partir do ID da região.

### Posicionamento

O tooltip é posicionado com um offset de **+14px** em ambos os eixos relativamente ao cursor:

```ts
tooltip.style.left = (e.clientX + 14) + 'px';
tooltip.style.top  = (e.clientY + 14) + 'px';
```

Isto evita que o tooltip fique directamente sob o cursor (o que causaria flicker, pois o tooltip roubaria o evento de mousemove).

## Exemplo de uso concreto

```
Estado: nav.level = 0 (ps), focusedId = "ps_01"
Rato em (400, 250) sobre o canvas

→ hitmap.getRegionAt(400, 250, camera, nav) = "lf_02"
→ regions.get("lf_02") = { id: "lf_02", bbox: {...}, ... }
→ getAlias("lf_02") = "Lote Fêmeas 2"
→ tooltip mostra: "lf_02 [Lote Fêmeas 2]"
→ tooltip em (414px, 264px)
```

```
Rato sai do canvas
→ mouseleave dispara
→ tooltip.style.display = 'none'
```

## Dependências

| Módulo | Importação | Utilização |
|---|---|---|
| `hitmap.ts` | `HitMap` | `getRegionAt()` — identifica região sob o cursor |
| `parser.ts` | `getAlias` | Converte `regionId` em alias legível |
| `types.ts` | `Region`, `Camera`, `NavState` | Tipos dos objectos passados como parâmetro |

## Decisões arquitecturais

1. **Sem throttle/debounce** — O `mousemove` invoca `getRegionAt()` em cada evento, sem limitação de frequência. Isto é viável porque `getRegionAt()` é uma operação O(1) — leitura de um pixel no hitmap canvas, não um cálculo geométrico.

2. **Offset fixo de 14px** — Valor empírico que mantém o tooltip visível sem sobrepor o cursor e sem sair excessivamente da zona de interesse.

3. **Fallback de alias** — Se `regions.get(regionId)` devolver `undefined`, o alias é uma string vazia (`''`). Isto protege contra regiões que existem no hitmap mas podem ter sido removidas do mapa de regiões (caso defensivo).

4. **mouseleave como cleanup** — Garante que o tooltip desaparece quando o cursor sai do canvas, mesmo que o último `mousemove` tenha sido sobre uma região válida.
