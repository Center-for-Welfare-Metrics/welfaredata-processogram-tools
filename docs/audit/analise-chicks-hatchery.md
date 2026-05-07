# Análise Completa: chicks_hatchery.xml

**SVG criado por:** Jean (Inkscape 1.4.3)  
**Nome original:** `Processogram_chicks_hatchery_industrial_022wj.svg`

---

## 1. Tag do elemento ci mais profundamente aninhado

O elemento navegável de nível `ci` mais profundamente aninhado é:

```xml
<g id="right_hand--ci01">
```

- **Tag:** `<g>`
- **Profundidade:** 6 níveis desde o `<svg>` root
- **Localização:** linha 11411 do XML
- **Contém:** 3 `<path>` (path1332, path1105, path1136)
- **Particularidade:** é um `--ci` dentro de outro `--ci` (`poultry_technician_holding_a_chick_to_perform_beak_trimming_--ci002`)

Outros elementos na mesma profundidade:
- `left_hand--ci01` (linha 11421)
- `paw--ci101` (linha 11434)
- `paw--ci100` (linha 11441)

---

## 2. Cadeia completa de ancestrais até o `<svg>` root

```
<svg id="Layer_1" width="1755.102" height="1132.753">           ← SEM viewBox, SEM transform
  └── <g id="hatchery_--ps">                                     ← SEM transform
        └── <g id="female_--lf">                                 ← SEM transform
              └── <g id="beak_trimming_--ph" style="display:inline">  ← SEM transform
                    └── <g id="poultry_technician_holding_a_chick_to_perform_beak_trimming_--ci002">  ← SEM transform
                          └── <g id="right_hand--ci01">          ← SEM transform
                                ├── <path id="path1332" d="m 907.27928,259.57672 ..."/>
                                ├── <path id="path1105" d="m 919.49726,275.79932 ..."/>
                                └── <path id="path1136" d="m 938.11873,294.48887 ..."/>
```

**Nenhum ancestral navegável (ps/lf/ph/ci) possui atributo `transform`.**

---

## 3. Uso de `<use>` e `<symbol>`

| Elemento | Quantidade | Detalhes |
|----------|-----------|---------|
| `<use>` | **0** | Nenhum `<use>` em todo o arquivo |
| `<symbol>` | **0** | Nenhum `<symbol>` |
| `<defs>` | **1** | `<defs id="defs3421" />` — **vazio** (self-closing) |

O SVG é **100% inline**. Não há reutilização de componentes via `<use>` ou `<symbol>`. Todas as formas (pintinhos, ovos, esteiras, máquinas) são `<g>` com `<path>` duplicados manualmente pelo designer.

---

## 4. getBBox() LOCAL de `right_hand--ci01`

Estimado a partir dos dados de path (`path1332`, `path1105`, `path1136`):

| Propriedade | Valor estimado |
|-------------|---------------|
| **x** | ≈ 868.77 |
| **y** | ≈ 248.32 |
| **width** | ≈ 98.26 |
| **height** | ≈ 76.17 |

Coordenadas extraídas dos movimentos iniciais dos paths:
- `path1332`: inicia em (907.28, 259.58)
- `path1105`: inicia em (919.50, 275.80)
- `path1136`: inicia em (938.12, 294.49) — ponto mais à direita/abaixo

---

## 5. Coordenada GLOBAL no espaço do viewBox

Como **nenhum ancestral possui `transform`** e o `<svg>` **não possui `viewBox`** (usa apenas `width`/`height` em pixels), a CTM (Current Transform Matrix) do `<svg>` até este elemento é a **matriz identidade**.

> **Coordenadas globais ≈ Coordenadas locais ≈ { x: ~869, y: ~248, w: ~98, h: ~76 }**

A ausência de `viewBox` no root `<svg>` significa que o sistema de coordenadas é 1:1 com pixels (1755.102 × 1132.753).

---

## 6. Símbolos reutilizados

**Nenhum.** O SVG não utiliza o mecanismo de `<symbol>` + `<use>` do SVG.

- Zero `<symbol>` definidos
- Zero `<use>` referenciando
- `<defs id="defs3421">` está completamente vazio

Todas as formas são inline, o que resulta em um arquivo muito grande com geometria duplicada (ex: dezenas de pintinhos com paths quase idênticos).

---

## 7. Análise do parser.ts — Onde a lógica falha

### A lógica de bbox (getCTM) está correta para este SVG

A função `parseSvg()` em `parser.ts` (linhas 63–86) usa `getCTM()` + `matrixTransform()` nos 4 cantos do `getBBox()`. Para este SVG específico, como não há transforms nos ancestrais navegáveis, o CTM retorna a identidade e as coordenadas globais ficam corretas.

### O PROBLEMA CRÍTICO está no regex `isNavigable()`

```typescript
// parser.ts linha 10
/^.+(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+)?$/i
```

#### Resultado do teste contra os 302 IDs navegáveis deste SVG:

| Métrica | Valor |
|---------|-------|
| **Total de IDs com `--ci`, `--ph`, etc.** | 302 |
| **Reconhecidos pelo regex** | **54** (18%) |
| **NÃO reconhecidos** | **248** (82%) |

#### Por que 82% falham?

O regex exige que o sufixo numérico tenha um **separador** (`_` ou `-`) antes dos dígitos:

```
(?:[_-]\d+)?$    ← exige _N ou -N
```

Mas o padrão do Inkscape neste SVG cola os dígitos **diretamente** ao nível:

| Padrão no SVG | Regex espera | Resultado |
|---------------|-------------|-----------|
| `chick_--ci1` | `chick_--ci-1` ou `chick_--ci_1` | ❌ FALHA |
| `egg_--ci10` | `egg_--ci-10` | ❌ FALHA |
| `egg_shell_--ci8` | `egg_shell_--ci-8` | ❌ FALHA |
| `right_hand--ci01` | `right_hand--ci-01` | ❌ FALHA |
| `loading-truck--ci01` | `loading-truck--ci-01` | ❌ FALHA |
| `...beak_trimming_--ci002` | `..._--ci-002` | ❌ FALHA |

#### IDs que FUNCIONAM (54 de 302):

Apenas os que:
- **Não têm sufixo numérico:** `egg_--ci`, `chick_female_--ci`, `shake_--ci`
- **Usam separador `-N`:** `grinder_--ci-2`, `unwanted_male_chick_--ci-5`, `chicks_tipped_from_trays_--ph-2`

#### Consequência prática:

O parser ignora **248 elementos** deste SVG. Isso significa que:
- Grupos inteiros de pintinhos, ovos, cascas e equipamentos são invisíveis ao hit-map
- O drill-down para `beak_trimming_--ph` não mostra a maioria dos filhos ci
- Elementos com `transform` (como `egg_shell_--ci8` com `translate(46.604,243.62)`) nunca são processados

---

## 8. Padrão de transforms do Inkscape

### Resumo quantitativo:

| Tipo de transform | Quantidade | Onde aparece |
|-------------------|-----------|-------------|
| `rotate(θ)` | ~126 | `<ellipse>` e `<path>` internos (olhos/pupilas dos pintinhos) |
| `translate(x,y)` | 2 | `egg_shell_--ci8`: `translate(46.604,243.62)` e `g12` dentro de `egg_--ci3`: `translate(12.12,243.62)` |
| `matrix()` | 0 | Não utilizado |
| `scale()` | 0 | Não utilizado |

### Padrão detalhado:

1. **`rotate()` simples** — Forma dominante. Sempre com ângulo puro (sem centro de rotação explícito). Usado exclusivamente em formas decorativas internas dos pintinhos:
   ```xml
   <ellipse transform="rotate(-19.69)" .../>
   <ellipse transform="rotate(2.3079999)" .../>
   <ellipse transform="rotate(-73.86)" .../>
   ```

2. **`translate(x,y)`** — Raro (apenas 2 ocorrências). Ambos com componente Y=243.62:
   ```xml
   <!-- Diretamente no <g> navegável (egg_shell_--ci8) -->
   <g id="egg_shell_--ci8" transform="translate(46.604,243.62)">
   
   <!-- Em <g> filho não-navegável dentro de egg_--ci3 -->
   <g id="g12" transform="translate(12.12,243.62)">
   ```

3. **Nenhum transform em elementos navegáveis de nível ps, lf ou ph** — Todos os transforms estão no nível ci ou inferior.

---

## Correção necessária no regex

### Problema

```typescript
// ATUAL — exige separador antes dos dígitos
/^.+(?:--|_)(ps|lf|ph|ci)(?:[_-]\d+)?$/i
```

### Solução

Adicionar `\d*` opcional entre o nível e o separador-dígito:

```typescript
// CORRIGIDO — aceita dígitos colados diretamente ao nível
/^.+(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i
//                        ^^^
//                        NOVO: dígitos opcionais sem separador
```

### Funções afetadas (3 no total):

```typescript
// isNavigable() — linha 10
export function isNavigable(id: string): boolean {
  return /^.+(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i.test(id);
}

// getLevelIndex() — linha 14
export function getLevelIndex(id: string): number {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  const alias = match?.[1]?.toLowerCase();
  return { ps: 0, lf: 1, ph: 2, ci: 3 }[alias ?? ''] ?? -1;
}

// getAlias() — linha 20
export function getAlias(id: string): string {
  const match = id.match(/(?:--|_)(ps|lf|ph|ci)\d*(?:[_-]\d+)?$/i);
  return match?.[1]?.toLowerCase() ?? '';
}
```

### Validação — IDs que passam a funcionar:

| ID | Antes | Depois |
|----|-------|--------|
| `chick_--ci1` | ❌ | ✅ |
| `chick_--ci10` | ❌ | ✅ |
| `egg_shell_--ci8` | ❌ | ✅ |
| `egg_--ci3` | ❌ | ✅ |
| `right_hand--ci01` | ❌ | ✅ |
| `loading-truck--ci01` | ❌ | ✅ |
| `poultry_technician_..._--ci002` | ❌ | ✅ |
| `egg_--ci111-2` | ❌ | ✅ |
| `chick_female--ci00` | ❌ | ✅ |
| `egg_--ci` (sem número) | ✅ | ✅ |
| `grinder_--ci-2` (com separador) | ✅ | ✅ |
| `hatchery_--ps` | ✅ | ✅ |

**Resultado:** de 54/302 → **302/302** IDs reconhecidos (100%).
