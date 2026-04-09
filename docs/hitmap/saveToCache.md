# saveToCache() — Persistir layers no IndexedDB

## O que faz

Método privado que serializa os layers da hitmap e os grava no IndexedDB usando o hash SHA-1 do SVG como chave. É chamado por `build()` após a rasterização bem-sucedida, para que sessões futuras com o mesmo SVG possam pular o pipeline de rasterização via `loadFromCache()`.

```ts
private async saveToCache(hash: string): Promise<void>
```

## Por que existe

Sem persistência, cada carregamento do SVG reexecutaria o pipeline completo de rasterização (centenas de milissegundos). O `saveToCache()` grava os layers no IndexedDB para que `loadFromCache()` possa restaurá-los instantaneamente em sessões futuras.

## Como funciona

### Passo 1 — Abrir o banco IndexedDB

```ts
const request = indexedDB.open('welfaredata-hitmap', 1);
```

Idêntico ao `loadFromCache()` — mesmo banco, mesma versão, mesmo handler de `onupgradeneeded`.

### Passo 2 — Serializar os layers

```ts
const serialized = [...this.layers.entries()].map(
  ([level, layer]) => ({
    level,
    pixels:     Array.from(layer.pixels),
    width:      layer.width,
    height:     layer.height,
    colorIndex: [...layer.colorIndex.entries()],
  })
);
```

A serialização converte tipos que podem ter problemas de compatibilidade cross-browser:
- `Map<number, HitLayer>` → `Array` de objetos (via spread de entries)
- `Int32Array` → `number[]` (via `Array.from()`)
- `Map<number, string>` → `[number, string][]` (via spread de entries)

### Passo 3 — Gravar no IndexedDB

```ts
const tx = db.transaction('layers', 'readwrite');
const store = tx.objectStore('layers');

store.put({
  hash,
  layers:    serialized,
  timestamp: Date.now(),
});
```

- Transação `readwrite` — permite escrita
- `store.put()` insere ou sobrescreve (se o hash já existir)
- `timestamp` registra quando o cache foi salvo (uso futuro: expiração)

### Tratamento de erros

Todas as falhas resolvem silenciosamente:

```ts
tx.onerror = () => {
  db.close();
  resolve(); // falha silenciosa — cache é opcional
};
request.onerror = () => resolve();
// + try/catch externo
```

O cache é uma otimização. Se o IndexedDB estiver indisponível (modo privado, quota excedida), o sistema continua funcionando — apenas sem o benefício do cache.

## Formato dos dados gravados

```ts
{
  hash: string;                    // keyPath — SHA-1 do SVG
  layers: Array<{
    level: number;                 // 0-3 (ps, lf, ph, ci)
    pixels: number[];              // Int32Array → Array<number>
    width: number;                 // largura do grid
    height: number;                // altura do grid
    colorIndex: [number, string][];// Map → Array de tuplas [corIdx, regionId]
  }>;
  timestamp: number;               // Date.now() — para expiração futura
}
```

### Estimativa de tamanho por entrada

Para um SVG de 2000×1600 com `HIT_SCALE = 0.5`:
- Grid: 1000 × 800 = 800.000 pixels
- 4 layers × 800.000 × 4 bytes (Int32) = **~12.8 MB** como Int32Array
- Serializado como `number[]` (JSON-like no IndexedDB): ~2-3x overhead → **~25-40 MB**

O IndexedDB suporta centenas de MB, então o tamanho é aceitável para o caso de uso.

## Parâmetros

| Parâmetro | Tipo     | Descrição                                |
|-----------|----------|------------------------------------------|
| `hash`    | `string` | Hash SHA-1 do SVG (40 caracteres hex)    |

## Retorno

`Promise<void>` — resolve sempre, mesmo em caso de erro (falha silenciosa).

## Dependências

| Direção     | API/Método        | Relação                                          |
|-------------|-------------------|--------------------------------------------------|
| Usa         | `IndexedDB`       | Banco `welfaredata-hitmap`, store `layers`       |
| Lê          | `this.layers`     | Os layers preenchidos por `fallbackToRasterize()`|
| Chamado por | `build()`         | Após rasterização bem-sucedida                   |
| Par com     | `loadFromCache()` | Formato de serialização deve ser compatível      |

## Decisões arquiteturais

### Por que store.put() ao invés de store.add()?

`put()` insere ou sobrescreve. `add()` falha se a chave já existir. Como o hash é determinístico, reprocessar o mesmo SVG deve atualizar o cache (não falhar).

### Por que timestamp?

O campo `timestamp` não é usado atualmente, mas permite futura implementação de expiração de cache (ex: limpar entradas com mais de 30 dias para liberar espaço no IndexedDB).

### Por que Int32Array → Array<number>?

O Structured Clone Algorithm usado internamente pelo IndexedDB suporta typed arrays, mas a compatibilidade varia entre browsers e versões. Converter para `Array<number>` via `Array.from()` garante compatibilidade universal. O custo de serialização/desserialização é pago uma vez no `build()`, nunca no hot path.

### Por que Map → Array de tuplas?

`Map` não é diretamente serializável pelo Structured Clone em todos os browsers de forma confiável para persistência. Converter para `Array<[key, value]>` (via spread de entries) e reconstituir via `new Map(array)` é o padrão seguro.
