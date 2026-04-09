# events — click handler

## O que faz

O handler de `click` traduz um clique no canvas numa acção de navegação hierárquica:

- **Clique numa região válida** (nível < 3) → `onDrillDown(regionId)` — desce um nível
- **Clique no vazio** (sem nenhuma região sob o pixel) → `onDrillUp()` — sobe um nível
- **Clique numa região no nível máximo** (nível 3 = `ci`) → nenhuma acção (drill-down bloqueado)

## Por que existe

O clique é o modo principal de navegação na hierarquia `ps → lf → ph → ci`. A lógica está encapsulada dentro de `setupEvents` para manter o módulo `events.ts` auto-contido e desacoplado de `main.ts`.

## Como funciona

```
Clique no canvas
  │
  ├─ getBoundingClientRect() → coordenadas CSS
  │    canvasX = clientX - rect.left
  │    canvasY = clientY - rect.top
  │
  ├─ hitmap.getRegionAt(canvasX, canvasY, camera, nav)
  │    └─ devolve regionId | null
  │
  ├─ SE regionId existe E nav.level < 3
  │    └─ onDrillDown(regionId)     // desce na hierarquia
  │
  └─ SE regionId é null
       ├─ hitmap.hasRegionAt(canvasX, canvasY, camera, nav)
       │    └─ devolve boolean
       └─ SE !hasAny
            └─ onDrillUp()          // sobe na hierarquia
```

### Detalhe das coordenadas

O handler converte `clientX`/`clientY` (coordenadas da viewport do browser) em coordenadas do canvas CSS via `getBoundingClientRect()`. Estas coordenadas CSS são depois convertidas em coordenadas de mundo internamente pelo `HitMap` (que aplica a transformação inversa da câmara).

### Guard: nível máximo

O `nav.level < 3` impede drill-down além do nível `ci` (o nível mais profundo da hierarquia). Se o utilizador clicar numa região estando já no nível 3, nada acontece — o clique é silenciosamente ignorado.

### Guard: clique com região parcial

Se `getRegionAt` devolver `null` mas `hasRegionAt` devolver `true`, o clique caiu numa zona onde existe *alguma* região visível mas não identificável de forma precisa (ex.: borda entre regiões). Neste caso, o handler **não** faz drill-up — protege contra drill-ups acidentais.

## Código fonte

```ts
canvas.addEventListener('click', (e: MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  const regionId = hitmap.getRegionAt(canvasX, canvasY, camera, nav);

  console.log('[click] canvasX:', canvasX.toFixed(0), 'canvasY:', canvasY.toFixed(0),
    '| regionId:', regionId,
    '| nav.level:', nav.level,
    '| nav.focusedId:', nav.focusedId,
    '| hasAny:', hitmap.hasRegionAt(canvasX, canvasY, camera, nav));

  if (regionId && nav.level < 3) {
    onDrillDown(regionId);
  } else if (!regionId) {
    const hasAny = hitmap.hasRegionAt(canvasX, canvasY, camera, nav);
    if (!hasAny) {
      onDrillUp();
    }
  }
});
```

> **Nota:** Os `console.log` são diagnósticos de desenvolvimento e registam todas as coordenadas e estado relevante de cada clique.

## Parâmetros utilizados

| Parâmetro | Papel no handler |
|---|---|
| `canvas` | Alvo do listener, fonte de `getBoundingClientRect()` |
| `hitmap` | `getRegionAt()` e `hasRegionAt()` — traduz pixel em região |
| `camera` | Passado ao hitmap para transformação de coordenadas |
| `nav` | `nav.level` — guarda que impede drill-down acima do nível 3 |
| `onDrillDown` | Callback invocado com `regionId` quando uma região válida é clicada |
| `onDrillUp` | Callback invocado quando o clique cai no vazio total |

## Exemplo de uso concreto

```
Estado: nav.level = 1 (lf), focusedId = "lf_01"
Utilizador clica num pen-house visível

→ hitmap.getRegionAt(320, 210, camera, nav) = "ph_03"
→ nav.level (1) < 3 ✓
→ onDrillDown("ph_03")
→ nav transiciona para level=2, focusedId="ph_03"
```

```
Estado: nav.level = 2 (ph), focusedId = "ph_03"
Utilizador clica numa zona sem regiões

→ hitmap.getRegionAt(500, 400, camera, nav) = null
→ hitmap.hasRegionAt(500, 400, camera, nav) = false
→ onDrillUp()
→ nav transiciona para level=1, focusedId="lf_01"
```

## Dependências

| Módulo | Função | Utilização |
|---|---|---|
| `hitmap.ts` | `getRegionAt()` | Identifica a região sob o pixel clicado |
| `hitmap.ts` | `hasRegionAt()` | Verifica se *alguma* região existe sob o pixel (sem obrigar identificação exacta) |

## Decisões arquitecturais

1. **Duas verificações no hitmap** — `getRegionAt` identifica a região exacta; `hasRegionAt` é um fallback booleano mais rápido. A separação permite distinguir "clicou no vazio" de "clicou numa zona ambígua entre regiões".

2. **Nível máximo hardcoded** — O guard `nav.level < 3` está directamente no handler em vez de no callback `onDrillDown`. Isto mantém a lógica de navegação explícita no ponto de decisão e evita chamadas desnecessárias ao callback.

3. **Console.log de diagnóstico** — Cada clique gera um log detalhado com coordenadas, região identificada, nível actual e focusedId. Útil para debugging em tempo real durante development.
