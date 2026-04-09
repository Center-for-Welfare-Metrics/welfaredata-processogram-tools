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
