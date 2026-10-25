// Money is integer centavos everywhere; format only at the UI edge.
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export const formatPeso = (centavos: number) => peso.format(centavos / 100);

/** "1,250.50" -> 125050. Returns null for anything that is not a non-negative amount with <=2 decimals. */
export function pesosToCentavos(input: string): number | null {
  const s = input.trim().replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
}
