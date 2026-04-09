# build() — Orquestrador da HitMap com cache IndexedDB

## O que faz

Método público que orquestra a construção das 4 layers da hitmap. Antes de rasterizar, computa um hash SHA-1 do SVG e tenta carregar os layers do IndexedDB. Em caso de cache hit, pula toda a rasterização. Em caso de cache miss, delega para `fallbackToRasterize()` e persiste o resultado no IndexedDB para sessões futuras.

```ts
async build(
  svgText: string,
  regions: Map<string, Region>,
  svgWidth: number,
  svgHeight: number
): Promise<void>
```

## Por que existe

O pipeline de rasterização (criação de canvas, clonagem do SVG, coloração, Blob→Image→drawImage→getImageData) é caro — pode levar centenas de milissegundos para SVGs grandes. O `build()` existe para:

1. **Evitar rasterização redundante** — se o mesmo SVG já foi processado, os layers são restaurados do IndexedDB em milissegundos
2. **Centralizar a lógica de decisão** — hash → cache → fallback → persist
3. **Garantir resiliência** — falhas do IndexedDB são silenciosas; o motor continua funcionando sem cache

## Como funciona — Pipeline de 4 fases

### Fase 1 — Reset e computação do hash

```ts
this.ready = false;
this.layers.clear();
this.regionMap = regions;

const hash = await this.computeHash(svgText);
console.log('[hitmap] SVG hash:', hash);
```

- Marca `ready = false` para que consultas durante o build retornem `null`
- Limpa layers anteriores (permite rebuild após troca de SVG)
- Computa hash SHA-1 do SVG completo via `crypto.subtle.digest()`

### Fase 2 — Tentar cache local (IndexedDB)

```ts
const cacheHit = await this.loadFromCache(hash);
if (cacheHit) {
  this.ready = true;
  console.log('[hitmap] loaded from IndexedDB cache');
  return;
}
```

Se `loadFromCache()` encontra o hash no IndexedDB:
- Reconstitui os 4 layers (Int32Array + colorIndex) diretamente do cache
- Marca `ready = true` e retorna — **zero rasterização**

Se não encontra (cache miss) ou se o IndexedDB falha — continua para a fase 3.

### Fase 3 — Cache miss → rasterização completa

```ts
console.log('[hitmap] cache miss — rasterizing...');
await this.fallbackToRasterize(svgText, regions, svgWidth, svgHeight);
```

Delega para `fallbackToRasterize()` que executa o pipeline completo:
- Criação de 4 canvas temporários
- Modificação do SVG clonado (normalização, crispEdges, coloração)
- Rasterização via Blob URL + drawImage
- Extração dos idGrids (Int32Array)
- Destruição dos canvas (libera VRAM)

Ver documentação de [`fallbackToRasterize()`](fallbackToRasterize.md) para detalhes do pipeline.

### Fase 4 — Persistir no IndexedDB + marcar pronto

```ts
await this.saveToCache(hash);
this.ready = true;
```

- `saveToCache()` serializa os layers (Map→Array, Int32Array→Array) e grava no IndexedDB
- Falhas na gravação são silenciosas — o cache é opcional
- Marca `ready = true` — a partir daqui `getRegionAt()` e `hasRegionAt()` funcionam

## Fluxo de decisão

```
build()
  │
  ├─ ready = false
  ├─ layers.clear()
  │
  ├─ computeHash(svgText) ─────────────── SHA-1 do SVG
  │
  ├─ loadFromCache(hash)
  │   ├─ true  → ready = true → return    ⬅ FAST PATH (~ms)
  │   └─ false → continua
  │
  ├─ fallbackToRasterize(...)              ⬅ SLOW PATH (~100ms+)
  │
  ├─ saveToCache(hash)                     ⬅ gravação silenciosa
  │
  └─ ready = true
```

## Parâmetros

| Parâmetro   | Tipo                     | Descrição                                |
|-------------|--------------------------|------------------------------------------|
| `svgText`   | `string`                 | Código-fonte SVG completo                |
| `regions`   | `Map<string, Region>`    | Mapa de regiões extraídas pelo parser    |
| `svgWidth`  | `number`                 | Largura do SVG em unidades abstratas     |
| `svgHeight` | `number`                 | Altura do SVG em unidades abstratas      |

## Retorno

`Promise<void>` — assíncrono por causa do hash SHA-1, acesso ao IndexedDB e (em cache miss) carregamento de imagens.

## Exemplos de uso

```ts
// main.ts — após parsear o SVG
const hitmap = new HitMap();
await hitmap.build(svgText, regions, svgWidth, svgHeight);
// Agora hitmap.getRegionAt() funciona
// Na próxima sessão com o mesmo SVG, o build será instantâneo (cache hit)
```

## Dependências

| Direção     | Módulo/Método            | Relação                                          |
|-------------|--------------------------|--------------------------------------------------|
| Usa         | `computeHash()`         | Para gerar cache key SHA-1                        |
| Usa         | `loadFromCache()`       | Para tentar restaurar do IndexedDB                |
| Usa         | `fallbackToRasterize()` | Para rasterizar em caso de cache miss             |
| Usa         | `saveToCache()`         | Para persistir layers no IndexedDB                |
| Usa         | `crypto.subtle`         | Via `computeHash()` — requer contexto seguro (HTTPS/localhost) |
| Usa         | `IndexedDB`             | Via `loadFromCache()`/`saveToCache()`             |
| Chamado por | `main.ts`               | No carregamento do SVG                            |

## Decisões arquiteturais

### Por que SHA-1 como cache key?

SHA-1 é rápido, amplamente suportado via `crypto.subtle`, e produz hashes de 40 caracteres hexadecimais. Embora não seja adequado para segurança criptográfica, é perfeito para detecção de mudanças em conteúdo — a probabilidade de colisão é negligível para o caso de uso (dezenas de SVGs distintos).

### Por que IndexedDB ao invés de localStorage?

`localStorage` tem limite de ~5MB (variável por browser) e armazena apenas strings. Os idGrids são `Int32Array` que podem ter megabytes por layer. O IndexedDB:
- Suporta armazenamento de arrays numéricos grandes
- Tem limites muito mais generosos (centenas de MB)
- Opera de forma assíncrona (não bloqueia a UI thread)

### Por que falhas do IndexedDB são silenciosas?

O cache é uma **otimização**, não um requisito funcional. Se o IndexedDB estiver indisponível (modo privado, quota excedida, permission denied), o sistema deve funcionar normalmente — apenas sem o benefício do cache. Todas as operações de cache usam `try/catch` + `resolve(false)` ou `resolve()` em caso de erro.

### Por que o pipeline de rasterização foi extraído para fallbackToRasterize()?

Separar a lógica de cache da lógica de rasterização permite:
- `build()` ser um orquestrador limpo com 4 etapas claras
- O pipeline de rasterização ser testável/modificável independentemente
- O fluxo de decisão (cache hit vs miss) ser legível num único método
