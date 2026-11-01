/**
 * The caller's address as the platform proxy saw it. The proxy appends the real
 * client to X-Forwarded-For, so the last hop is the one to trust; anything the
 * caller put in front of it is ignored. X-Real-IP is not used because nothing
 * here proves the proxy overwrites it.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",").pop()!.trim() : "unknown").slice(0, 64);
}
