/** "2026-11-01 22:14", in UTC, or a dash when there is no date. Server-rendered, so it never differs between server and browser. */
export function when(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "—" : t.toISOString().slice(0, 16).replace("T", " ");
}
