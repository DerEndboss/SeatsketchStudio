/** Short random IDs (≈ 64 bits), collision-safe enough for local projects. */
export function newId(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}${r[0].toString(36)}${r[1].toString(36)}`;
}
