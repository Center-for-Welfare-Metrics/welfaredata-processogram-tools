# stretchFactor — Lógica de seleção de tier

## O que faz

Decide qual imagem pré-rasterizada (tier) usar para desenhar o SVG, baseado em quanto o tier `low` está sendo "esticado" em relação à sua resolução nativa.

```ts
const currentPhysicalWidth = svgWidth * camera.scale;
const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
const source = stretchFactor > 1.5
  ? (rasterCache.mid ?? rasterCache.low!)
  : rasterCache.low!;
```

## Por que existe

O SVG é rasterizado em duas resoluções (`low` e `mid`). Quando o usuário faz zoom, a imagem `low` é esticada — e a partir de certo ponto, o esticamento fica visível (pixels borrados). O `stretchFactor` detecta esse ponto e troca para o tier `mid` (mais resolução).

## Como funciona

### Fórmula

$$
stretchFactor = \frac{svgWidth \times camera.scale}{rasterCache.low.width}
$$

Onde:
- `svgWidth × camera.scale` = largura **física** que o SVG ocupa na tela (em pixels CSS)
- `rasterCache.low.width` = largura **real** em pixels da imagem low

Se `stretchFactor = 1.0`, o tier low está sendo exibido em 1:1 — cada pixel da imagem corresponde a um pixel da tela.

Se `stretchFactor = 2.0`, cada pixel do tier low está sendo esticado para cobrir 2×2 pixels da tela — visualmente borrado.

### Threshold 1.5

```ts
const source = stretchFactor > 1.5
  ? (rasterCache.mid ?? rasterCache.low!)
  : rasterCache.low!;
```

O threshold de 1.5 foi escolhido porque:
- Abaixo de 1.5×, o esticamento é imperceptível para a maioria dos conteúdos SVG
- Acima de 1.5×, linhas finas e texto começam a ficar visivelmente borrados
- É um ponto de equilíbrio entre qualidade visual e economia de memória/GPU

### Por que é universal para qualquer tamanho de SVG

A fórmula é uma **razão** — não depende de valores absolutos. Funciona igualmente para:
- SVG pequeno (500×400) com tier low de 500px → troca em `camera.scale > 1.5`
- SVG grande (4000×3000) com tier low de 4000px → troca em `camera.scale > 1.5`

O ratio normaliza automaticamente para qualquer combinação de tamanho de SVG e resolução de tier.

### Por que scale >= 4 foi abandonado

O método `getCurrentTier()` preserva uma lógica anterior:

```ts
getCurrentTier(camera: Camera): string {
  return camera.scale < 4 ? 'low' : 'mid';
}
```

Essa abordagem (threshold absoluto no scale) foi abandonada na prática porque:
1. **Depende do tamanho do SVG** — `scale = 4` pode ser pouco zoom num SVG pequeno e muito zoom num grande
2. **Não considera a resolução do tier** — o tamanho real do tier low varia com o SVG
3. **O stretchFactor é auto-adaptativo** — compara o tamanho em tela com o tamanho real do tier

O `getCurrentTier()` ainda existe no código mas não é usado pelo `render()`. A lógica ativa é o stretchFactor inline.

### Fallback para low quando mid não existe

```ts
rasterCache.mid ?? rasterCache.low!
```

O tier `mid` é opcional — pode ser `null` se o rasterizer decidiu não gerar (ex: SVG muito pequeno). Quando `mid` não está disponível, o operador `??` faz fallback para `low`. O resultado visual é ligeiramente mais borrado em zoom alto, mas funcional.

## Contextos onde stretchFactor é avaliado

### Modo root

```ts
if (nav.focusedId === null) {
  const currentPhysicalWidth = svgWidth * camera.scale;
  const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
  const source = stretchFactor > 1.5
    ? (rasterCache.mid ?? rasterCache.low!)
    : rasterCache.low!;
  setCamera();
  ctx.drawImage(source, 0, 0, svgWidth, svgHeight);
}
```

### Modo focado (fallback sem dynamic tile)

```ts
const currentPhysicalWidth = svgWidth * camera.scale;
const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
const fgSource = stretchFactor > 1.5
  ? (rasterCache.mid ?? rasterCache.low!)
  : rasterCache.low!;
setCamera();
ctx.drawImage(fgSource, 0, 0, svgWidth, svgHeight);
```

A mesma lógica é repetida nos dois modos. No modo focado, só é usada quando o `dynamicCache` não tem um tile para a região focada (cenário temporário antes do tile ser gerado).

## Exemplos numéricos

| SVG Width | Low Width | Camera Scale | Physical Width | stretchFactor | Tier usado |
|-----------|-----------|-------------|----------------|---------------|------------|
| 2000      | 2000      | 0.5         | 1000           | 0.5           | low        |
| 2000      | 2000      | 1.0         | 2000           | 1.0           | low        |
| 2000      | 2000      | 1.5         | 3000           | 1.5           | low        |
| 2000      | 2000      | 1.6         | 3200           | 1.6           | **mid**    |
| 2000      | 2000      | 3.0         | 6000           | 3.0           | **mid**    |

## Dependências

| Direção    | Módulo          | Relação                                |
|------------|-----------------|----------------------------------------|
| Lê         | `camera.scale`  | Para calcular largura física           |
| Lê         | `rasterCache.low.width` | Para calcular o denominador    |
| Lê         | `rasterCache.mid` | Tier de maior resolução (opcional)   |

## Decisões arquiteturais

### Por que não mais de 2 tiers?

Dois tiers (low + mid) cobrem a maioria dos casos de uso com complexidade mínima:
- `low` para visão geral e zoom moderado
- `mid` para zoom alto

Um terceiro tier (`high`) aumentaria uso de memória significativamente e complicaria a lógica de seleção. Para zoom extremo, o sistema usa `DynamicTile` — tiles sob demanda apenas da região focada.

### Por que inline e não método dedicado?

O cálculo é apenas 3 linhas. Extrair para um método adicionaria overhead de chamada sem melhorar legibilidade. Se a lógica de seleção ficar mais complexa no futuro (ex: considerar mais tiers ou histerese), extrair para um método fará sentido.

### Por que não usar histerese?

Histerese (thresholds diferentes para subir e descer de tier) evitaria flickering em zoom perto do threshold. Atualmente não é necessário porque a transição entre tiers low e mid é visualmente suave — ambos representam o mesmo SVG em resoluções diferentes.
