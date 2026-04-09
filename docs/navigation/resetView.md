# resetView() — Voltar à visão geral

## O que faz

Restaura o estado de navegação para ROOT e calcula uma câmera que enquadra o SVG inteiro no canvas. Limpa **todo** o histórico de navegação de uma vez.

```ts
export function resetView(
  nav: NavState,
  target: Camera,
  svgWidth: number,
  svgHeight: number,
  canvasW: number,
  canvasH: number
): void {
  nav.history = [];
  nav.level = -1;
  nav.focusedId = null;

  const fit = bboxToCamera(
    { x: 0, y: 0, width: svgWidth, height: svgHeight },
    canvasW, canvasH
  );
  target.setTransform(
    fit.scale,
    fit.translateX,
    fit.translateY
  );
}
```

## Por que existe

O `drillUp()` volta **um nível**. Se o usuário está 3 níveis de profundidade, precisaria de 3 drill-ups para voltar ao ROOT. O `resetView()` é um atalho — volta **direto** ao ROOT, independente de quantos níveis de profundidade o usuário navegou.

## Diferença entre drillUp e resetView

| Aspecto           | `drillUp()`                    | `resetView()`                   |
|-------------------|--------------------------------|---------------------------------|
| Volta             | 1 nível                       | Direto para ROOT                |
| Câmera            | Restaura snapshot salvo        | Recalcula para SVG inteiro      |
| Histórico         | Pop do último estado           | Limpa pilha inteira             |
| Animação          | Para posição anterior exata    | Para visão geral centralizada   |
| Atalho            | ESC, click em área vazia       | Tecla "R"                       |

## Como funciona

### Passo 1 — Limpar pilha de histórico

```ts
nav.history = [];
```

Descarta todos os snapshots salvos. Isso é intencional — ao resetar, o usuário indica que quer "começar de novo", não que quer voltar passo a passo.

### Passo 2 — Resetar NavState

```ts
nav.level = -1;
nav.focusedId = null;
```

Level `-1` é o sentinel para ROOT. `focusedId = null` indica que nenhuma região está em foco.

### Passo 3 — Calcular câmera para SVG inteiro

```ts
const fit = bboxToCamera(
  { x: 0, y: 0, width: svgWidth, height: svgHeight },
  canvasW, canvasH
);
target.setTransform(fit.scale, fit.translateX, fit.translateY);
```

Usa `bboxToCamera()` com o bbox do documento inteiro — idêntico ao que `fitToCanvas()` faz. O resultado é uma câmera que mostra o SVG completo centralizado com padding de 90%.

## Quando é chamado

### Tecla "R"

```ts
// events.ts
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'r' || e.key === 'R') {
    onReset();
  }
});
```

### Callback no main.ts

```ts
function onReset(): void {
  resetView(nav, target, svgWidth, svgHeight,
    window.innerWidth, window.innerHeight);
  isAnimating = true;
  needsRedraw = true;
}
```

## Parâmetros

| Parâmetro   | Tipo       | Descrição                              |
|-------------|------------|----------------------------------------|
| `nav`       | `NavState` | Estado de navegação (mutado in-place)  |
| `target`    | `Camera`   | Câmera-alvo (setada para animação)     |
| `svgWidth`  | `number`   | Largura do SVG                         |
| `svgHeight` | `number`   | Altura do SVG                          |
| `canvasW`   | `number`   | Largura atual do canvas                |
| `canvasH`   | `number`   | Altura atual do canvas                 |

## Retorno

`void` — muta `nav` e `target` in-place.

## Dependências

| Direção    | Módulo        | Relação                              |
|------------|---------------|--------------------------------------|
| Importa    | `camera.ts`   | `bboxToCamera()` para recalcular fit |
| Importa    | `types.ts`    | `NavState`, `Camera`                 |
| Chamado por | `main.ts`    | Via callback `onReset`              |

## Decisões arquiteturais

### Por que recalcular a câmera em vez de salvar a câmera ROOT?

O canvas pode ter sido redimensionado (resize) desde o último estado ROOT. Recalcular com as dimensões atuais (`canvasW`, `canvasH`) garante que o fit seja correto para o tamanho atual da janela.

### Por que limpar o histórico inteiro?

Manter o histórico após reset permitiria drill-up "fantasma" — o usuário voltaria a estados que não fazem sentido no contexto do reset. Limpar garante um estado limpo.
