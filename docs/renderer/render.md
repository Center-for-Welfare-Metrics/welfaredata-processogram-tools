# render() — Desenhar um frame completo

## O que faz

Desenha o conteúdo visual do canvas para o frame atual, aplicando a transformação da câmera, selecionando o tier correto da raster cache, e implementando dimming/highlight no modo focado.

```ts
render(
  nav: NavState,
  camera: Camera,
  rasterCache: RasterCache,
  dynamicCache: Map<string, DynamicTile>,
  _regions: Map<string, Region>,
  svgWidth: number,
  svgHeight: number
): void
```

## Por que existe

Cada frame precisa limpar o canvas, aplicar a câmera, e desenhar o conteúdo — com lógica diferente dependendo do estado de navegação. O `render()` centraliza toda essa lógica.

## Como funciona

### Passo 1 — Reset do canvas

```ts
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.fillStyle = BG_COLOR;
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

1. `setTransform(1,0,0,1,0,0)` → reseta a matriz para identidade (sem zoom, sem pan)
2. Preenche todo o canvas com `BG_COLOR` (`#0a0a0a` — preto quase puro)

Essa limpeza é necessária porque `drawImage()` não apaga pixels — sem o reset, frames anteriores ficariam visíveis nas áreas não cobertas.

### Passo 2 — Early return se não há cache

```ts
if (!rasterCache.low) return;
```

Se o rasterizer ainda não produziu o tier low, não há nada para desenhar.

### Passo 3 — Helper setCamera()

```ts
const setCamera = () => {
  ctx.setTransform(
    camera.scale * dpr, 0, 0, camera.scale * dpr,
    camera.translateX * dpr, camera.translateY * dpr
  );
};
```

Aplica a transformação da câmera no contexto 2D, multiplicada pelo DPR. A cada `drawImage()` chamado após `setCamera()`, o conteúdo é desenhado na posição e zoom corretos.

A matriz aplicada é:

$$
\begin{bmatrix} scale \cdot dpr & 0 & tx \cdot dpr \\ 0 & scale \cdot dpr & ty \cdot dpr \\ 0 & 0 & 1 \end{bmatrix}
$$

### Passo 4a — Modo root (nav.focusedId === null)

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

Quando nenhuma região está focada:
1. Calcula o `stretchFactor` — quanto o tier low está sendo "esticado"
2. Se o esticamento > 1.5×, troca para o tier `mid` (se disponível)
3. Aplica a câmera e desenha a imagem rasterizada

O `drawImage(source, 0, 0, svgWidth, svgHeight)` desenha no espaço SVG — a matriz da câmera converte para espaço de canvas automaticamente.

### Passo 4b — Modo focado (nav.focusedId !== null)

```ts
else {
  // 1. Desenhar fundo com dimming
  setCamera();
  ctx.globalAlpha = DIM_ALPHA;
  ctx.drawImage(rasterCache.low!, 0, 0, svgWidth, svgHeight);
  ctx.globalAlpha = 1.0;

  // 2. Desenhar tile dinâmico da região focada (se disponível)
  const dyn = dynamicCache.get(nav.focusedId);
  if (dyn) {
    setCamera();
    const pad = dyn.padding ?? 0;
    const viewBoxW = dyn.bbox.width  + pad * 2;
    const viewBoxH = dyn.bbox.height + pad * 2;
    ctx.drawImage(
      dyn.canvas,
      0, 0, dyn.canvas.width, dyn.canvas.height,
      dyn.bbox.x - pad,
      dyn.bbox.y - pad,
      viewBoxW,
      viewBoxH
    );
  } else {
    // Fallback: desenhar SVG inteiro com seleção de tier
    const currentPhysicalWidth = svgWidth * camera.scale;
    const stretchFactor = currentPhysicalWidth / rasterCache.low!.width;
    const fgSource = stretchFactor > 1.5
      ? (rasterCache.mid ?? rasterCache.low!)
      : rasterCache.low!;
    setCamera();
    ctx.drawImage(fgSource, 0, 0, svgWidth, svgHeight);
  }
}
```

Quando uma região está focada, há duas camadas visuais:

#### Camada 1 — Fundo dimmed (escurecido)

O SVG inteiro é desenhado com `globalAlpha = DIM_ALPHA` (0.15). Isso cria um efeito de "escurecer tudo" que dá contexto visual sem distrair.

#### Camada 2 — Região em destaque

Se o `dynamicCache` contém um tile para a região focada, este é desenhado a opacidade total **por cima** do fundo dimmed:

- `dyn.canvas` — canvas pré-rasterizado apenas com a região focada em alta resolução
- `dyn.bbox` — posição da região no espaço SVG
- `dyn.padding` — margem extra ao redor da região

Se o tile dinâmico ainda não está pronto, um fallback desenha o SVG inteiro (sem dim) como placeholder.

### Passo 5 — Reset final

```ts
ctx.setTransform(1, 0, 0, 1, 0, 0);
```

Reseta a transformação para identidade. Isso garante que qualquer desenho subsequente (HUD, overlays) use coordenadas de canvas diretas.

## Como o dynamicCache funciona para highlight

O `dynamicCache` é um `Map<string, DynamicTile>` preenchido pelo `rasterizer.ts`:

```ts
interface DynamicTile {
  canvas: HTMLCanvasElement;  // Canvas com a região rasterizada em alta res
  bbox: BBox;                 // Posição/dimensões no espaço SVG
  scale: number;              // Scale usado na rasterização
  padding: number;            // Margem extra em pixels SVG
}
```

Quando o usuário faz drill-down:
1. O `rasterizer` recorta e re-rasteriza apenas a região focada em alta resolução
2. O tile é armazenado no `dynamicCache`
3. O `render()` desenha esse tile por cima do fundo dimmed

## Parâmetros

| Parâmetro      | Tipo                           | Descrição                              |
|----------------|--------------------------------|----------------------------------------|
| `nav`          | `NavState`                     | Estado de navegação (nível, foco)      |
| `camera`       | `Camera`                       | Estado da câmera (scale, translate)    |
| `rasterCache`  | `RasterCache`                  | Tiers low/mid pré-rasterizados         |
| `dynamicCache` | `Map<string, DynamicTile>`     | Tiles dinâmicos por região focada      |
| `_regions`     | `Map<string, Region>`          | Mapa de regiões (não usado atualmente) |
| `svgWidth`     | `number`                       | Largura do SVG                         |
| `svgHeight`    | `number`                       | Altura do SVG                          |

## Retorno

`void` — desenha diretamente no canvas.

## Exemplos de uso

```ts
// main.ts — no loop de renderização
function tick() {
  animateCamera(camera, target);
  renderer.render(nav, camera, rasterCache, dynamicCache, regions, svgWidth, svgHeight);
  hud.draw(nav, regions);
  requestAnimationFrame(tick);
}
```

## Dependências

| Direção    | Módulo           | Relação                                    |
|------------|------------------|--------------------------------------------|
| Importa    | `types.ts`       | `BG_COLOR` (#0a0a0a), `DIM_ALPHA` (0.15)  |
| Depende de | `camera.ts`      | Lê scale/translateX/translateY             |
| Depende de | `rasterizer.ts`  | Consome RasterCache e DynamicTile           |
| Chamado por | `main.ts`       | A cada frame no loop rAF                   |

## Decisões arquiteturais

### Por que globalAlpha para dimming?

Alternativas seriam:
- `ctx.fillRect()` com cor semi-transparente sobre a imagem → requer composição manual
- Shader/filter → não disponível em Canvas 2D

`globalAlpha` é a forma mais simples e performante de escurecer no Canvas 2D. Setar `globalAlpha = 0.15` antes do `drawImage()` faz a imagem inteira ficar 85% transparente (escurecida).

### Por que _regions não é usado?

O parâmetro `_regions` está na assinatura para futura extensão (ex: desenhar bordas das regiões), mas atualmente não é utilizado. O underscore prefixo sinaliza isso.

### Por que setCamera() é um closure local?

O `setCamera()` é chamado 1-2 vezes por frame. Defini-lo como closure captura `ctx`, `camera` e `dpr` sem precisar passá-los como parâmetros. É mais limpo que repetir a chamada `ctx.setTransform(camera.scale * dpr, 0, 0, ...)` várias vezes.
