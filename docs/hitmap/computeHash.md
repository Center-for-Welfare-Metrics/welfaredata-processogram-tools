# computeHash() — Hash SHA-1 do SVG para cache key

## O que faz

Método privado que computa o hash SHA-1 de uma string (o SVG completo) usando a Web Crypto API. Retorna o hash como string hexadecimal de 40 caracteres, usada como cache key no IndexedDB.

```ts
private async computeHash(text: string): Promise<string>
```

## Por que existe

O sistema de cache precisa de uma chave que identifique unicamente cada SVG. Usar o texto completo como chave seria ineficiente (megabytes de string como key do IndexedDB). O SHA-1 comprime qualquer SVG para uma string fixa de 40 caracteres, com probabilidade de colisão negligível.

## Como funciona

```ts
private async computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

1. **Codifica** a string para `Uint8Array` via `TextEncoder` (UTF-8)
2. **Computa** o digest SHA-1 via `crypto.subtle.digest()` — retorna `ArrayBuffer`
3. **Converte** para `Uint8Array` → array de bytes → string hexadecimal

### Exemplo de saída

```
SVG de 50KB → "a3f2b7c8e1d4f5a6b9c0e2d3f4a5b6c7d8e9f0a1"
```

## Parâmetros

| Parâmetro | Tipo     | Descrição                                |
|-----------|----------|------------------------------------------|
| `text`    | `string` | Texto completo do SVG                    |

## Retorno

| Tipo              | Descrição                                     |
|-------------------|-----------------------------------------------|
| `Promise<string>` | Hash SHA-1 em hexadecimal (40 caracteres)     |

## Dependências

| Direção     | API               | Relação                                          |
|-------------|-------------------|--------------------------------------------------|
| Usa         | `TextEncoder`     | Codificação UTF-8                                |
| Usa         | `crypto.subtle`   | Web Crypto API — requer contexto seguro (HTTPS ou localhost) |
| Chamado por | `build()`         | Para gerar a cache key antes de consultar o IndexedDB |

## Decisões arquiteturais

### Por que SHA-1 e não SHA-256?

SHA-1 é mais rápido e produz hashes menores (40 vs 64 caracteres hex). Para detecção de mudanças em conteúdo (não para segurança criptográfica), SHA-1 é mais que suficiente — a probabilidade de colisão é negligível para o universo de SVGs de aviários (dezenas a centenas de arquivos distintos).

### Por que crypto.subtle e não uma lib externa?

`crypto.subtle` é nativo do browser, zero-dependency, e opera sobre `ArrayBuffer` sem overhead de serialização. Qualquer browser moderno suporta. O único requisito é contexto seguro (HTTPS ou `localhost`), que já é atendido pela aplicação.

### Por que async?

`crypto.subtle.digest()` retorna uma `Promise` — é assíncrono por design da Web Crypto API. Isso evita bloquear a main thread durante o cálculo do hash de SVGs grandes.
