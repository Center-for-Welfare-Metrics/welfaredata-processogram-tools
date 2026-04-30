# buildTier() — Rasterizar SVG em resolução específica

## O que faz

Cria um canvas off-screen e rasteriza o SVG nele com um multiplicador de escala. É a função interna usada por `buildRasterCache()` para gerar os tiers low e mid.

```ts
const buildTier = (mult: number): HTMLCanvasElement => {
  let m = mult;
  if (maxDim * m > MAX_CANVAS_DIM) {
    m = Math.floor(MAX_CANVAS_DIM / maxDim);
  }
  if (m < 1) m = 1;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(svgWidth * m);
  canvas.height = Math.round(svgHeight * m);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.scale(m, m);
  ctx.drawImage(svgImage, 0, 0, svgWidth, svgHeight);
  return canvas;
};
```

## Por que existe

Encapsula a lógica de criação de um tier individual: clamping do multiplicador, criação do canvas, scaling e rasterização. Usada duas vezes: para `low=1` e para `mid=<mult adaptativo>`. O multiplicador do mid tier é calculado adaptativamente por `buildRasterCache()` com base no menor elemento `--ci` e passado como parâmetro — ver [buildRasterCache.md](./buildRasterCache.md).

## Como funciona

### Passo 1 — Aplicar multiplicador com safety clamp

```ts
let m = mult;
if (maxDim * m > MAX_CANVAS_DIM) {
  m = Math.floor(MAX_CANVAS_DIM / maxDim);
}
if (m < 1) m = 1;
```

O multiplicador desejado pode ser reduzido para respeitar `MAX_CANVAS_DIM = 8192`:

| SVG maxDim | mult desejado | maxDim × mult | Excede? | m final |
|------------|---------------|---------------|---------|---------|
| 1000       | 4             | 4000          | Não     | 4       |
| 2500       | 4             | 10000         | Sim     | 3       |
| 5000       | 4             | 20000         | Sim     | 1       |
| 9000       | 1             | 9000          | Sim     | 1*      |

*Quando `floor(8192/9000) = 0`, o clamp `if (m < 1) m = 1` garante mínimo 1 — o SVG é renderizado sem ampliação mas nunca perde resolução original.

### Passo 2 — Arredondamento das dimensões

```ts
canvas.width = Math.round(svgWidth * m);
canvas.height = Math.round(svgHeight * m);
```

`Math.round()` converte de unidades SVG (float) para pixels (inteiro). Canvas dimensions devem ser inteiros — valores fracionais seriam silenciosamente truncados pelo browser, podendo causar artefatos de 1px.

### Passo 3 — ctx.scale() antes do drawImage

```ts
const ctx = canvas.getContext('2d', { alpha: false })!;
ctx.scale(m, m);
ctx.drawImage(svgImage, 0, 0, svgWidth, svgHeight);
```

A sequência é importante:

1. `ctx.scale(m, m)` — aplica a transformação de escala no contexto. Todos os desenhos subsequentes serão amplificados por `m`.
2. `ctx.drawImage(svgImage, 0, 0, svgWidth, svgHeight)` — desenha a imagem SVG nas dimensões originais. O `ctx.scale` faz com que o resultado ocupe `svgWidth*m × svgHeight*m` pixels.

**Por que `ctx.scale()` em vez de `drawImage(img, 0, 0, width*m, height*m)`?**

O `ctx.scale()` preserva a qualidade de rendering do SVG — o browser re-rasteriza o SVG na resolução final. Usar `drawImage` com dimensões escaladas faria o browser esticar o bitmap, perdendo qualidade.

### O que acontece quando SVG é muito grande

Para um SVG de 10000×8000:

```
maxDim = 10000
mult = 4 → maxDim * 4 = 40000 > 8192
m = floor(8192 / 10000) = 0
m < 1 → m = 1

Canvas: 10000×8000 (sem ampliação — já beira o limite)
```

Neste caso, low e mid teriam a mesma resolução (ambos m=1). O renderer não teria ganho ao trocar de tier, mas o sistema funciona sem erros.

Para SVGs extremamente grandes (>8192 em uma dimensão), o canvas base já excede o ideal. Nesse cenário, a renderização funciona mas pode ser mais lenta e consumir mais memória.

## Parâmetros

| Parâmetro | Tipo     | Descrição                                    |
|-----------|----------|----------------------------------------------|
| `mult`    | `number` | Multiplicador de escala desejado (1, 4, ...) |

*Nota: `maxDim`, `svgWidth`, `svgHeight` e `svgImage` são capturados do closure de `buildRasterCache()`.*

## Retorno

| Tipo                | Descrição                                    |
|---------------------|----------------------------------------------|
| `HTMLCanvasElement` | Canvas off-screen com o SVG rasterizado      |

## Exemplos de uso

```ts
// Dentro de buildRasterCache()
const low = buildTier(1);  // SVG em resolução 1:1
const mid = buildTier(4);  // SVG em resolução 4:1 (ou clamp)
```

## Dependências

| Direção    | Módulo          | Relação                            |
|------------|-----------------|------------------------------------| 
| Usa        | `MAX_CANVAS_DIM` | Para clamp de segurança           |
| Usa        | `svgImage`      | Imagem SVG pré-carregada (closure) |
| Chamada por | `buildRasterCache()` | Para gerar low e mid        |

## Decisões arquiteturais

### Por que alpha: false?

```ts
canvas.getContext('2d', { alpha: false })
```

O tier é um bitmap opaco do SVG — não precisa de transparência. `alpha: false` permite otimizações de composição idênticas às do renderer.

### Por que função interna (closure) e não exportada?

`buildTier` captura `maxDim`, `svgWidth`, `svgHeight` e `svgImage` do escopo de `buildRasterCache()`. Exportá-la exigiria passar todos esses valores como parâmetros, complicando a interface sem benefício.

### Por que `Math.floor` no clamp e não `Math.round`?

`Math.floor` garante que a dimensão resultante (`maxDim * m`) nunca exceda `MAX_CANVAS_DIM`. Com `Math.round`, um SVG de 4100 pixels daria `round(8192/4100) = round(1.998) = 2`, resultando em `4100*2 = 8200 > 8192` — excedendo o limite.
