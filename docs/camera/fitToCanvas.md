# fitToCanvas() — Enquadrar SVG inteiro no canvas

## O que faz

Calcula uma câmera que faz o SVG inteiro caber na tela, centralizado e com padding. É um atalho para `bboxToCamera()` onde o bbox é o documento SVG completo.

```ts
export function fitToCanvas(
  svgWidth: number, svgHeight: number,
  canvasW: number, canvasH: number
): Camera {
  return bboxToCamera(
    { x: 0, y: 0, width: svgWidth, height: svgHeight },
    canvasW, canvasH
  );
}
```

## Por que existe

É uma **convenience function** que encapsula o caso de uso mais comum: "mostre o SVG inteiro". Sem ela, todo chamador precisaria construir o bbox `{ x: 0, y: 0, width: svgWidth, height: svgHeight }` manualmente.

## Como funciona

1. Cria um `BBox` com `x: 0, y: 0` (canto superior-esquerdo do SVG) e as dimensões completas do SVG.
2. Delega para `bboxToCamera()`, que calcula scale e translação para centralizar esse bbox no canvas.
3. O padding de 90% de `bboxToCamera()` é herdado — o SVG fica com margens.

### Cálculo efetivo

Para um SVG de 1000×800 em um canvas de 1920×1080:

```
scaleX = (1920 × 0.90) / 1000 = 1.728
scaleY = (1080 × 0.90) / 800  = 1.215
scale  = min(1.728, 1.215)    = 1.215

translateX = 1920/2 - (0 + 1000/2) × 1.215 = 960 - 607.5  = 352.5
translateY = 1080/2 - (0 + 800/2)  × 1.215 = 540 - 486     = 54
```

Resultado: `{ scale: 1.215, translateX: 352.5, translateY: 54 }`

## Parâmetros

| Parâmetro   | Tipo     | Descrição                                |
|-------------|----------|------------------------------------------|
| `svgWidth`  | `number` | Largura total do documento SVG           |
| `svgHeight` | `number` | Altura total do documento SVG            |
| `canvasW`   | `number` | Largura atual do canvas em pixels        |
| `canvasH`   | `number` | Altura atual do canvas em pixels         |

## Retorno

| Tipo     | Descrição                                        |
|----------|--------------------------------------------------|
| `Camera` | Plain object `{ scale, translateX, translateY }` |

## Exemplos de uso

### No carregamento inicial

```ts
// main.ts — após carregar e rasterizar o SVG
const initialCamera = fitToCanvas(svgWidth, svgHeight, canvas.width, canvas.height);
target = initialCamera;
camera.setTransform(initialCamera.scale, initialCamera.translateX, initialCamera.translateY);
```

### No resetView

```ts
// navigation.ts — quando o usuário quer voltar à visão geral
export function resetView(svgWidth: number, svgHeight: number, canvasW: number, canvasH: number) {
  const cam = fitToCanvas(svgWidth, svgHeight, canvasW, canvasH);
  // ... setar target para cam, iniciar animação
}
```

## Dependências

| Direção    | Módulo           | Relação                                  |
|------------|------------------|------------------------------------------|
| Chama      | `bboxToCamera()` | Delega todo o cálculo                    |
| Chamado por | `main.ts`       | No carregamento inicial do SVG           |
| Chamado por | `navigation.ts` | No `resetView()` / botão "voltar ao início" |

## Decisões arquiteturais

### Por que uma função separada?

Mesmo sendo um one-liner, `fitToCanvas()` melhora a legibilidade do código chamador. Comparar:

```ts
// ✅ Intenção clara
const cam = fitToCanvas(svgWidth, svgHeight, canvasW, canvasH);

// ❌ Requer ler os argumentos para entender
const cam = bboxToCamera({ x: 0, y: 0, width: svgWidth, height: svgHeight }, canvasW, canvasH);
```

### Por que reutiliza bboxToCamera() em vez de implementar separadamente?

O cálculo é idêntico — só muda o bbox de entrada. Duplicar a lógica criaria risco de divergência se o padding ou a fórmula de centralização mudarem no futuro.
