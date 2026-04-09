# Renderer — Classe de renderização do canvas

## O que faz

A classe `Renderer` é responsável por desenhar o conteúdo visual no canvas principal. Ela aplica a transformação da câmera, seleciona o tier de rasterização adequado, e implementa o efeito de dimming/highlight quando o usuário está em modo focado.

```ts
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement) {
    this.dpr = window.devicePixelRatio || 1;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }
```

## Por que existe

Separar a lógica de renderização em uma classe dedicada mantém o `main.ts` enxuto e concentra decisões visuais (DPR, tiers, dimming) num único lugar.

## Como funciona

### DPR (Device Pixel Ratio)

```ts
this.dpr = window.devicePixelRatio || 1;
```

`devicePixelRatio` é a razão entre pixels físicos (hardware) e pixels CSS (lógicos). Em telas Retina/HiDPI, `dpr = 2` — o canvas precisa ter o dobro de pixels para ficar nítido.

O DPR é aplicado em toda transformação de câmera:

```ts
ctx.setTransform(
  camera.scale * dpr, 0, 0, camera.scale * dpr,
  camera.translateX * dpr, camera.translateY * dpr
);
```

### Contexto 2D com alpha: false

```ts
this.ctx = canvas.getContext('2d', { alpha: false })!;
```

`alpha: false` informa ao browser que o canvas é opaco — não precisa compor com o fundo da página. Isso permite otimizações internas (skip alpha blending) que melhoram a performance de renderização.

### Relação com RasterCache e Camera

- **RasterCache** (`{ low, mid }`) — contém versões pré-rasterizadas do SVG em diferentes resoluções. O Renderer seleciona qual usar com base no zoom.
- **Camera** — fornece `scale`, `translateX`, `translateY` que são aplicados via `ctx.setTransform()`.

## Propriedades

| Propriedade | Tipo                      | Descrição                          |
|-------------|---------------------------|------------------------------------|
| `ctx`       | `CanvasRenderingContext2D` | Contexto do canvas principal      |
| `dpr`       | `number`                  | Device Pixel Ratio (1, 2, 3...)   |

## Métodos

| Método           | Descrição                                      |
|------------------|-------------------------------------------------|
| `render()`       | Desenha o frame completo                        |
| `getCurrentTier()` | Retorna o tier atual baseado no zoom          |

## Dependências

| Direção    | Módulo          | Relação                                        |
|------------|-----------------|------------------------------------------------|
| Importa    | `types.ts`      | `NavState`, `Camera`, `RasterCache`, `DynamicTile`, `Region`, `BG_COLOR`, `DIM_ALPHA` |
| Usado por  | `main.ts`       | `render()` chamado a cada frame no loop rAF    |
| Depende de | `camera.ts`     | Lê `camera.scale`, `camera.translateX/Y`       |
| Depende de | `rasterizer.ts` | Consome `RasterCache` (low/mid) e `DynamicTile` |

## Decisões arquiteturais

### Por que alpha: false?

O canvas principal preenche a tela inteira com `BG_COLOR` a cada frame. Nunca há transparência. Declarar `alpha: false` elimina o overhead de composição alpha, que pode ser significativo em canvas grandes (1080p+).

### Por que DPR é armazenado uma vez no constructor?

O DPR raramente muda durante uma sessão (apenas se o usuário move a janela entre monitores). Armazenar uma vez evita leituras repetidas de `window.devicePixelRatio` — que em alguns browsers pode ser ligeiramente mais lento que uma leitura de propriedade local.

### Por que classe em vez de funções soltas?

O `ctx` e `dpr` são estado compartilhado entre `render()` e `getCurrentTier()`. Uma classe encapsula esse estado de forma natural, evitando parâmetros extras em cada chamada.
