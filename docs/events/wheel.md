# events — wheel (zoom por scroll)

## Estado actual: NÃO IMPLEMENTADO

O módulo `events.ts` **não contém** um handler para o evento `wheel`. Não existe zoom por scroll/roda do rato na versão actual do projecto.

## Contexto

A assinatura de `setupEvents` inclui parâmetros reservados (`_target`, `_svgWidth`, `_svgHeight`) com prefixo `_` que sugerem que funcionalidades adicionais — como zoom por scroll — foram antecipadas mas ainda não implementadas.

Actualmente, a escala da câmara (`camera.scale`) é controlada exclusivamente pela navegação hierárquica:

- **Drill-down** → câmara ajusta-se ao bounding-box da região focada (`bboxToCamera` + `fitToCanvas`)
- **Drill-up** → câmara restaura o estado anterior do histórico de navegação
- **Reset** → câmara volta à vista raiz

Não há forma de o utilizador controlar manualmente o nível de zoom.

## Dependências que seriam necessárias

Se um handler `wheel` fosse implementado, provavelmente utilizaria:

| Parâmetro | Papel esperado |
|---|---|
| `_target` (Camera) | Alvo de animação — o zoom modificaria `target.scale` e deixaria `animateCamera` interpolar |
| `_svgWidth` / `_svgHeight` | Limites para clamp — impedir zoom-out além da vista completa do SVG |
| `camera` | Estado actual da câmara (necessário para calcular zoom centrado no cursor) |
| `canvas` | Alvo do listener `wheel` |

## Eventos registados vs. ausentes

| Evento | Registado | Handler |
|---|---|---|
| `click` | ✅ | drill-down / drill-up |
| `mousemove` | ✅ | tooltip |
| `mouseleave` | ✅ | esconder tooltip |
| `keydown` | ✅ | ESC / R |
| `resize` | ✅ | redimensionamento |
| `wheel` | ❌ | — |
