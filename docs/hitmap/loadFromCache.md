# loadFromCache() — Restaurar layers do IndexedDB

## O que faz

Método privado que tenta carregar os layers da hitmap a partir do IndexedDB usando o hash SHA-1 do SVG como chave. Em caso de cache hit, reconstitui os 4 layers (`Int32Array` + `colorIndex` Map) diretamente do cache — sem rasterização. Retorna `true` se o cache foi encontrado e restaurado, `false` caso contrário.

```ts
private async loadFromCache(hash: string): Promise<boolean>
```

## Por que existe

O pipeline de rasterização (`fallbackToRasterize()`) é caro — pode levar centenas de milissegundos para SVGs grandes. Se o mesmo SVG já foi processado numa sessão anterior, os layers podem ser restaurados do IndexedDB em milissegundos, pulando toda a rasterização.

## Como funciona

### Passo 1 — Abrir o banco IndexedDB

```ts
const request = indexedDB.open('welfaredata-hitmap', 1);
```

- Nome do banco: `welfaredata-hitmap`
- Versão: `1`
- Se o banco não existe, `onupgradeneeded` cria o object store `layers`

### Passo 2 — Garantir object store (onupgradeneeded)

```ts
request.onupgradeneeded = (e) => {
  const db = (e.target as IDBOpenDBRequest).result;
  if (!db.objectStoreNames.contains('layers')) {
    db.createObjectStore('layers', { keyPath: 'hash' });
  }
};
```

O object store `layers` usa `hash` como keyPath — cada entrada é identificada pelo SHA-1 do SVG.

### Passo 3 — Buscar entrada pelo hash

```ts
const tx = db.transaction('layers', 'readonly');
const store = tx.objectStore('layers');
const get = store.get(hash);
```

Transação `readonly` — apenas leitura.

### Passo 4 — Reconstituir layers do cache

```ts
get.onsuccess = () => {
  if (!get.result) {
    db.close();
    resolve(false); // cache miss
    return;
  }

  const cached = get.result.layers as Array<{
    level: number;
    pixels: number[];
    width: number;
    height: number;
    colorIndex: [number, string][];
  }>;

  this.layers.clear();
  for (const entry of cached) {
    this.layers.set(entry.level, {
      pixels:     new Int32Array(entry.pixels),
      width:      entry.width,
      height:     entry.height,
      colorIndex: new Map(entry.colorIndex),
    });
  }

  db.close();
  resolve(true); // cache hit
};
```

A reconstituição reverte a serialização feita por `saveToCache()`:
- `number[]` → `new Int32Array(...)` — recria o grid de IDs tipado
- `[number, string][]` → `new Map(...)` — recria o mapa de cores para IDs de região

### Tratamento de erros

Todas as falhas resolvem `false` silenciosamente:

```ts
get.onerror = () => { db.close(); resolve(false); };
request.onerror = () => resolve(false);
// + try/catch externo
```

O cache é opcional — falhas no IndexedDB nunca impedem o funcionamento do sistema.

## Formato dos dados no IndexedDB

Cada entrada no object store `layers` tem a estrutura:

```ts
{
  hash: string;                    // keyPath — SHA-1 do SVG
  layers: Array<{
    level: number;                 // 0-3 (ps, lf, ph, ci)
    pixels: number[];              // Int32Array serializado como Array
    width: number;                 // largura do grid
    height: number;                // altura do grid
    colorIndex: [number, string][];// Map serializado como Array de tuplas
  }>;
  timestamp: number;               // Date.now() — salvo por saveToCache()
}
```

## Parâmetros

| Parâmetro | Tipo     | Descrição                                |
|-----------|----------|------------------------------------------|
| `hash`    | `string` | Hash SHA-1 do SVG (40 caracteres hex)    |

## Retorno

| Tipo               | Descrição                                         |
|--------------------|---------------------------------------------------|
| `Promise<boolean>` | `true` se cache hit (layers restaurados), `false` se cache miss ou erro |

## Dependências

| Direção     | API/Método    | Relação                                          |
|-------------|---------------|--------------------------------------------------|
| Usa         | `IndexedDB`   | Banco `welfaredata-hitmap`, store `layers`       |
| Chamado por | `build()`     | Antes de tentar rasterização                     |
| Par com     | `saveToCache()` | Formato de serialização deve ser compatível    |

## Decisões arquiteturais

### Por que Promise wrapper em vez de async/await nativo?

A API do IndexedDB é baseada em eventos (`onsuccess`/`onerror`), não em Promises. O wrapper `new Promise((resolve) => { ... })` adapta o modelo de eventos para async/await, mantendo o código do `build()` linear e legível.

### Por que db.close() em todos os caminhos?

O IndexedDB mantém conexões abertas que podem bloquear upgrades futuros do banco (ex: mudança de schema). Fechar explicitamente após cada operação garante que o banco não fica travado.

### Por que Int32Array é serializado como number[]?

O Structured Clone Algorithm do IndexedDB suporta `Int32Array`, mas a compatibilidade cross-browser varia. Serializar como `Array<number>` (via `Array.from()` no `saveToCache()`) e reconstituir via `new Int32Array(array)` é bulletproof em todos os browsers.
