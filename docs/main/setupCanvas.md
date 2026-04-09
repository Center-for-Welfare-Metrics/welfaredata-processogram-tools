# setupCanvas() — Dimensionamento do canvas principal

## O que faz

Configura as dimensões do canvas HTML para preencher a tela inteira, respeitando o Device Pixel Ratio, e instancia o `Renderer`.

```ts
function setupCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  mainCanvas.width = w * dpr;
  mainCanvas.height = h * dpr;
  mainCanvas.style.width = w + 'px';
  mainCanvas.style.height = h + 'px';
  renderer = new Renderer(mainCanvas);
}
```

## Por que existe

O canvas HTML tem duas dimensões independentes que devem ser coordenadas:

1. **Dimensão CSS** (`style.width/height`) — define o tamanho visual na página
2. **Dimensão do buffer** (`canvas.width/height`) — define quantos pixels reais o canvas tem

Para telas HiDPI (Retina), o buffer deve ser maior que o tamanho CSS. Sem essa configuração, o conteúdo ficaria borrado.

## Como funciona

### Relação entre canvas.width e window.innerWidth

```
window.innerWidth = 1920 (pixels CSS)
devicePixelRatio = 2 (tela Retina)

canvas.style.width  = "1920px"  → ocupa 1920px CSS na tela
canvas.style.height = "1080px"  → ocupa 1080px CSS na tela
canvas.width  = 3840            → buffer tem 3840 pixels reais
canvas.height = 2160            → buffer tem 2160 pixels reais
```

O resultado: o canvas ocupa 1920×1080 na tela mas tem 3840×2160 pixels de resolução — nítido em tela Retina.

O `Renderer` leva o DPR em conta ao aplicar a transformação da câmera:

```ts
ctx.setTransform(
  camera.scale * dpr, 0, 0, camera.scale * dpr,
  camera.translateX * dpr, camera.translateY * dpr
);
```

### O que é DPR

| Dispositivo              | DPR | CSS 1920×1080 → Buffer         |
|--------------------------|-----|----------------------------------|
| Monitor Full HD          | 1   | 1920×1080                        |
| MacBook Retina           | 2   | 3840×2160                        |
| iPhone Pro               | 3   | 5760×3240                        |
| Monitor 4K (150% scale)  | 1.5 | 2880×1620                        |

## ResizeObserver e recálculo de câmera

O `setupCanvas()` em si é chamado uma vez, mas o `events.ts` registra um handler de resize que faz o mesmo trabalho:

```ts
// events.ts
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  onNeedsRedraw();
});
```

Quando a janela é redimensionada:
1. As dimensões do canvas são recalculadas para o novo tamanho
2. `onNeedsRedraw()` marca o frame como dirty para que o renderer redesenhe
3. **Nota**: a câmera **não** é recalculada automaticamente no resize — o conteúdo pode ficar descentralizado. O usuário pode pressionar "R" para resetar a vista.

## Parâmetros

Nenhum — usa variáveis module-scoped (`mainCanvas`, `renderer`).

## Retorno

`void` — muta `mainCanvas` e instancia `renderer`.

## Exemplos de uso

```ts
// handleFile() — durante o carregamento
setupCanvas();
// Após setupCanvas(), renderer está pronto para render()
```

## Dependências

| Direção    | Módulo          | Relação                              |
|------------|-----------------|--------------------------------------|
| Instancia  | `Renderer`      | Cria `new Renderer(mainCanvas)`      |
| Chamado por | `handleFile()` | Passo 7 da inicialização            |
| Complementado por | `events.ts` | Handler de resize faz redimensionamento contínuo |

## Decisões arquiteturais

### Por que não usar ResizeObserver no canvas?

`window.addEventListener('resize')` é suficiente porque o canvas ocupa 100% da viewport. Um `ResizeObserver` no canvas seria redundante — o canvas só muda de tamanho quando a janela muda.

### Por que instanciar Renderer aqui?

O `Renderer` recebe o canvas no constructor para extrair o contexto 2D e o DPR. Como `setupCanvas()` pode ser chamado durante resize (recriando o contexto), o Renderer é recriado junto.

### Por que não recalcular a câmera no resize?

Recalcular automaticamente (`fitToCanvas()`) descartaria o pan/zoom manual do usuário. A decisão é preservar a posição do usuário — se ficou descentralizado, o atalho "R" fornece reset explícito.
