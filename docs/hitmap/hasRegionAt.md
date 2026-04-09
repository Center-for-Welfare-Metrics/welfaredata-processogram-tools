# hasRegionAt() — Verificação rápida de presença de região

## O que faz

Retorna `true` se há **alguma região clicável** sob o ponto indicado, `false` caso contrário. Não identifica *qual* região é — apenas se *existe* uma.

```ts
hasRegionAt(
  canvasX: number,
  canvasY: number,
  camera: Camera,
  nav: { level: number; focusedId: string | null }
): boolean
```

## Por que existe

O `hasRegionAt()` é mais barato que `getRegionAt()` para o caso de uso mais comum: **trocar o cursor do mouse**. Quando o mouse se move sobre o canvas, o sistema precisa decidir se mostra cursor `pointer` (mão) ou `default` (seta). Não precisa saber *qual* região é — só se existe alguma. Ambos usam lookup direto num `Int32Array` pré-computado.

## Diferença em relação ao getRegionAt()

| Aspecto              | `getRegionAt()`              | `hasRegionAt()`                |
|----------------------|-------------------------------|--------------------------------|
| Retorno              | `string \| null` (ID)        | `boolean`                      |
| Verifica parentId    | Sim (filtra filhos diretos)   | Não (qualquer pixel != 0)      |
| Consulta regionMap   | Sim                           | Não                            |
| Uso principal        | Click → drill-down            | Mousemove → cursor             |
| Custo                | Lookup Int32Array + lookup Map | Apenas lookup Int32Array  |

A principal diferença é que `hasRegionAt()` **não consulta o `regionMap`** e **não verifica `parentId`**. Ele apenas verifica se o índice é `!== -1` no `Int32Array`, o que é suficiente para indicar que há *algo* sob o cursor.

## Como funciona

### Conversão de coordenadas (idêntica ao getRegionAt)

```ts
const m    = camera.inverseMatrix;
const svgX = m.a * canvasX + m.c * canvasY + m.e;
const svgY = m.b * canvasX + m.d * canvasY + m.f;
const hitX = Math.round(svgX * this.hitScale);
const hitY = Math.round(svgY * this.hitScale);
```

### Modo ROOT (nav.level === -1)

```ts
for (let lvl = 0; lvl <= 3; lvl++) {
  const layer = this.layers.get(lvl);
  if (!layer || layer.colorIndex.size === 0) continue;
  if (hitX < 0 || hitY < 0 ||
      hitX >= layer.width ||
      hitY >= layer.height) continue;
  const idx = layer.pixels[hitY * layer.width + hitX];
  if (idx !== -1) return true;
}
return false;
```

Varre todas as layers. Se qualquer uma tiver pixel não-vazio (`idx !== -1`), retorna `true`.

### Modo FOCADO

```ts
const focusedRegion = nav.focusedId
  ? this.regionMap.get(nav.focusedId)
  : null;
const targetLevel = focusedRegion
  ? focusedRegion.level + 1
  : nav.level + 1;
if (targetLevel > 3) return false;
const layer = this.layers.get(targetLevel);
if (!layer) return false;
// ... bounds check ...
const idx = layer.pixels[hitY * layer.width + hitX];
return idx !== -1;
```

Consulta apenas a layer do próximo nível. Se o pixel é não-vazio, retorna `true`.

## Parâmetros

| Parâmetro | Tipo                                            | Descrição                              |
|-----------|-------------------------------------------------|----------------------------------------|
| `canvasX` | `number`                                        | Coordenada X no canvas (pixels da tela)|
| `canvasY` | `number`                                        | Coordenada Y no canvas (pixels da tela)|
| `camera`  | `Camera`                                        | Estado atual da câmera                 |
| `nav`     | `{ level: number; focusedId: string \| null }` | Estado de navegação                    |

## Retorno

| Tipo      | Descrição                                        |
|-----------|--------------------------------------------------|
| `boolean` | `true` se há região sob o ponto, `false` se vazio |

## Quando é usado

```ts
// events.ts — no mousemove
canvas.style.cursor = hitmap.hasRegionAt(mouseX, mouseY, camera, nav)
  ? 'pointer'
  : 'default';
```

## Dependências

| Direção    | Módulo              | Relação                              |
|------------|---------------------|--------------------------------------|
| Usa        | `camera.inverseMatrix` | Conversão canvas → SVG           |
| Chamado por | `events.ts`        | No `mousemove` para cursor pointer  |

## Decisões arquiteturais

### Por que não reusar getRegionAt()?

```ts
// Alternativa possível:
hasRegionAt(x, y, camera, nav) {
  return this.getRegionAt(x, y, camera, nav) !== null;
}
```

Isso funcionaria, mas `getRegionAt()` faz trabalho extra (consulta `regionMap`, verifica `parentId`) que é desnecessário para decidir o cursor. O `hasRegionAt()` corta esse trabalho, retornando `true` assim que encontra qualquer pixel não-vazio (`idx !== -1`). Em mousemove a 60fps, essa economia se acumula.

### Por que retorna boolean e não o pixelData?

O chamador (`events.ts`) só precisa de `true`/`false` para `canvas.style.cursor`. Expor o índice do grid seria leaking de implementação.
