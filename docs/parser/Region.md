# Region — Interface de região navegável

## O que faz

A interface `Region` descreve uma **região clicável** do SVG — um grupo (`<g>`) com ID válido que o usuário pode selecionar para drill-down. Cada Region carrega todas as informações necessárias para posicionamento, hierarquia e renderização.

```ts
export interface Region {
  id: string;
  bbox: BBox;
  level: number;
  alias: string;
  parentId: string | null;
  strokePadding: number;
}
```

## Cada campo explicado

### `id: string`

O ID original do elemento SVG. Deve seguir o padrão de nomenclatura com sufixo de nível.

Exemplos: `"shed-01--ps"`, `"floor-main_lf"`, `"house-A--ph2"`, `"cage-01--ci1-3"`

### `bbox: BBox`

Bounding box da região no **espaço de coordenadas global** do SVG (após aplicar transforms de ancestrais).

```ts
export interface BBox {
  x: number;       // Coordenada X do canto superior-esquerdo
  y: number;       // Coordenada Y do canto superior-esquerdo
  width: number;   // Largura em unidades SVG
  height: number;  // Altura em unidades SVG
}
```

Usado por:
- `bboxToCamera()` — para calcular zoom e posição ao focar a região
- `buildDynamicTile()` — para recortar e rasterizar apenas a região
- `HitMap` — indiretamente, via posição geométrica no canvas colorido

### `level: number`

Nível hierárquico da região, derivado do sufixo do ID:

| Sufixo | Level | Nome completo          | Sigla |
|--------|-------|------------------------|-------|
| `ps`   | 0     | Poultry Shed           | ps    |
| `lf`   | 1     | Laying Floor           | lf    |
| `ph`   | 2     | Poultry House          | ph    |
| `ci`   | 3     | Cage/Individual        | ci    |

A extração é feita pela função `getLevelIndex()`:

```ts
export function getLevelIndex(id: string): number {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  const alias = match?.[1]?.toLowerCase();
  return { ps: 0, lf: 1, ph: 2, ci: 3 }[alias ?? ''] ?? -1;
}
```

O nível determina:
- Em qual **layer da hitmap** a região é rasterizada
- Qual é o **próximo nível** de drill-down (`targetLevel = level + 1`)
- A exibição no HUD (`LEVEL_NAMES[level]`)

### `alias: string`

O sufixo de nível em minúsculas: `"ps"`, `"lf"`, `"ph"` ou `"ci"`. Extraído por:

```ts
export function getAlias(id: string): string {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  return match?.[1]?.toLowerCase() ?? '';
}
```

Usado na tooltip para exibir o tipo da região junto com o ID.

### `parentId: string | null`

ID da **região ancestral navegável mais próxima** na hierarquia DOM do SVG. `null` se a região é raiz (não tem ancestral navegável).

Determinação: o parser sobe a árvore DOM a partir do elemento, procurando o primeiro ancestral com `isNavigable(id) === true`.

```ts
let parentId: string | null = null;
let parent = el.parentElement;
while (parent && parent !== svgRoot) {
  if (parent.id && isNavigable(parent.id)) {
    parentId = parent.id;
    break;
  }
  parent = parent.parentElement;
}
```

O `parentId` é usado por:
- `HitMap.getRegionAt()` — no modo ROOT, filtra por `parentId === null`; no modo FOCADO, filtra por `parentId === nav.focusedId`
- `navigation.drillDown()` — para construir o path da raiz até o alvo

### `strokePadding: number`

Margem extra em pixels SVG ao redor do bbox, derivada do `stroke-width` do elemento. Garante que ao recortar a região para o `DynamicTile`, as bordas do stroke não sejam cortadas.

```ts
let strokePadding = 15; // fallback seguro
const sw = parseFloat(computed.strokeWidth || '0');
if (!isNaN(sw) && sw > 0) {
  strokePadding = Math.ceil(sw / 2) + 4; // metade + margem
}
```

## Exemplos concretos com IDs reais do Hatchery

### SVG de Hatchery típico

```
<svg viewBox="0 0 2000 1600">
  <g id="shed-north--ps">          <!-- Aviário Norte -->
    <g id="floor-01_lf">           <!-- Piso 01 -->
      <g id="house-A--ph2">        <!-- Galpão A -->
        <g id="cage-01--ci1-3">    <!-- Gaiola 01 -->
          <rect .../>
        </g>
        <g id="cage-02--ci1-4">
          <rect .../>
        </g>
      </g>
    </g>
  </g>
  <g id="shed-south--ps">          <!-- Aviário Sul -->
    ...
  </g>
</svg>
```

### Mapa de regiões resultante

| ID                 | level | alias | parentId          | strokePadding |
|--------------------|-------|-------|-------------------|---------------|
| `shed-north--ps`   | 0     | ps    | `null`            | 15            |
| `floor-01_lf`      | 1     | lf    | `shed-north--ps`  | 15            |
| `house-A--ph2`     | 2     | ph    | `floor-01_lf`     | 15            |
| `cage-01--ci1-3`   | 3     | ci    | `house-A--ph2`    | 12            |
| `cage-02--ci1-4`   | 3     | ci    | `house-A--ph2`    | 12            |
| `shed-south--ps`   | 0     | ps    | `null`            | 15            |

### Navegação resultante

1. **Visão root** → hitmap mostra `shed-north--ps` e `shed-south--ps` (parentId === null)
2. **Drill-down em `shed-north--ps`** → hitmap mostra `floor-01_lf` (parentId === "shed-north--ps")
3. **Drill-down em `floor-01_lf`** → hitmap mostra `house-A--ph2` (parentId === "floor-01_lf")
4. **Drill-down em `house-A--ph2`** → hitmap mostra `cage-01--ci1-3`, `cage-02--ci1-4` (parentId === "house-A--ph2")

## Dependências

| Direção    | Módulo           | Relação                                     |
|------------|------------------|---------------------------------------------|
| Definida em | `types.ts`      | Interface exportada                         |
| Produzida por | `parser.ts`   | `parseSvg()` popula `Map<string, Region>`  |
| Consumida por | `hitmap.ts`   | Para construir layers e verificar parentId |
| Consumida por | `navigation.ts` | Para calcular path e bbox no drill-down  |
| Consumida por | `rasterizer.ts` | Para construir DynamicTile              |
| Consumida por | `events.ts`    | Para exibir tooltip com alias             |
