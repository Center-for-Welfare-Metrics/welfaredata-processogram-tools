# indexToColor() — Conversão de índice para cor RGB única

## O que faz

Converte um índice numérico inteiro em uma string de cor RGB que pode ser usada como atributo `fill` em SVG. Cada índice produz uma cor única.

```ts
private indexToColor(i: number): string {
  const r = (i >> 16) & 0xFF;
  const g = (i >> 8) & 0xFF;
  const b = i & 0xFF;
  return `rgb(${r},${g},${b})`;
}
```

## Por que existe

O sistema de hit-testing precisa que cada região tenha uma cor distinta. Esta função é a ponte entre o identificador numérico sequencial (1, 2, 3...) e a representação visual (cor RGB) que será pintada no canvas da hitmap.

## Como funciona

### Decomposição em bytes

O índice `i` é um inteiro de 24 bits, decomposto nos 3 canais RGB:

```
i = 0x04A3F1  (exemplo: 304113 em decimal)

R = (0x04A3F1 >> 16) & 0xFF = 0x04 = 4
G = (0x04A3F1 >> 8)  & 0xFF = 0xA3 = 163
B = (0x04A3F1)       & 0xFF = 0xF1 = 241

Resultado: "rgb(4,163,241)"
```

A operação reversa acontece no `build()`, durante a pré-computação do Grid de IDs:

```ts
// build() — extração do idGrid
idGrid[i / 4] = a >= 128
  ? (raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]
  : -1;
// raw[i]=R=4, raw[i+1]=G=163, raw[i+2]=B=241
// idx = (4 << 16) | (163 << 8) | 241 = 0x04A3F1 = 304113 ✓
```

Essa decodificação é feita **uma única vez** durante o `build()` e armazenada no `Int32Array`. O `getRegionAt()` consulta diretamente o índice pré-computado via `layer.pixels[offset]`.

### Exemplos de conversão

| Índice | Binário (24-bit)         | R   | G   | B   | Cor              |
|--------|--------------------------|-----|-----|-----|------------------|
| 1      | `000000 00000000 00000001` | 0   | 0   | 1   | `rgb(0,0,1)`     |
| 255    | `000000 00000000 11111111` | 0   | 0   | 255 | `rgb(0,0,255)`   |
| 256    | `000000 00000001 00000000` | 0   | 1   | 0   | `rgb(0,1,0)`     |
| 65536  | `000001 00000000 00000000` | 1   | 0   | 0   | `rgb(1,0,0)`     |

### Limite teórico de regiões

Com 24 bits (3 bytes RGB), o limite é:

$$
2^{24} - 1 = 16.777.215 \text{ regiões}
$$

O `-1` porque o índice 0 (`rgb(0,0,0)` = preto) é **reservado para "sem região"** — é a cor do fundo.

Na prática, SVGs de aviários têm dezenas a centenas de regiões por layer, então o limite é mais que suficiente.

### Por que começa em 1

No `build()`:

```ts
const colorIdx = i + 1; // reservar 0 para "sem região"
```

O índice 0 produz `rgb(0,0,0)` — preto puro. Como todo o fundo do SVG modificado é preto (todos os elementos não-região recebem `fill: #000000`), o preto se torna o marcador de "nenhuma região aqui". Se alguma região tivesse colorIdx 0, seria indistinguível do fundo.

## Parâmetros

| Parâmetro | Tipo     | Descrição                              |
|-----------|----------|----------------------------------------|
| `i`       | `number` | Índice numérico >= 1                   |

## Retorno

| Tipo     | Descrição                                     |
|----------|-----------------------------------------------|
| `string` | Cor no formato `rgb(R,G,B)`, ex: `rgb(0,0,1)` |

## Exemplos de uso

```ts
// Dentro de build() — atribuir cor a cada região do nível
for (let i = 0; i < regionsByLevel.length; i++) {
  const colorIdx = i + 1;
  const color = this.indexToColor(colorIdx); // ex: "rgb(0,0,1)"
  layer.colorIndex.set(colorIdx, region.id);

  groupEl.setAttribute('fill', color);
}
```

## Dependências

| Direção    | Módulo      | Relação                            |
|------------|-------------|------------------------------------|
| Chamado por | `build()`  | Para gerar cores durante a rasterização |
| Par com    | `build()` | A decodificação reversa `(R << 16) \| (G << 8) \| B` acontece no `build()` ao criar o idGrid |

## Decisões arquiteturais

### Por que RGB e não RGBA?

O canal Alpha é usado durante o `build()` para detectar pixels transparentes (`alpha < 128 → -1` no idGrid), não como parte do endereçamento. Usar RGBA daria 32 bits (4 bilhões de regiões), mas complicaria a lógica de transparência.

### Por que string `rgb(R,G,B)` e não hex `#RRGGBB`?

Ambos funcionariam como atributo `fill`. A forma `rgb()` foi escolhida por legibilidade no debug — é mais fácil ler `rgb(0,0,3)` do que `#000003` quando inspecionando o SVG modificado.

### Por que método privado?

Nenhum código externo precisa converter índices para cores. O método é um detalhe de implementação do pipeline `build()` → rasterização → `getRegionAt()`.
