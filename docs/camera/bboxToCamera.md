# bboxToCamera() — Converter bounding box em transformação de câmera

## O que faz

Recebe um **bounding box** (retângulo delimitador) e as dimensões do canvas, e retorna uma câmera (`{ scale, translateX, translateY }`) que centraliza e enquadra aquele retângulo na tela com um padding de 90%.

```ts
export function bboxToCamera(
  bbox: BBox, canvasW: number, canvasH: number
): Camera
```

## Por que existe

Quando o usuário faz **drill-down** numa região do SVG, o sistema precisa calcular "qual zoom e posição fariam essa região ocupar a tela inteira?". O `bboxToCamera()` é esse cálculo — transforma uma descrição geométrica (bbox) numa descrição de câmera.

## Como funciona

### Passo 1 — Padding

```ts
const padding = 0.90;
```

O valor 0.90 (90%) significa que a região vai ocupar 90% da largura ou altura do canvas, deixando 5% de margem de cada lado. Isso evita que a região encoste nas bordas, melhorando a legibilidade.

### Passo 2 — Calcular scale

```ts
const scaleX = (canvasW * padding) / bbox.width;
const scaleY = (canvasH * padding) / bbox.height;
const scale = Math.min(scaleX, scaleY);
```

1. `scaleX` — zoom necessário para a largura da bbox caber na largura do canvas
2. `scaleY` — zoom necessário para a altura da bbox caber na altura do canvas
3. `Math.min` — usa o menor dos dois para não cortar nenhum eixo (fit, não fill)

### Passo 3 — Calcular translação

```ts
const translateX = canvasW / 2 - (bbox.x + bbox.width / 2) * scale;
const translateY = canvasH / 2 - (bbox.y + bbox.height / 2) * scale;
```

A fórmula centraliza o **centro da bbox** no **centro do canvas**:

1. `bbox.x + bbox.width / 2` → coordenada X do centro da bbox no espaço SVG
2. `(...) * scale` → converte para espaço de canvas
3. `canvasW / 2 - (...)` → desloca para que o centro fique no meio do canvas

### Passo 4 — Retornar plain object

```ts
return { scale, translateX, translateY };
```

Retorna um plain object compatível com a interface `Camera`, **não** uma instância da classe `Camera`. Este retorno é usado como **target** para `animateCamera()`.

## O que é BBox

```ts
export interface BBox {
  x: number;       // coordenada X do canto superior-esquerdo
  y: number;       // coordenada Y do canto superior-esquerdo
  width: number;   // largura em unidades SVG
  height: number;  // altura em unidades SVG
}
```

Cada `Region` do SVG parsed contém um `bbox` que descreve sua posição e dimensões no espaço de coordenadas do SVG.

## Parâmetros

| Parâmetro | Tipo     | Descrição                              |
|-----------|----------|----------------------------------------|
| `bbox`    | `BBox`   | Retângulo delimitador da região-alvo   |
| `canvasW` | `number` | Largura atual do canvas em pixels      |
| `canvasH` | `number` | Altura atual do canvas em pixels       |

## Retorno

| Tipo     | Descrição                                         |
|----------|---------------------------------------------------|
| `Camera` | Plain object `{ scale, translateX, translateY }`  |

## Exemplos de uso

### No drill-down

```ts
// navigation.ts — ao clicar numa região
const region = regions.get(regionId);
const newCamera = bboxToCamera(region.bbox, canvas.width, canvas.height);
target = newCamera; // animateCamera() vai interpolar até aqui
```

### No fitToCanvas (SVG inteiro)

```ts
// fitToCanvas() delega para bboxToCamera() com bbox = SVG inteiro
return bboxToCamera(
  { x: 0, y: 0, width: svgWidth, height: svgHeight },
  canvasW, canvasH
);
```

## Dependências

| Direção    | Módulo          | Relação                                   |
|------------|-----------------|-------------------------------------------|
| Importa    | `types.ts`      | Interface `BBox`                          |
| Chamado por | `navigation.ts` | `drillDown()` usa para calcular target   |
| Chamado por | `fitToCanvas()` | Delega com bbox do SVG inteiro           |
| Produz     | `Camera` (interface) | Target para `animateCamera()`        |

## Decisões arquiteturais

### Por que padding 0.90 e não 1.0?

Sem padding, a região fica colada nas bordas do canvas. Com 10% de margem:
- Elementos na borda da região ficam visíveis
- HUD e overlays não cobrem conteúdo importante
- A experiência visual é mais confortável

### Por que Math.min e não Math.max?

`Math.min` garante **fit** (tudo visível), `Math.max` faria **fill** (preenche mas corta). Como o objetivo é mostrar a região inteira para o usuário navegar, fit é a escolha correta.

### Por que retorna plain object e não instância de Camera?

O resultado é um **target imutável** — a animação só precisa ler `scale`, `translateX`, `translateY`. Instanciar uma classe `Camera` completa (com Dirty Flag, inversão de matriz) seria desperdício para um objeto que nunca terá `setTransform()` chamado.
