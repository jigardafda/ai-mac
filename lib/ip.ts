/** The caller's address as the platform proxy saw it. The proxy appends the real client, so the last hop is the one to trust. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim().slice(0, 64);
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",").pop()!.trim() : "unknown").slice(0, 64);
}
