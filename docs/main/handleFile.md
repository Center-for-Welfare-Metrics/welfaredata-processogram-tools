# handleFile() — Pipeline completo de carregamento do SVG

## O que faz

Orquestra todo o pipeline de carregamento quando o usuário fornece um arquivo SVG: leitura, parsing, rasterização, construção da hitmap, setup do canvas, cálculo da câmera inicial e início do loop de renderização.

```ts
async function handleFile(file: File): Promise<void>
```

## Por que existe

O carregamento é uma sequência de 8 passos assíncronos que devem executar em ordem. Centralizar no `handleFile()` garante que cada passo tenha acesso ao resultado do anterior e que o progresso visual seja atualizado corretamente.

## Pipeline passo a passo

### 1. Leitura do arquivo

```ts
setProgress(10, 'Lendo arquivo...');
svgText = await file.text();
```

Converte o `File` do input/drop para string. `file.text()` é assíncrono porque lê do disco.

### 2. parseSvg() → regions, dimensões, suspiciousIds

```ts
setProgress(25, 'Extraindo regioes...');
await tick();
const parsed = parseSvg(svgText);
regions = parsed.regions;
svgWidth = parsed.svgWidth;
svgHeight = parsed.svgHeight;
```

O `parseSvg()` é síncrono mas pesado (injeta no DOM, itera elementos, calcula bboxes). O `await tick()` antes cede um frame ao browser para atualizar a barra de progresso antes do JavaScript bloquear.

### 3. Audit toast se necessário

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
    // ...
  ].join(';');
  msg.textContent = 
    `⚠️ IDs suspeitos detectados: ${list}. ` +
    `Verifique estes elementos no SVG.`;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 8000);
}
```

Se o audit encontrou IDs suspeitos, um toast vermelho é exibido por 8 segundos. O toast:
- Fica fixo na parte inferior centralizada da tela
- Lista os IDs suspeitos
- Remove-se automaticamente via `setTimeout`

### 4. loadSvgImage()

```ts
setProgress(40, 'Carregando imagem SVG...');
await tick();
svgImage = await loadSvgImage(svgText, svgWidth, svgHeight);
```

Converte o SVG text em `HTMLImageElement` via Blob → ObjectURL → Image. O `Image` é necessário como fonte para `drawImage()` no rasterizer.

#### Bug e correção: normalização de dimensões antes do Blob

**O bug** — quando um SVG não possui atributos `width` e `height` explícitos no elemento raiz (situação comum em arquivos exportados do Inkscape com apenas `viewBox`), o browser carrega a imagem com a resolução de fallback padrão de **300×150 px**, independente do tamanho real do SVG. Isso causava degradação severa no raster cache porque os tiles eram gerados a partir de uma imagem tiny.

**A correção** — antes de criar o Blob, `loadSvgImage()` normaliza o SVG de forma incondicional, seguindo o mesmo padrão já aplicado em `hitmap.ts`:

```ts
function loadSvgImage(text: string, svgW: number, svgH: number): Promise<HTMLImageElement> {
  // 1. Parse the raw SVG text into a DOM document.
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svgRoot = doc.documentElement;

  // 2. Remove any <style> blocks that may override width/height via CSS.
  for (const style of Array.from(svgRoot.querySelectorAll('style'))) {
    style.remove();
  }

  // 3. Remove stale width/height attributes.
  svgRoot.removeAttribute('width');
  svgRoot.removeAttribute('height');

  // 4. Inject correct dimensions unconditionally.
  svgRoot.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svgRoot.setAttribute('width',   String(svgW));
  svgRoot.setAttribute('height',  String(svgH));

  // 5. Serialize back and use the normalized string for the Blob.
  const normalizedText = new XMLSerializer().serializeToString(doc);

  return new Promise((resolve, reject) => {
    const blob = new Blob([normalizedText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load SVG image')); };
    img.src = url;
  });
}
```

A normalização é **incondicional**: mesmo que o SVG já tenha atributos `width`/`height` corretos (como o Hatchery com 1755.102×1132.753), os valores são sobrescritos com os mesmos valores calculados por `parseSvg()`. Isso é seguro porque `svgWidth` e `svgHeight` **derivam** desses atributos originais.

**Importância para produção** — qualquer SVG enviado por Jean ou por designers futuros funcionará corretamente, independente de como foi exportado do Inkscape ou de outra ferramenta. O `naturalWidth`/`naturalHeight` reportado pelos `console.log` em `handleFile()` deve refletir as dimensões reais do SVG, não 300×150.

Este padrão é idêntico ao aplicado em `hitmap.ts → fallbackToRasterize()`. As duas funções normalizam de forma independente porque cada uma cria sua própria imagem para propósitos distintos (raster cache vs. hitmap).

### 5. buildRasterCache()

```ts
setProgress(55, 'Rasterizando low tier...');
await tick();
rasterizerConfig = { svgText, svgImage, svgWidth, svgHeight, regions };
rasterCache = await buildRasterCache(rasterizerConfig);
```

Gera os tiers low (1×) e mid (4×). O `rasterizerConfig` também é salvo para uso futuro em `buildDynamicTile()`.

### 6. hitmap.build()

```ts
setProgress(70, 'Construindo hit-map pixel-perfect...');
await tick();
hitmap = new HitMap();
await hitmap.build(svgText, regions, svgWidth, svgHeight);
```

Constrói as 4 layers da hitmap (uma por nível hierárquico). Assíncrono por causa do carregamento de imagens durante a rasterização de cada layer.

### 7. Setup do canvas e câmera inicial

```ts
setProgress(85, 'Inicializando canvas...');
await tick();
setupCanvas();
hud = new Hud();

const fit = fitToCanvas(svgWidth, svgHeight, window.innerWidth, window.innerHeight);
camera.setTransform(fit.scale, fit.translateX, fit.translateY);
target.setTransform(fit.scale, fit.translateX, fit.translateY);

nav = { level: -1, focusedId: null, history: [] };
```

- `setupCanvas()` dimensiona o canvas para fullscreen com DPR
- `fitToCanvas()` calcula a câmera para mostrar o SVG inteiro
- **Camera e target são setados para o mesmo valor** — sem animação inicial (snap direto)
- NavState é resetado para ROOT

### 8. Setup de eventos e início do rAF loop

```ts
setupEvents(
  mainCanvas, hitmap, nav, regions,
  camera, target, svgWidth, svgHeight,
  onDrillDown, onDrillUp, onReset, onNeedsRedrawCb
);

setProgress(100, 'Pronto!');
const loadTime = performance.now() - t0;

await tick();
uploadPhase.style.display = 'none';
canvasPhase.style.display = 'block';

hud.setLoadTime(loadTime);
needsRedraw = true;
lastFrameTime = performance.now();
renderLoop(lastFrameTime);
```

- `setupEvents()` registra handlers de click, mousemove, keydown, resize
- A UI troca da fase de upload para a fase de canvas
- O tempo total de carregamento é exibido no HUD
- `renderLoop()` é chamado pela primeira vez, iniciando o ciclo rAF

## Parâmetros

| Parâmetro | Tipo   | Descrição                      |
|-----------|--------|--------------------------------|
| `file`    | `File` | Arquivo SVG do input ou drop   |

## Retorno

`Promise<void>` — assíncrono.

## A função tick()

```ts
function tick(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => r()));
}
```

Cede um frame ao browser entre passos pesados. Sem isso, a barra de progresso não seria atualizada porque JavaScript é single-threaded — o browser não consegue pintar entre duas operações síncronas consecutivas.

## Dependências

| Direção | Módulo           | Relação                                |
|---------|------------------|----------------------------------------|
| Chama   | `parseSvg()`     | Passo 2 — extração de regiões         |
| Chama   | `buildRasterCache()` | Passo 5 — tiers low/mid           |
| Chama   | `hitmap.build()` | Passo 6 — layers de hit-testing       |
| Chama   | `setupCanvas()`  | Passo 7 — dimensionamento             |
| Chama   | `fitToCanvas()`  | Passo 7 — câmera inicial              |
| Chama   | `setupEvents()`  | Passo 8 — handlers de interação       |
| Chama   | `renderLoop()`   | Passo 8 — início do ciclo rAF         |
