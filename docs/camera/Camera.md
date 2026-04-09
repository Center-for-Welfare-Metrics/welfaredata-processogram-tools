# Camera — Classe Principal

## O que faz

A classe `Camera` representa o estado de visualização do canvas: **escala** (zoom) e **translação** (pan). Todo o sistema de renderização consulta a câmera para saber "onde o usuário está olhando" e em que nível de zoom.

## Por que existe

Centralizar o estado de transformação em uma única classe resolve três problemas:

1. **Fonte única de verdade** — escala e translação vivem num único objeto, não espalhados por variáveis globais.
2. **Dirty Flag** — a matriz inversa (cara de calcular) só é recalculada quando algo muda.
3. **Atomicidade** — os três valores (scale, translateX, translateY) são sempre alterados juntos via `setTransform()`, impedindo estados parcialmente atualizados (Torn State).

## Como funciona

```ts
export class Camera {
  private _scale: number = 1;
  private _tx: number = 0;
  private _ty: number = 0;
  private _inverseMatrix: DOMMatrix = new DOMMatrix();
  private _dirty: boolean = true;
```

### Propriedades privadas

| Propriedade       | Tipo        | Descrição                                      |
|-------------------|-------------|-------------------------------------------------|
| `_scale`          | `number`    | Fator de zoom atual (1 = tamanho original)      |
| `_tx`             | `number`    | Translação horizontal em pixels do canvas       |
| `_ty`             | `number`    | Translação vertical em pixels do canvas          |
| `_inverseMatrix`  | `DOMMatrix` | Cache da matriz inversa (recalculada sob demanda)|
| `_dirty`          | `boolean`   | Flag que indica se a inversa precisa ser recalculada |

### Getters de leitura

```ts
get scale():      number { return this._scale; }
get translateX(): number { return this._tx; }
get translateY(): number { return this._ty; }
```

Os getters expõem os valores como **somente leitura**. Código externo lê `camera.scale`, `camera.translateX`, `camera.translateY` sem poder alterar diretamente. Isso preserva a compatibilidade com a interface `Camera` definida em `types.ts`:

```ts
export interface Camera {
  scale: number;
  translateX: number;
  translateY: number;
}
```

### Único ponto de mutação

A classe tem **um único método** que altera estado: `setTransform()`. Isso garante que nenhum código externo consiga alterar `_scale` sem também atualizar `_tx` e `_ty`, e vice-versa.

### Dirty Flag para a matriz inversa

A matriz inversa é necessária para converter coordenadas de canvas para coordenadas SVG (usado no hit-testing). O cálculo de inversão de matriz é relativamente caro, então:

1. `setTransform()` marca `_dirty = true`
2. O getter `inverseMatrix` só recalcula quando `_dirty === true`
3. Após recalcular, marca `_dirty = false`

Se a câmera não se moveu entre duas leituras, a matriz cacheada é retornada imediatamente.

## Dependências

| Direção    | Módulo          | Relação                                                |
|------------|-----------------|--------------------------------------------------------|
| Importa    | `types.ts`      | Usa `BBox`, `LERP_FACTOR`, `SNAP_THRESHOLD`           |
| Usado por  | `renderer.ts`   | Aplica `camera.scale` e `camera.translateX/Y` no `ctx.setTransform()` |
| Usado por  | `hitmap.ts`     | Usa `camera.inverseMatrix` para converter coordenadas  |
| Usado por  | `events.ts`     | Modifica a câmera via `setTransform()` em resposta a pan/zoom |
| Usado por  | `navigation.ts` | Cria câmeras-alvo via `bboxToCamera()` para drill-down |
| Usado por  | `main.ts`       | Instancia `camera` e `target`, chama `animateCamera()` |

## Decisões arquiteturais

### Por que Dirty Flag em vez de recalcular sempre?

A função `getRegionAt()` do HitMap pode ser chamada em todo `mousemove`. A inversão de matriz é O(1) mas envolve 6 divisões — com Dirty Flag, durante animações o custo total cai, pois a inversão só acontece quando `setTransform()` é chamado (tipicamente 1x por frame), não a cada consulta de hit-testing.

### Por que a classe implementa a interface Camera de types.ts?

A classe `Camera` (instanciável, com métodos) convive com a interface `Camera` (plain object). As funções `bboxToCamera()` e `fitToCanvas()` retornam plain objects `{ scale, translateX, translateY }` que são usados como **targets** para animação. A classe é o estado mutável; a interface é o snapshot imutável.

### Por que não usar DOMMatrix diretamente como estado?

`DOMMatrix` é mutável e não tem Dirty Flag embutido. Manter `scale/tx/ty` como números separados torna o código de interpolação (lerp) trivial e o debug por console.log legível.
