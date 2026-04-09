# animateCamera() — Interpolação suave da câmera

## O que faz

Interpola a câmera atual em direção a uma câmera-alvo usando **linear interpolation (lerp)**. Retorna `true` se a animação ainda está em andamento, `false` se chegou ao destino (snap).

```ts
export function animateCamera(camera: Camera, target: Camera): boolean
```

## Por que existe

Transições abruptas de câmera (cortar direto para o alvo) são desorientadoras para o usuário. O `animateCamera()` cria uma transição suave que permite ao usuário acompanhar para onde a vista está se movendo, especialmente durante drill-down/drill-up na hierarquia do SVG.

## Como funciona

### Passo 1 — Calcular deltas

```ts
const ds = target.scale - camera.scale;
const dx = target.translateX - camera.translateX;
const dy = target.translateY - camera.translateY;
```

Calcula a diferença entre o estado atual e o alvo em cada componente.

### Passo 2 — Verificar se chegou (snap)

```ts
if (Math.abs(ds) < SNAP_THRESHOLD / 1000 &&
    Math.abs(dx) < SNAP_THRESHOLD &&
    Math.abs(dy) < SNAP_THRESHOLD) {
  camera.setTransform(
    target.scale,
    target.translateX,
    target.translateY
  );
  return false;
}
```

Se todos os deltas estão abaixo do limiar (`SNAP_THRESHOLD = 0.5`), a câmera é encaixada diretamente no alvo. Isso evita:
- **Animação infinita** — sem snap, o lerp nunca chega exatamente a zero (assintótico).
- **Tremor visual** — diferenças sub-pixel causariam jitter.

Para `scale`, o threshold é dividido por 1000 porque scale é tipicamente um valor entre 0.1 e 10, enquanto translações são centenas de pixels.

**Retorna `false`** → sinaliza ao loop que pode parar de chamar `requestAnimationFrame`.

### Passo 3 — Interpolar (lerp)

```ts
camera.setTransform(
  camera.scale      + ds * LERP_FACTOR,
  camera.translateX + dx * LERP_FACTOR,
  camera.translateY + dy * LERP_FACTOR
);
return true;
```

Cada frame, a câmera se move uma fração (`LERP_FACTOR = 0.08`) da distância restante. Isso cria uma **desaceleração exponencial** — movimentos rápidos no início, suavizando conforme se aproxima do alvo.

**Retorna `true`** → sinaliza ao loop que a animação continua.

### Diferença entre snap e lerp

| Aspecto     | Snap                        | Lerp                              |
|-------------|-----------------------------|------------------------------------|
| Quando      | Deltas < threshold          | Deltas >= threshold                |
| O que faz   | Seta valores finais exatos  | Move 8% da distância restante      |
| Retorno     | `false` (parar loop)        | `true` (continuar loop)            |
| Propósito   | Evitar jitter/loop infinito | Transição suave                    |

### Como o rAF loop funciona

No `main.ts`, o loop de renderização chama `animateCamera()` a cada frame:

```ts
// Simplificado do main.ts
function tick() {
  const stillMoving = animateCamera(camera, target);
  renderer.render(nav, camera, rasterCache, ...);
  if (stillMoving) {
    requestAnimationFrame(tick);
  }
}
```

Quando o usuário faz drill-down:
1. `target` é setado para a câmera calculada por `bboxToCamera()`
2. O loop rAF começa
3. A cada frame, `animateCamera()` aproxima `camera` de `target`
4. Quando `animateCamera()` retorna `false`, o loop para

### Relação entre `camera` e `target`

- `camera` — instância da classe `Camera`, estado mutável que o renderer usa.
- `target` — plain object `{ scale, translateX, translateY }`, destino imutável da animação.

O `target` é recalculado quando o usuário navega (drill-down, drill-up, reset). A `camera` é interpolada em direção ao `target` a cada frame.

## Parâmetros

| Parâmetro | Tipo     | Descrição                                         |
|-----------|----------|---------------------------------------------------|
| `camera`  | `Camera` | Câmera atual (mutada in-place via `setTransform()`) |
| `target`  | `Camera` | Câmera-alvo (somente leitura)                     |

## Retorno

| Tipo      | Descrição                                              |
|-----------|--------------------------------------------------------|
| `boolean` | `true` se a animação continua, `false` se snap concluído |

## Exemplos de uso

```ts
// No loop de renderização
const animating = animateCamera(camera, target);
if (!animating) {
  // Animação terminou, pode parar o rAF loop
  isAnimating = false;
}
```

## Dependências

| Direção   | Módulo        | Relação                                        |
|-----------|---------------|------------------------------------------------|
| Importa   | `types.ts`    | `LERP_FACTOR` (0.08) e `SNAP_THRESHOLD` (0.5) |
| Chama     | `Camera.setTransform()` | Altera o estado da câmera a cada frame |
| Chamado por | `main.ts`   | No loop `requestAnimationFrame`               |

## Decisões arquiteturais

### Por que lerp multiplicativo e não easing function?

O lerp com fator fixo (`camera + delta * 0.08`) é:
- **Simples** — uma linha de código por componente
- **Sem estado** — não precisa de timestamp de início/duração
- **Naturalmente suave** — desaceleração exponencial emerge matematicamente

Uma easing function (cubic-bezier, etc.) exigiria rastrear `t0`, `duration` e um `progress` normalizado, adicionando complexidade sem ganho perceptível neste caso.

### Por que SNAP_THRESHOLD / 1000 para scale?

O scale tipicamente varia entre 0.1 e 10, enquanto translações variam entre -5000 e +5000. Se usasse o mesmo threshold para ambos, a escala nunca atingiria o snap (0.5 é um delta enorme para scale) ou a translação faria snap prematuramente.
