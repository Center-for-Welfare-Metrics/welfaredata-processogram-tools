# inverseMatrix — Getter com cache Dirty Flag

## O que faz

Retorna a **matriz inversa** da transformação atual da câmera. É usada para converter coordenadas de **canvas** (pixels na tela) para coordenadas de **SVG** (sistema de coordenadas do documento original).

```ts
get inverseMatrix(): DOMMatrix {
  if (this._dirty) {
    this._inverseMatrix = new DOMMatrix([
      this._scale, 0,
      0,           this._scale,
      this._tx,    this._ty
    ]).inverse();
    this._dirty = false;
  }
  return this._inverseMatrix;
}
```

## Por que existe

O hit-testing (`HitMap.getRegionAt()`) precisa saber "em qual ponto do SVG o usuário clicou". O clique chega em coordenadas de canvas; a hitmap opera em coordenadas de SVG. A conversão exige a **inversa** da matriz de transformação da câmera.

## Como funciona

### O que é DOMMatrix

`DOMMatrix` é uma API nativa do browser que representa uma matriz de transformação 2D/3D. Para transformações 2D, os valores relevantes são 6 componentes da **matriz afim**:

```
| a  c  e |
| b  d  f |
| 0  0  1 |
```

Onde:
- `a`, `d` = escala (horizontal e vertical)
- `b`, `c` = inclinação (skew) — zero neste projeto
- `e`, `f` = translação (horizontal e vertical)

### Construção da matriz

```ts
new DOMMatrix([
  this._scale, 0,        // a, b
  0,           this._scale, // c, d
  this._tx,    this._ty   // e, f
])
```

Isso codifica: "primeiro escale por `_scale` em ambos os eixos, depois translede por `(_tx, _ty)`".

### Fórmula da inversão

Para uma matriz de escala uniforme sem rotação/skew:

$$
M = \begin{bmatrix} s & 0 & tx \\ 0 & s & ty \\ 0 & 0 & 1 \end{bmatrix}
$$

$$
M^{-1} = \begin{bmatrix} 1/s & 0 & -tx/s \\ 0 & 1/s & -ty/s \\ 0 & 0 & 1 \end{bmatrix}
$$

Assim, para converter canvas → SVG:

$$
svgX = \frac{canvasX - tx}{s}
$$

$$
svgY = \frac{canvasY - ty}{s}
$$

No código do HitMap, isso é expresso usando os componentes da DOMMatrix:

```ts
const m = camera.inverseMatrix;
const svgX = m.a * canvasX + m.c * canvasY + m.e;
const svgY = m.b * canvasX + m.d * canvasY + m.f;
```

Como `m.b = 0` e `m.c = 0` (sem rotação), isso simplifica para `svgX = m.a * canvasX + m.e`.

### Dirty Flag — recálculo just-in-time

O `_dirty` flag controla quando a inversa é recalculada:

1. `setTransform()` → `_dirty = true`
2. Primeira leitura de `inverseMatrix` → recalcula, `_dirty = false`
3. Leituras subsequentes → retorna cache

**Por que just-in-time é seguro aqui:**

- JavaScript é single-threaded — não há race conditions entre `setTransform()` e a leitura do getter.
- Dentro de um frame, `setTransform()` é chamado **uma vez** (na animação), e `inverseMatrix` pode ser lido **várias vezes** (hover, click). O cache garante que a inversão acontece no máximo 1x por frame.

## Parâmetros

Nenhum — é um getter.

## Retorno

| Tipo        | Descrição                                                    |
|-------------|--------------------------------------------------------------|
| `DOMMatrix` | Matriz inversa da transformação atual (scale + translate)    |

## Exemplos de uso

### No hit-testing

```ts
const m = camera.inverseMatrix;
const svgX = m.a * canvasX + m.c * canvasY + m.e;
const svgY = m.b * canvasX + m.d * canvasY + m.f;
const hitX = Math.round(svgX * this.hitScale);
const hitY = Math.round(svgY * this.hitScale);
```

### Múltiplas leituras no mesmo frame

```ts
// getRegionAt() lê inverseMatrix
const regionId = hitmap.getRegionAt(x, y, camera, nav);
// hasRegionAt() lê inverseMatrix de novo — sem recalcular
const hasRegion = hitmap.hasRegionAt(x, y, camera, nav);
```

## Dependências

| Direção   | Módulo       | Relação                                    |
|-----------|--------------|--------------------------------------------|
| Usado por | `hitmap.ts`  | `getRegionAt()` e `hasRegionAt()` convertem coordenadas |
| Depende de | `setTransform()` | É invalidado toda vez que `setTransform()` é chamado |

## Decisões arquiteturais

### Por que DOMMatrix.inverse() e não inversão manual?

A API nativa é implementada em C++ no browser — mais rápida e mais correta para casos com floating point. Como a câmera deste projeto usa apenas escala uniforme + translação, a inversão é trivial, mas usar `DOMMatrix` mantém o código preparado para futuras extensões (rotação, por exemplo).

### Por que não recalcular no setTransform()?

**Eager calculation** desperdiçaria CPU quando a câmera muda mas ninguém consulta a inversa naquele frame. O padrão lazy (just-in-time) é mais eficiente, especialmente durante animações onde `setTransform()` é chamado a 60fps mas o hit-testing pode não ocorrer a cada frame.
