# drillDown() — Avançar nível na hierarquia

## O que faz

Navega para dentro de uma região: salva o estado atual na pilha de histórico, atualiza o `NavState` para o novo nível/foco, solicita a geração de um DynamicTile, e calcula a câmera-alvo para enquadrar a região.

```ts
export function drillDown(
  regionId: string,
  nav: NavState,
  regions: Map<string, Region>,
  camera: Camera,
  target: Camera,
  canvasW: number,
  canvasH: number,
  onTileNeeded: (id: string) => void
): void
```

## Por que existe

O drill-down é a ação principal do usuário — clicar numa região para ver seus detalhes. A função coordena 4 operações que devem acontecer juntas: backup do estado, atualização do nav, solicitação de tile, e cálculo da câmera.

## Como funciona

### Passo 1 — Construir path da raiz até o alvo

```ts
const path: string[] = [];
let current: Region | undefined = regions.get(regionId);
while (current) {
  path.unshift(current.id);
  current = current.parentId ? regions.get(current.parentId) : undefined;
}
```

Se o usuário clicou em `cage-01--ci`, o path seria:
```
["shed-north--ps", "floor-01_lf", "house-A--ph", "cage-01--ci"]
```

Isso é necessário porque o drill-down avança **um nível por vez**. Se o usuário está no ROOT e clica numa gaiola (ci), a função precisa avançar primeiro para o aviário (ps).

### Passo 2 — Determinar o próximo passo

```ts
let nextStepIndex = 0;
if (nav.focusedId !== null) {
  const idx = path.indexOf(nav.focusedId);
  if (idx >= 0) {
    nextStepIndex = idx + 1;
  } else {
    nextStepIndex = 0;
  }
}

if (nextStepIndex >= path.length) return;

const nextId = path[nextStepIndex];
```

- Se está no ROOT → avança para o primeiro elemento do path (nível ps)
- Se está focado num elemento do path → avança para o próximo
- Se já está no último → não faz nada (`return`)

### Passo 3 — Validar bbox

```ts
if (!nextRegion.bbox ||
    nextRegion.bbox.width < 0.1 ||
    nextRegion.bbox.height < 0.1) {
  console.warn('[drillDown] bbox inválido para:', nextId);
  return;
}
```

Protege contra regiões com bbox degenerado (largura ou altura quase zero), que causariam zoom infinito.

### Passo 4 — Salvar estado atual (backup)

```ts
nav.history.push({
  id: nav.focusedId,
  level: nav.level,
  camera: {
    scale: camera.scale,
    translateX: camera.translateX,
    translateY: camera.translateY
  }
});
```

O estado **antes** da transição é salvo na pilha de histórico:
- `id` — região que estava focada (ou `null` se ROOT)
- `level` — nível em que estava
- `camera` — snapshot da câmera (posição e zoom exatos)

Esse snapshot permite que `drillUp()` restaure exatamente o que o usuário via antes.

### Passo 5 — Atualizar NavState

```ts
nav.level = nextRegion.level;
nav.focusedId = nextId;
```

Muta o NavState in-place para refletir o novo nível e foco.

### Passo 6 — Solicitar DynamicTile

```ts
onTileNeeded(nextId);
```

Callback para o `main.ts`, que inicia a geração assíncrona do `DynamicTile` — uma rasterização em alta resolução apenas da região focada.

### Passo 7 — Calcular câmera-alvo

```ts
const newCam = bboxToCamera(nextRegion.bbox, canvasW, canvasH);
target.setTransform(
  newCam.scale,
  newCam.translateX,
  newCam.translateY
);
```

Calcula uma câmera que enquadra o bbox da região no canvas (com padding de 90%) e seta como `target`. O loop de animação interpolará `camera` em direção a `target`.

## Parâmetros

| Parâmetro      | Tipo                        | Descrição                               |
|----------------|-----------------------------|-----------------------------------------|
| `regionId`     | `string`                    | ID da região clicada pelo usuário       |
| `nav`          | `NavState`                  | Estado de navegação (mutado in-place)   |
| `regions`      | `Map<string, Region>`       | Mapa de regiões do parser               |
| `camera`       | `Camera`                    | Câmera atual (lida para snapshot)       |
| `target`       | `Camera`                    | Câmera-alvo (setada para animação)      |
| `canvasW`      | `number`                    | Largura do canvas                       |
| `canvasH`      | `number`                    | Altura do canvas                        |
| `onTileNeeded` | `(id: string) => void`      | Callback para solicitar DynamicTile     |

## Retorno

`void` — muta `nav` e `target` in-place.

## Exemplos de uso

```ts
// main.ts
function onDrillDown(regionId: string): void {
  drillDown(regionId, nav, regions, camera, target,
    window.innerWidth, window.innerHeight, onTileNeeded);
  isAnimating = true;
  needsRedraw = true;
}
```

## Dependências

| Direção    | Módulo        | Relação                              |
|------------|---------------|--------------------------------------|
| Importa    | `camera.ts`   | `bboxToCamera()` para target         |
| Importa    | `types.ts`    | `NavState`, `Region`, `Camera`       |
| Chamado por | `main.ts`    | Via callback `onDrillDown`           |

## Decisões arquiteturais

### Por que path walking em vez de drill direto?

Se o usuário está no ROOT e clica numa região ci (nível 3), não faz sentido pular direto 3 níveis — o dimming e o highlight seriam confusos. O path walking garante drill-down incremental: ROOT → ps → lf → ph → ci, um nível por clique.

### Por que onTileNeeded é callback?

A geração do `DynamicTile` é assíncrona e gerenciada pelo `main.ts` (que tem referência ao `rasterizerConfig` e `dynamicCache`). O `navigation.ts` não precisa saber desses detalhes — ele apenas sinaliza que um tile é necessário.
