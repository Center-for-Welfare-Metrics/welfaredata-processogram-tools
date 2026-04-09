# setTransform() — Único ponto de mutação da Camera

## O que faz

Define os três componentes da transformação da câmera — `scale`, `translateX` e `translateY` — de uma só vez, e marca a matriz inversa como desatualizada.

```ts
setTransform(scale: number, x: number, y: number): void {
  this._scale = scale;
  this._tx    = x;
  this._ty    = y;
  this._dirty = true;
}
```

## Por que existe

### Prevenção de Torn State

**Torn State** ocorre quando um consumidor lê um objeto parcialmente atualizado. Exemplo hipotético sem `setTransform()`:

```ts
// ❌ Perigoso — se o renderer lê entre as linhas 1 e 2,
//    vê scale novo com translateX antigo
camera._scale = 2.0;
// <- renderer.render() executa aqui
camera._tx = 100;
camera._ty = 50;
```

Com `setTransform()`, as três propriedades são escritas em sequência síncrona dentro de uma única chamada de função. Como JavaScript é single-threaded, nenhum código externo pode observar um estado intermediário.

### Atomicidade

Os três valores são **matematicamente dependentes**. Ao fazer zoom centrado num ponto, `scale`, `tx` e `ty` mudam juntos segundo a fórmula:

```
tx' = pointX - (pointX - tx) * (newScale / oldScale)
ty' = pointY - (pointY - ty) * (newScale / oldScale)
```

Permitir que sejam setados individualmente abriria espaço para bugs onde o zoom e o pan ficam dessincronizados por um frame.

### Dirty Flag automático

Ao centralizar a mutação, `_dirty = true` é setado automaticamente. Não há risco de esquecer de invalidar o cache da inversa.

## Parâmetros

| Parâmetro | Tipo     | Descrição                                      |
|-----------|----------|-------------------------------------------------|
| `scale`   | `number` | Novo fator de zoom. 1.0 = tamanho original do SVG |
| `x`       | `number` | Nova translação horizontal em pixels do canvas  |
| `y`       | `number` | Nova translação vertical em pixels do canvas    |

## Retorno

`void` — o método muta o estado interno da instância.

## Exemplos de uso

### Na animação (lerp)

```ts
// animateCamera() interpola e chama setTransform() a cada frame
camera.setTransform(
  camera.scale      + ds * LERP_FACTOR,
  camera.translateX + dx * LERP_FACTOR,
  camera.translateY + dy * LERP_FACTOR
);
```

### No snap final da animação

```ts
// Quando a diferença é menor que SNAP_THRESHOLD, encaixa direto
camera.setTransform(
  target.scale,
  target.translateX,
  target.translateY
);
```

### No zoom por scroll (events.ts)

```ts
camera.setTransform(newScale, newTx, newTy);
```

## Dependências

| Direção   | Módulo           | Relação                                  |
|-----------|------------------|------------------------------------------|
| Chamado por | `animateCamera()` | A cada frame de animação               |
| Chamado por | `events.ts`      | Em resposta a wheel, pan, pinch        |
| Chamado por | `navigation.ts`  | Ao resetar a vista                      |
| Afeta     | `inverseMatrix`   | Marca `_dirty = true`, forçando recálculo na próxima leitura |

## Decisões arquiteturais

### Por que não setters individuais?

Setters individuais (`set scale(v)`, `set translateX(v)`) exigiriam que o consumidor lembre de setar os três valores. Esquecimentos levariam a bugs visuais sutis (zoom sem reposicionar, pan sem ajustar escala).

### Por que não retornar `this` para chaining?

O método é chamado em contextos de performance (loop de animação). Retornar `void` torna explícito que é uma ação, não uma transformação funcional.
