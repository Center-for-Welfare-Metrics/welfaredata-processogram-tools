# fallbackToRasterize() — Pipeline de rasterização SVG → idGrid

## O que faz

Método privado que executa o pipeline completo de rasterização: cria 4 canvas temporários, modifica cópias do SVG com cores únicas por região, rasteriza via Blob URL + drawImage, extrai os idGrids (`Int32Array`) e destrói os canvas para liberar VRAM. É chamado por `build()` apenas em caso de cache miss no IndexedDB.

```ts
private async fallbackToRasterize(
  svgText: string,
  regions: Map<string, Region>,
  svgWidth: number,
  svgHeight: number
): Promise<void>
```

## Por que existe

O pipeline de rasterização é o caminho "pesado" da hitmap — envolve parsing de DOM, manipulação de SVG, rasterização de imagens e extração de pixels. Isolá-lo num método privado permite que `build()` seja um orquestrador limpo (hash → cache → fallback → persist) e que o pipeline seja modificável sem impactar a lógica de cache.

## Como funciona — Pipeline completo

### Fase 1 — Dimensionamento

```ts
const w = Math.round(svgWidth  * this.hitScale);
const h = Math.round(svgHeight * this.hitScale);
```

Calcula dimensões do canvas com `HIT_SCALE = 0.5` (metade da resolução).

### Fase 2 — Criar 4 canvas temporários + layers

```ts
const tmpCanvas = new Map<number, HTMLCanvasElement>();
const tmpCtx    = new Map<number, CanvasRenderingContext2D>();
for (let level = 0; level <= 3; level++) {
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  tmpCanvas.set(level, canvas);
  tmpCtx.set(level, ctx);
  this.layers.set(level, {
    pixels: new Int32Array(0), // placeholder — preenchido após drawImage
    width: w,
    height: h,
    colorIndex: new Map()
  });
}
```

Cada canvas:
- Tem resolução `svgWidth * 0.5` × `svgHeight * 0.5`
- Usa `willReadFrequently: true` para otimizar o único `getImageData()` que será feito após a rasterização
- Desabilita `imageSmoothingEnabled` para evitar interpolação que misturaria cores entre regiões

**Canvas e ctx são variáveis locais temporárias** (`tmpCanvas`/`tmpCtx`) — não são armazenados na `HitLayer`. Após a extração de pixels, são destruídos para liberar VRAM.

**Por que `imageSmoothingEnabled = false`?**  
Com smoothing habilitado, a borda entre duas regiões teria pixels com cores interpoladas, que não correspondem a nenhuma região. O resultado seria "buracos" clicáveis onde o hit-testing falha.

### Fase 3 — Para cada layer, construir SVG modificado

O loop itera `level = 0..3`. Para cada nível:

#### 3a — Filtrar regiões do nível

```ts
const regionsByLevel = [...regions.values()]
  .filter(r => r.level === level);

if (regionsByLevel.length === 0) continue;
```

Se não há regiões neste nível, pula (a layer fica com canvas vazio).

#### 3b — Parse do SVG via DOMParser

```ts
const parser = new DOMParser();
const doc = parser.parseFromString(svgText, 'image/svg+xml');
const svgRoot = doc.documentElement;
```

O SVG é re-parsed a cada layer para ter uma cópia independente que será modificada.

#### 3c — Normalização incondicional de viewBox/width/height

```ts
svgRoot.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
svgRoot.setAttribute('width',   String(svgWidth));
svgRoot.setAttribute('height',  String(svgHeight));
```

**Por que normalização incondicional?**  
SVGs exportados de editores diferentes (Inkscape, Illustrator, Figma) usam convenções diferentes para viewBox, width e height. Alguns usam unidades `mm`, outros `px`, outros omitem um ou mais atributos. A normalização força o contrato: "o sistema de coordenadas é `[0, 0, svgWidth, svgHeight]` em unidades abstratas". Isso garante que as coordenadas do canvas da hitmap coincidam com as coordenadas do SVG parseado.

#### 3d — Remoção de styles do Inkscape

```ts
for (const style of Array.from(svgRoot.querySelectorAll('style'))) {
  style.remove();
}
```

**Por que remover `<style>`?**  
Editores como Inkscape inserem `<style>` globais que definem `fill`, `stroke`, `opacity` via classes CSS. Esses estilos CSS têm **prioridade sobre atributos** na cascata e sobrescreveriam as cores únicas que a hitmap injeta. Remover as tags `<style>` garante que os atributos `fill` setados individualmente prevaleçam.

#### 3e — Injeção de crispEdges

```ts
const styleTag = document.createElementNS('http://www.w3.org/2000/svg', 'style');
styleTag.textContent = [
  '* {',
  '  shape-rendering: crispEdges !important;',
  '  text-rendering: geometricPrecision !important;',
  '}'
].join('\n');
svgRoot.prepend(styleTag);
```

**Por que `crispEdges`?**  
`shape-rendering: crispEdges` desabilita anti-aliasing no nível do SVG. Combinado com `imageSmoothingEnabled = false` no canvas, garante que cada pixel tenha uma cor pura — sem gradientes de borda que poderiam causar falsos positivos/negativos no hit-testing.

#### 3f — Pintar tudo de preto

```ts
for (const el of Array.from(svgRoot.querySelectorAll('*'))) {
  el.setAttribute('fill', '#000000');
  el.setAttribute('stroke', 'none');
  el.removeAttribute('style');
}
```

Todos os elementos ficam pretos (`#000000`). Isso serve como "fundo" sobre o qual as regiões coloridas se destacam. O `removeAttribute('style')` remove estilos inline que poderiam sobrescrever o `fill`.

#### 3g — Coloração única por região

```ts
for (let i = 0; i < regionsByLevel.length; i++) {
  const region = regionsByLevel[i];
  const colorIdx = i + 1; // reservar 0 para "sem região"
  const color = this.indexToColor(colorIdx);
  layer.colorIndex.set(colorIdx, region.id);

  const groupEl = svgRoot.querySelector(`#${CSS.escape(region.id)}`);
  if (!groupEl) continue;

  groupEl.setAttribute('fill', color);
  for (const child of Array.from(groupEl.querySelectorAll('*'))) {
    child.setAttribute('fill', color);
  }
}
```

- Índice começa em 1 (0 = preto = "sem região")
- `CSS.escape()` trata IDs com caracteres especiais
- A cor é aplicada ao grupo e a **todos os seus filhos** para garantir cobertura total

#### 3h — Rasterização via Image → Canvas + Extração do idGrid

```ts
const serializer = new XMLSerializer();
const modifiedSvg = serializer.serializeToString(svgRoot);
const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
const url  = URL.createObjectURL(blob);

await new Promise<void>((resolve, reject) => {
  const img = new Image();
  const canvas = tmpCanvas.get(level)!;
  const ctx    = tmpCtx.get(level)!;
  img.onload = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);

    const imageData = ctx.getImageData(0, 0, w, h);
    const raw = imageData.data;

    const idGrid = new Int32Array(w * h);
    for (let i = 0; i < raw.length; i += 4) {
      const a = raw[i + 3];
      idGrid[i / 4] = a >= 128
        ? (raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]
        : -1;
    }

    layer.pixels = idGrid;
    canvas.width = 0;
    resolve();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error(`HitMap: falha ao rasterizar layer ${level}`));
  };
  img.src = url;
});
```

Pipeline por layer:
1. Serializa o DOM modificado de volta para string SVG
2. Cria um `Blob` → `ObjectURL`
3. Carrega num `Image` element
4. Desenha no canvas temporário com `drawImage()`
5. **Extração única**: `getImageData(0, 0, w, h)` lê todos os pixels de uma vez
6. **Pré-computação do idGrid**: decodifica RGBA → índice de cor para cada pixel, armazenando num `Int32Array`
   - `alpha >= 128` → `(R << 16) | (G << 8) | B` (a mesma codificação de `indexToColor`)
   - `alpha < 128` → `-1` (transparente/vazio)
7. Guarda o `idGrid` em `layer.pixels`
8. **Destrói o canvas** (`canvas.width = 0`) para liberar VRAM
9. Libera o ObjectURL para evitar memory leak

## Parâmetros

| Parâmetro   | Tipo                     | Descrição                                |
|-------------|--------------------------|------------------------------------------|
| `svgText`   | `string`                 | Código-fonte SVG completo                |
| `regions`   | `Map<string, Region>`    | Mapa de regiões extraídas pelo parser    |
| `svgWidth`  | `number`                 | Largura do SVG em unidades abstratas     |
| `svgHeight` | `number`                 | Altura do SVG em unidades abstratas      |

## Retorno

`Promise<void>` — assíncrono por causa do carregamento de imagens. Preenche `this.layers` como side-effect.

## Dependências

| Direção     | Módulo/API        | Relação                                          |
|-------------|-------------------|--------------------------------------------------|
| Usa         | `indexToColor()`  | Para gerar cores únicas por região               |
| Usa         | APIs do browser   | `DOMParser`, `XMLSerializer`, `Image`, `Blob`, `URL.createObjectURL` |
| Chamado por | `build()`         | Apenas em caso de cache miss no IndexedDB        |

## Decisões arquiteturais

### Por que re-parsear o SVG a cada layer?

Cada layer modifica o DOM SVG diferentemente (pintando regiões diferentes). Clonar via `cloneNode(true)` seria uma alternativa, mas `DOMParser.parseFromString()` garante um documento limpo sem referências compartilhadas entre layers.

### Por que serializar→Blob→Image em vez de drawImage direto?

O Canvas 2D não tem API para renderizar um `Document` diretamente. O pipeline Blob→Image é a forma padrão de rasterizar SVG em canvas no browser.

### Por que URL.revokeObjectURL() no callback?

Object URLs mantêm o Blob vivo na memória. Sem revogação, cada `build()` vazaria 4 blobs (um por layer). O `revokeObjectURL()` no `onload`/`onerror` garante liberação imediata.

### Por que destruir o canvas após extração?

```ts
canvas.width = 0;
```

Setting `width = 0` libera o bitmap buffer mantido pelo browser (VRAM ou RAM mapeada pelo compositor). O `Int32Array` já contém todos os dados necessários, então o canvas não tem mais utilidade. Sem essa destruição, 4 canvas off-screen ficariam retidos em memória de GPU indefinidamente.

### Por que um único getImageData em vez de vários?

Cada chamada `getImageData()` envolve sincronização GPU→CPU. Fazer uma única chamada para `w × h` pixels é ordens de magnitude mais eficiente do que `w × h` chamadas individuais de `getImageData(x, y, 1, 1)`. O custo é pago uma vez durante a rasterização, que é assíncrona e off-screen.
