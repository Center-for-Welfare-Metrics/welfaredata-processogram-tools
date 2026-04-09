# drillUp() — Voltar um nível na hierarquia

## O que faz

Restaura o estado de navegação e a câmera-alvo para o nível anterior, usando o último snapshot salvo na pilha de histórico.

```ts
export function drillUp(nav: NavState, target: Camera): void {
  if (nav.history.length === 0) return;

  const prev = nav.history.pop()!;
  nav.level = prev.level;
  nav.focusedId = prev.id;
  target.setTransform(
    prev.camera.scale,
    prev.camera.translateX,
    prev.camera.translateY
  );
}
```

## Por que existe

O drill-up é o complemento do drill-down — permite ao usuário voltar ao nível anterior. A pilha de histórico garante que o retorno restaure exatamente o estado visual que o usuário tinha antes de entrar.

## Como funciona

### Passo 1 — Verificar se há histórico

```ts
if (nav.history.length === 0) return;
```

No nível ROOT, a pilha está vazia. Chamar `drillUp()` no ROOT é um no-op — não há para onde voltar.

### Passo 2 — Pop do último estado

```ts
const prev = nav.history.pop()!;
```

Remove e retorna o último snapshot da pilha. Cada snapshot contém:

```ts
interface NavHistoryEntry {
  id: string | null;   // focusedId antes do drill-down
  level: number;       // nível antes do drill-down
  camera: Camera;      // posição/zoom antes do drill-down
}
```

### Passo 3 — Restaurar NavState

```ts
nav.level = prev.level;
nav.focusedId = prev.id;
```

O `nav` é mutado in-place para refletir o estado anterior.

### Passo 4 — Restaurar câmera-alvo

```ts
target.setTransform(
  prev.camera.scale,
  prev.camera.translateX,
  prev.camera.translateY
);
```

A câmera-alvo é setada para a posição exata salva no snapshot. O loop de animação interpolará suavemente de volta.

### Pilha de estados anteriores

Exemplo de evolução da pilha durante navegação:

| Ação                            | history stack                                     | nav.focusedId     |
|---------------------------------|---------------------------------------------------|-------------------|
| Início (ROOT)                   | `[]`                                              | `null`            |
| Drill-down em `shed-01--ps`     | `[{null, -1, cam₀}]`                             | `"shed-01--ps"`   |
| Drill-down em `floor-01_lf`    | `[{null, -1, cam₀}, {"shed-01--ps", 0, cam₁}]`  | `"floor-01_lf"`   |
| Drill-up                        | `[{null, -1, cam₀}]`                             | `"shed-01--ps"`   |
| Drill-up                        | `[]`                                              | `null`            |
| Drill-up (no ROOT)              | `[]` (no-op)                                      | `null`            |

### O que acontece no nível root

Quando `nav.history.length === 0`:
- **Click em área vazia** → `events.ts` chama `onDrillUp()` → `drillUp()` retorna imediatamente (no-op)
- **ESC** → mesmo comportamento

O usuário não percebe nada — o sistema simplesmente ignora a ação.

## Parâmetros

| Parâmetro | Tipo       | Descrição                                   |
|-----------|------------|---------------------------------------------|
| `nav`     | `NavState` | Estado de navegação (mutado in-place)       |
| `target`  | `Camera`   | Câmera-alvo (setada para animação de volta) |

## Retorno

`void` — muta `nav` e `target` in-place, ou não faz nada se a pilha está vazia.

## Exemplos de uso

```ts
// main.ts
function onDrillUp(): void {
  drillUp(nav, target);
  isAnimating = true;
  needsRedraw = true;
}

// events.ts — tecla ESC
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    onDrillUp();
  }
});

// events.ts — click em área vazia
if (!regionId) {
  const hasAny = hitmap.hasRegionAt(canvasX, canvasY, camera, nav);
  if (!hasAny) {
    onDrillUp();
  }
}
```

## Dependências

| Direção    | Módulo     | Relação                          |
|------------|-----------|----------------------------------|
| Importa    | `types.ts` | `NavState`, `Camera`             |
| Chamado por | `main.ts` | Via callback `onDrillUp`        |

## Decisões arquiteturais

### Por que restaurar a câmera exata e não recalcular?

Se o usuário fez pan/zoom manualmente dentro de um nível antes de dar drill-down, recalcular com `bboxToCamera()` perderia essa posição. O snapshot preserva o contexto visual exato do usuário.

### Por que pop e não peek + delete?

`Array.pop()` é O(1) e faz exatamente o que é preciso: remove o último elemento e retorna. Não há cenário onde o último estado precise ser consultado sem ser removido.
