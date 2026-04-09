# getRegionAt() — Identificar região sob um ponto

## O que faz

Dado um ponto em coordenadas de canvas (pixel na tela), retorna o **ID da região** do SVG que está sob aquele ponto, ou `null` se não há região clicável ali. Respeita o estado de navegação (ROOT vs FOCADO).

```ts
getRegionAt(
  canvasX: number,
  canvasY: number,
  camera: Camera,
  nav: { level: number; focusedId: string | null }
): string | null
```

## Por que existe

É o método central do sistema de interação. Todo clique, hover e verificação de cursor no canvas depende dele para saber "sobre o que o usuário está?" Usa lookup direto num `Int32Array` pré-computado — zero `getImageData` no hot path.

## Como funciona

### Passo 1 — Verificar se a hitmap está pronta

```ts
if (!this.ready) return null;
```

Se o `build()` ainda não completou ou nunca foi chamado, retorna `null` silenciosamente.

### Passo 2 — Conversão de coordenadas via camera.inverseMatrix

```ts
const m    = camera.inverseMatrix;
const svgX = m.a * canvasX + m.c * canvasY + m.e;
const svgY = m.b * canvasX + m.d * canvasY + m.f;
const hitX = Math.round(svgX * this.hitScale);
const hitY = Math.round(svgY * this.hitScale);
```

#### Fórmula detalhada

A multiplicação `M⁻¹ × [canvasX, canvasY, 1]` expande para:

$$
svgX = m_a \cdot canvasX + m_c \cdot canvasY + m_e
$$

$$
svgY = m_b \cdot canvasX + m_d \cdot canvasY + m_f
$$

Como a câmera não tem rotação/skew (`m.b = 0`, `m.c = 0`), simplifica para:

$$
svgX = \frac{canvasX - translateX}{scale}
$$

$$
svgY = \frac{canvasY - translateY}{scale}
$$

Depois, `svgX * hitScale` converte de coordenadas SVG para coordenadas do canvas da hitmap (que opera a 50% da resolução).

#### Por que zero-allocation?

A conversão é feita com multiplicações e somas inline — **nenhum objeto** é alocado. Isso é crítico porque `getRegionAt()` pode ser chamado a cada `mousemove` (60+ vezes por segundo). Se cada chamada alocasse um objeto `{x, y}`, o garbage collector seria pressionado.

### Passo 3 — Modo ROOT (nav.level === -1)

Quando o usuário está na visão geral (nenhuma região focada):

```ts
if (nav.level === -1) {
  for (let lvl = 0; lvl <= 3; lvl++) {
    const layer = this.layers.get(lvl);
    if (!layer || layer.colorIndex.size === 0) continue;

    if (hitX < 0 || hitY < 0 ||
        hitX >= layer.width ||
        hitY >= layer.height) continue;

    const idx = layer.pixels[hitY * layer.width + hitX];
    if (idx === -1) continue;

    const regionId = layer.colorIndex.get(idx) ?? null;
    if (!regionId) continue;

    const region = this.regionMap.get(regionId);
    if (!region) continue;

    if (region.parentId !== null) continue;

    return regionId;
  }
  return null;
}
```

O modo ROOT:
1. **Varre todas as 4 layers** em ordem crescente (0→3)
2. Para a primeira layer com pixel não-vazio (`idx !== -1`), tenta identificar a região
3. **Filtra por `parentId === null`** — só aceita regiões raiz (sem pai na hierarquia)
4. Isso suporta SVGs que começam em qualquer nível (ps, lf, ph, ou ci)

#### Lookup do pixel para regionId

```ts
const idx = layer.pixels[hitY * layer.width + hitX];
// idx = índice de cor pré-computado no build()
// -1 = transparente/vazio
```

- `idx === -1` → pixel transparente ou vazio = sem região
- `layer.colorIndex.get(idx)` → traduz o índice para o ID string da região

O lookup é O(1) — um acesso direto ao `Int32Array`, sem chamadas a `getImageData` ou criação de `Uint8ClampedArray`.

### Passo 4 — Modo FOCADO (nav.level >= 0)

Quando o usuário fez drill-down numa região:

```ts
else {
  const focusedRegion = nav.focusedId
    ? this.regionMap.get(nav.focusedId)
    : null;
  const targetLevel = focusedRegion
    ? focusedRegion.level + 1
    : nav.level + 1;

  if (targetLevel > 3) return null;

  const layer = this.layers.get(targetLevel);
  if (!layer) return null;

  // ... bounds check, lookup no idGrid ...

  if (region.parentId !== nav.focusedId) return null;

  return regionId;
}
```

O modo FOCADO:
1. Calcula `targetLevel = nível do foco + 1` (busca filhos, não irmãos)
2. Consulta **apenas a layer do próximo nível**
3. Após identificar a região, verifica `region.parentId !== nav.focusedId` — **aceita apenas filhos diretos** do elemento focado

#### Lógica de parentId

Essa verificação é essencial para navegação hierárquica correta:
- Se o usuário focou o aviário "ps-01", clicar deve retornar apenas galpões dentro de "ps-01"
- Galpões de "ps-02" que geometricamente estejam próximos são rejeitados pelo filtro de parentId

## Parâmetros

| Parâmetro | Tipo                                            | Descrição                              |
|-----------|-------------------------------------------------|----------------------------------------|
| `canvasX` | `number`                                        | Coordenada X no canvas (pixels da tela)|
| `canvasY` | `number`                                        | Coordenada Y no canvas (pixels da tela)|
| `camera`  | `Camera`                                        | Estado atual da câmera (scale + translate) |
| `nav`     | `{ level: number; focusedId: string \| null }` | Estado de navegação                    |

## Retorno

| Tipo             | Descrição                                      |
|------------------|-------------------------------------------------|
| `string \| null` | ID da região sob o ponto, ou `null` se vazio  |

## Exemplos de uso

### No click handler

```ts
// events.ts
const regionId = hitmap.getRegionAt(mouseX, mouseY, camera, nav);
if (regionId) {
  drillDown(regionId, regions, camera, target, nav, canvas);
}
```

### No hover (cursor pointer)

```ts
const hasRegion = hitmap.getRegionAt(mouseX, mouseY, camera, nav);
canvas.style.cursor = hasRegion ? 'pointer' : 'default';
```

## Dependências

| Direção    | Módulo        | Relação                                     |
|------------|---------------|---------------------------------------------|
| Usa        | `camera.inverseMatrix` | Para converter canvas → SVG         |
| Usa        | `regionMap`   | Para verificar `parentId` e `level`          |
| Chamado por | `events.ts`  | Em click e mousemove                        |

## Decisões arquiteturais

### Por que zero-allocation?

Ver seção "Por que zero-allocation?" acima. A alternativa seria criar um objeto `Point` a cada chamada:

```ts
// ❌ Aloca objeto a cada mousemove
const svgPoint = camera.canvasToSvg(canvasX, canvasY);
```

A abordagem inline evita pressão no GC em cenários de alto throughput.

### Por que varrer layers em ordem crescente no modo ROOT?

O nível 0 (ps) é o mais genérico — aviários inteiros. Se um SVG só tem regiões de nível 2 (ph), os níveis 0 e 1 terão layers vazias (`colorIndex.size === 0`), que são pulados pelo `continue`. Assim, o sistema suporta SVGs com hierarquias que começam em qualquer nível.

### Por que getImageData(hitX, hitY, 1, 1)?

Ler 1 pixel é o mínimo necessário. Ler uma região maior (ex: 3×3 para "fuzzy matching") complicaria a lógica e adicionaria ambiguidade quando duas regiões estão próximas.
