# audit — Detecção de IDs suspeitos no SVG

## O que faz

O módulo `audit.ts` verifica os IDs das regiões extraídas do SVG contra uma lista de **padrões suspeitos**. IDs que parecem representar elementos de fundo (canvas, background, etc.) são sinalizados como possíveis erros de marcação — esses elementos provavelmente não deveriam ser regiões clicáveis.

```ts
import type { Region } from './types';

const SUSPICIOUS_PATTERNS: RegExp[] = [
  /^canvas(--|$)/i,
  /^background(--|$)/i,
  /^bg(--|$)/i,
  /^fundo(--|$)/i,
];

export function auditRegions(
  regions: Map<string, Region>
): string[] {
  const suspicious: string[] = [];

  for (const [id] of regions) {
    if (SUSPICIOUS_PATTERNS.some(pattern => pattern.test(id))) {
      console.warn(
        `[audit] ID suspeito detectado: "${id}". ` +
        `Verifique se este elemento deve ser clicável.`
      );
      suspicious.push(id);
    }
  }

  return suspicious;
}
```

## Por que existe

SVGs de plantas de aviários frequentemente contêm elementos de fundo (retângulos brancos, backgrounds decorativos) que são exportados como `<g>` com IDs como `canvas`, `background`, `bg`, `fundo`. Se o parser os incluir como regiões, o hit-testing os tratará como áreas clicáveis — gerando comportamento confuso para o usuário (clicar no "nada" aciona um drill-down).

O audit **não impede** a inclusão — apenas **avisa**. A decisão de ignorar ou corrigir fica com o desenvolvedor/designer.

## SUSPICIOUS_PATTERNS — Cada RegExp explicada

### `/^canvas(--|$)/i`

Captura IDs que começam com "canvas", seguidos de `--` (separador BEM/Inkscape) ou fim de string.

| Match        | Não-match         |
|--------------|--------------------|
| `canvas`     | `canvas-overlay`   |
| `canvas--bg` | `my-canvas`        |
| `Canvas`     | `canvasElement`    |

O `--` é o separador duplo usado pelo Inkscape para IDs de clones. O `$` captura o caso onde o ID é exatamente "canvas".

### `/^background(--|$)/i`

Padrão idêntico ao anterior para "background".

| Match              | Não-match             |
|--------------------|-----------------------|
| `background`       | `background-image`    |
| `background--main` | `dark-background`     |
| `Background`       | `backgrounder`        |

### `/^bg(--|$)/i`

Abreviação comum de "background".

| Match    | Não-match   |
|----------|-------------|
| `bg`     | `bg-color`  |
| `bg--01` | `mybg`      |
| `BG`     | `bgImage`   |

### `/^fundo(--|$)/i`

Versão em português — comum em SVGs criados por equipes brasileiras.

| Match      | Não-match    |
|------------|--------------|
| `fundo`    | `fundo-azul` |
| `fundo--1` | `profundo`   |

### Flag `i` (case-insensitive)

Todos os padrões usam `/i` para capturar variações de capitalização (`Canvas`, `BACKGROUND`, `Fundo`).

## Por que não é um sanitizer

O audit **não remove, não filtra, não bloqueia** os IDs suspeitos. Ele apenas:
1. Emite `console.warn()` para debug
2. Retorna a lista de IDs para o chamador decidir

Essa decisão é intencional:
- O SVG pode ter um grupo legítimo chamado "background" que **deve** ser clicável
- Automatizar remoção sem validação humana poderia esconder problemas
- O aviso no console ajuda o designer a identificar erros de marcação

## Por que arquivo separado do parser

O `parser.ts` é responsável por **extrair** regiões. O `audit.ts` é responsável por **validar**. Separar essas responsabilidades:
- Permite que o audit evolua independentemente (novos padrões, threshold, config)
- Mantém o parser focado em parsing, sem lógica de negócio
- Facilita testes — o audit pode ser testado em isolamento com um Map manual

## Como o toast é exibido no main.ts

Quando `auditRegions()` retorna IDs suspeitos, o `main.ts` cria um toast visual:

```ts
if (parsed.suspiciousIds.length > 0) {
  const list = parsed.suspiciousIds.join(', ');
  const msg = document.createElement('div');
  msg.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: #7c2d12',
    'color: #fef2f2',
    'font-family: monospace',
    'font-size: 13px',
    'padding: 12px 20px',
    'border-radius: 8px',
    'border: 1px solid #ef4444',
    'z-index: 9999',
    'max-width: 600px',
    'text-align: center',
    'line-height: 1.5',
  ].join(';');
  msg.textContent = 
    `⚠️ IDs suspeitos detectados: ${list}. ` +
    `Verifique estes elementos no SVG.`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 8000);
}
```

O toast:
- Aparece na parte inferior centralizada da tela
- Fundo vermelho escuro (`#7c2d12`) com borda vermelha
- Lista os IDs suspeitos
- Desaparece automaticamente após 8 segundos
- Usa `z-index: 9999` para ficar acima de tudo

## Parâmetros

| Parâmetro | Tipo                    | Descrição                          |
|-----------|-------------------------|------------------------------------|
| `regions` | `Map<string, Region>`   | Mapa de regiões extraídas do SVG  |

## Retorno

| Tipo       | Descrição                                     |
|------------|-----------------------------------------------|
| `string[]` | Array de IDs que matcharam algum padrão suspeito |

## Exemplos de uso

```ts
// parser.ts — chamado ao final do parsing
const suspiciousIds = auditRegions(regions);

// main.ts — exibe o toast se houver IDs suspeitos
if (suspiciousIds.length > 0) {
  showToast(`IDs suspeitos: ${suspiciousIds.join(', ')}`);
}
```

## Como adicionar novos padrões no futuro

Para detectar novos IDs suspeitos, basta adicionar um `RegExp` ao array:

```ts
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /^canvas(--|$)/i,
  /^background(--|$)/i,
  /^bg(--|$)/i,
  /^fundo(--|$)/i,
  // ↓ Novos padrões
  /^layer(--|$)/i,      // "layer" genérico do Illustrator
  /^frame(--|$)/i,      // "frame" do Figma
  /^artboard(--|$)/i,   // "artboard" do Sketch
];
```

Cada padrão deve:
1. Usar `^` para ancorar no início do ID (evita falsos positivos em IDs como `my-canvas-region`)
2. Usar `(--|$)` para aceitar separadores Inkscape ou fim de string
3. Usar `/i` para case-insensitivity
4. Ser testado contra IDs reais do projeto antes de ser adicionado

## Dependências

| Direção    | Módulo       | Relação                              |
|------------|-------------|--------------------------------------|
| Importa    | `types.ts`   | Interface `Region`                   |
| Chamado por | `parser.ts` | Após extrair regiões do SVG          |
| Resultado usado por | `main.ts` | Para exibir toast de aviso    |
