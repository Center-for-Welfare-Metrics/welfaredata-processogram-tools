# parseSvg() — Extração de regiões e dimensões do SVG

## O que faz

Recebe o texto bruto de um arquivo SVG, injeta-o no DOM do browser, extrai as dimensões do documento, identifica todas as regiões navegáveis (com IDs válidos), calcula seus bounding boxes globais, e retorna um `ParseResult` com tudo pronto para o sistema usar.

```ts
export function parseSvg(svgText: string): ParseResult
```

## Por que existe

O `parseSvg()` é a **fonte de verdade** de três informações críticas:

1. **Dimensões do SVG** (`svgWidth`, `svgHeight`) — usadas pela câmera, hitmap e rasterizer
2. **Mapa de regiões** (`regions`) — define o que é clicável, sua posição e hierarquia
3. **IDs suspeitos** (`suspiciousIds`) — alerta sobre elementos que provavelmente não deveriam ser regiões

## Como funciona

### Passo 1 — Injeção no DOM (off-screen)

```ts
const container = document.createElement('div');
container.style.position = 'absolute';
container.style.left = '-99999px';
container.style.width = '0';
container.style.height = '0';
container.style.overflow = 'hidden';
container.innerHTML = svgText;
document.body.appendChild(container);
```

O SVG é injetado num `<div>` invisível, posicionado fora da tela. Isso é necessário porque o browser precisa **renderizar** o SVG para que APIs como `getBBox()` e `getCTM()` funcionem — elas dependem do SVG estar no DOM layout.

### Passo 2 — Extração de dimensões (prioridade viewBox)

```ts
const viewBox = svgRoot.getAttribute('viewBox');
if (viewBox) {
  const parts = viewBox.split(/[\s,]+/).map(Number);
  svgWidth = parts[2];
  svgHeight = parts[3];
} else {
  svgWidth = parseFloat(svgRoot.getAttribute('width') || '0');
  svgHeight = parseFloat(svgRoot.getAttribute('height') || '0');
}
```

**Prioridade do viewBox sobre width/height:**

O atributo `viewBox` define o sistema de coordenadas interno do SVG. Os atributos `width`/`height` definem o tamanho de exibição, que pode estar em `px`, `mm`, `pt`, etc.

- Se `viewBox` existe → usa `viewBox[2]` (width) e `viewBox[3]` (height) como dimensões. Esses valores estão em **unidades abstratas** do SVG, que é o que o parser e a hitmap precisam.
- Se não existe `viewBox` → faz fallback para `width`/`height` (que nesse caso assumem ser pixels).

**Por que parseSvg() é a fonte de verdade das dimensões:**

Todos os outros módulos (camera, hitmap, rasterizer, renderer) recebem `svgWidth` e `svgHeight` como parâmetros. Se cada um lesse do SVG independentemente, haveria risco de interpretações divergentes. Centralizar no parser elimina essa classe de bugs.

### Passo 3 — Normalização escala 1:1

```ts
const vbAttr = svgRoot.getAttribute('viewBox');
if (vbAttr) {
  const vbParts = vbAttr.trim().split(/[\s,]+/).map(Number);
  if (vbParts.length === 4 &&
      !isNaN(vbParts[2]) && vbParts[2] > 0 &&
      !isNaN(vbParts[3]) && vbParts[3] > 0) {
    svgRoot.setAttribute('width',  String(vbParts[2]));
    svgRoot.setAttribute('height', String(vbParts[3]));
  }
}
```

Quando o SVG tem `viewBox="0 0 2000 1600"` mas `width="100mm"`, o rendering scale não é 1:1. A normalização força `width=2000` e `height=1600`, fazendo com que 1 unidade SVG = 1 pixel no DOM inserido. Isso garante que `getCTM()` retorne matrizes com escala 1:1.

### Passo 4 — Iteração sobre elementos com ID

```ts
const elements = svgRoot.querySelectorAll('[id]');

for (const el of elements) {
  if (el === svgRoot) continue;
  if (el.closest('defs, symbol, clipPath, mask')) continue;
  
  const id = el.id;
  if (!isNavigable(id)) continue;
  // ...
}
```

Filtros aplicados:
- **Exclui o root SVG** — o próprio `<svg>` tem ID mas não é região
- **Exclui elementos utilitários** — `<defs>`, `<symbol>`, `<clipPath>`, `<mask>` são definições reutilizáveis, não geometria visível
- **Exclui IDs não-navegáveis** — `isNavigable()` verifica o padrão de nomenclatura

### Função isNavigable()

```ts
export function isNavigable(id: string): boolean {
  return /^.+(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i.test(id);
}
```

Um ID é navegável se termina com um sufixo de nível hierárquico:

| Sufixo | Nível | Significado                |
|--------|-------|----------------------------|
| `ps`   | 0     | Poultry Shed (aviário)     |
| `lf`   | 1     | Laying Floor (piso)        |
| `ph`   | 2     | Poultry House (galpão)     |
| `ci`   | 3     | Cage/Individual (gaiola)   |

Exemplos válidos: `shed-01--ps`, `floor_lf2`, `house--ph_3`, `cage--ci01-1`

### Passo 5 — Cálculo do bounding box global

O parser usa uma estratégia de 3 tentativas para obter o bbox no espaço global do SVG:

**Tentativa 1 — getCTM() (preferida)**

```ts
const ctm = (el as SVGGraphicsElement).getCTM?.();
// Transforma os 4 cantos da bbox local usando a matriz acumulada
const corners = [...].map(p => pt.matrixTransform(ctm));
```

`getCTM()` retorna a **Current Transformation Matrix** — acumula todos os `transform` dos ancestrais. Multiplicar os cantos do bbox local por essa matriz produz coordenadas globais. É a forma mais precisa depois da normalização.

**Tentativa 2 — getScreenCTM() relativo (fallback)**

```ts
const relativeCTM = rootScreen.inverse().multiply(elScreen);
```

Se `getCTM()` retorna `null`, usa `getScreenCTM()` de ambos (elemento e root) e calcula a transformação relativa. Isso anula a escala do viewport preservando apenas os transforms internos do SVG.

**Tentativa 3 — bbox local puro (último recurso)**

```ts
globalBbox = {
  x: localBbox.x, y: localBbox.y,
  width: localBbox.width, height: localBbox.height,
};
```

Sem nenhuma transformação. Correto apenas para elementos sem `transform` nos ancestrais.

### Passo 6 — strokePadding

```ts
let strokePadding = 15; // fallback seguro
try {
  const computed = getComputedStyle(el as Element);
  const sw = parseFloat(computed.strokeWidth || '0');
  if (!isNaN(sw) && sw > 0) {
    strokePadding = Math.ceil(sw / 2) + 4;
  }
} catch (_) {}
```

O `strokeWidth` afeta o tamanho visual da região mas não é refletido pelo `getBBox()`. O `strokePadding` é armazenado como margem extra para o `DynamicTile` (rasterizer) saber quanto expandir ao recortar a região.

### Passo 7 — parentId (ancestral navegável mais próximo)

```ts
let parentId: string | null = null;
let parent = el.parentElement;
while (parent && parent !== (svgRoot as Element)) {
  if (parent.id && isNavigable(parent.id)) {
    parentId = parent.id;
    break;
  }
  parent = parent.parentElement;
}
```

Sobe a árvore DOM até encontrar o primeiro ancestral com ID navegável. Isso determina a hierarquia para drill-down/drill-up:
- `shed-01--ps` → `parentId: null` (raiz)
- `floor-01--lf` dentro de `shed-01--ps` → `parentId: "shed-01--ps"`

### Passo 8 — Construção da Region e cleanup

```ts
regions.set(id, { id, bbox: globalBbox, level, alias, parentId, strokePadding });
// ...
document.body.removeChild(container);
const suspiciousIds = auditRegions(regions);
return { regions, svgWidth, svgHeight, suspiciousIds };
```

Após processar todos os elementos, o container off-screen é removido e `auditRegions()` é chamado para sinalizar IDs suspeitos.

## Parâmetros

| Parâmetro | Tipo     | Descrição                        |
|-----------|----------|----------------------------------|
| `svgText` | `string` | Código-fonte SVG completo        |

## Retorno

```ts
export interface ParseResult {
  regions: Map<string, Region>;  // Mapa de regiões navegáveis
  svgWidth: number;               // Largura do SVG (unidades abstratas)
  svgHeight: number;              // Altura do SVG (unidades abstratas)
  suspiciousIds: string[];        // IDs que matcharam padrões de audit
}
```

## Exemplos de uso

```ts
// main.ts
const parsed = parseSvg(svgText);
regions = parsed.regions;
svgWidth = parsed.svgWidth;
svgHeight = parsed.svgHeight;
// parsed.suspiciousIds → exibir toast
```

## Dependências

| Direção    | Módulo       | Relação                              |
|------------|-------------|--------------------------------------|
| Importa    | `types.ts`   | Interfaces `Region`, `BBox`          |
| Importa    | `audit.ts`   | `auditRegions()` para IDs suspeitos  |
| Chamado por | `main.ts`   | No início de `handleFile()`          |
| Produz dados para | Todos os módulos | `svgWidth/svgHeight` e `regions` |

## Decisões arquiteturais

### Por que injetar no DOM e não usar DOMParser?

`DOMParser` cria um documento **isolado** — sem layout, sem CSS, sem `getBBox()`. O browser precisa do SVG no DOM real para calcular geometria. O container off-screen (`left: -99999px`) garante que o SVG é renderizado sem ser visível.

### Por que normalizar width/height via viewBox?

A normalização garante que `getCTM()` retorne matrizes em escala 1:1 (unidade SVG = pixel). Sem isso, um SVG com `viewBox="0 0 2000 1600"` e `width="100mm"` teria um `getCTM()` com escala `0.05`, e os bboxes ficariam em unidades erradas.

### Por que 3 fallbacks para bbox?

Browsers têm bugs e inconsistências com `getCTM()` e `getScreenCTM()` em edge cases (SVGs com nested viewBoxes, `<use>`, etc.). As 3 tentativas garantem robustez: a mais precisa é tentada primeiro, com fallbacks progressivamente mais simples.
