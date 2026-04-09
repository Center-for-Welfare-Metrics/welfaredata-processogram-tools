# events — resize handler

## O que faz

O handler de `resize` recalcula as dimensões do canvas quando a janela do browser é redimensionada, aplicando o **Device Pixel Ratio (DPR)** para manter nitidez em ecrãs HiDPI (Retina), e sinaliza a necessidade de re-render via callback `onNeedsRedraw()`.

## Por que existe

O canvas HTML tem duas dimensões independentes:

1. **Dimensão do buffer** (`canvas.width` / `canvas.height`) — resolução real em pixels
2. **Dimensão CSS** (`canvas.style.width` / `canvas.style.height`) — tamanho visual no layout

Se apenas a dimensão CSS mudar (por resize da janela), o canvas estica a imagem existente em vez de re-renderizar com a resolução correcta. O handler garante que ambas são actualizadas em sincronia.

## Como funciona

```
Window resize
  │
  ├─ Ler dimensões da janela
  │    w = window.innerWidth
  │    h = window.innerHeight
  │    dpr = window.devicePixelRatio || 1
  │
  ├─ Actualizar dimensões do buffer (× DPR)
  │    canvas.width  = w * dpr
  │    canvas.height = h * dpr
  │
  ├─ Actualizar dimensões CSS (sem DPR)
  │    canvas.style.width  = w + 'px'
  │    canvas.style.height = h + 'px'
  │
  └─ onNeedsRedraw()
       └─ sinaliza camera.dirty = true (em main.ts)
```

## Código fonte

```ts
window.addEventListener('resize', () => {
  console.log('[resize event]', {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    canvasWBefore: canvas.width,
    canvasHBefore: canvas.height,
  });

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

## Parâmetros utilizados

| Parâmetro | Papel |
|---|---|
| `canvas` | Alvo — dimensões do buffer e CSS são actualizadas |
| `onNeedsRedraw` | Callback invocado após redimensionamento — em `main.ts` faz `camera.dirty = true` |

## Cálculo DPR

O **Device Pixel Ratio** é a razão entre pixels físicos e pixels CSS:

| Cenário | DPR | Canvas 1920×1080 |
|---|---|---|
| Monitor standard | 1.0 | buffer = 1920×1080 |
| Retina / HiDPI | 2.0 | buffer = 3840×2160 |
| Windows 150% scale | 1.5 | buffer = 2880×1620 |

O buffer recebe `w * dpr` e `h * dpr` para que cada pixel CSS corresponda a `dpr²` pixels reais, mantendo a nitidez do rendering.

O estilo CSS mantém `w` e `h` sem multiplicação para que o canvas ocupe exactamente a janela visível.

## Exemplo de uso concreto

```
Cenário: utilizador redimensiona a janela de 1920×1080 para 1280×720
         monitor com DPR = 1.5

1. Antes do resize:
   canvas.width = 2880, canvas.height = 1620
   canvas.style.width = "1920px", canvas.style.height = "1080px"

2. Resize dispara:
   w = 1280, h = 720, dpr = 1.5
   canvas.width = 1920, canvas.height = 1080
   canvas.style.width = "1280px", canvas.style.height = "720px"

3. onNeedsRedraw() → camera.dirty = true
   → próximo frame re-renderiza com as novas dimensões
```

## Dependências

| Módulo | Utilização |
|---|---|
| Nenhum | O handler utiliza apenas APIs do browser (`window`, `canvas`) e o callback injectado |

## Decisões arquitecturais

1. **Listener em `window`** — O evento `resize` é registado no `window`, não no `canvas`, porque o canvas não tem evento de resize próprio.

2. **Fullscreen assumed** — As dimensões usam `window.innerWidth/Height` directamente, assumindo que o canvas ocupa 100% da janela. Não há margem nem offset.

3. **Sem debounce** — O handler executa em cada evento de resize. Isto é aceitável porque o handler é leve (apenas atribui 4 propriedades e invoca um callback). O re-render real acontece no próximo `requestAnimationFrame`, que naturalmente coalece múltiplos resizes no mesmo frame.

4. **Fallback de DPR** — `window.devicePixelRatio || 1` garante que o handler funciona em browsers que não suportam a propriedade (valor fallback = 1).

5. **Console.log de diagnóstico** — Regista dimensões antes e depois do resize para debugging, incluindo o DPR actual.
