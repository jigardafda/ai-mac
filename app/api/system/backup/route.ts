import { requireUser } from "@/lib/auth";
import { exportAll } from "@/lib/apps";

/** Time Machine's "Back Up Now": a JSON file with every app, its data and the settings. */
export async function GET() {
  const user = await requireUser();
  const body = JSON.stringify(await exportAll(user.id), null, 1);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="ai-mac-backup-${stamp}.json"` } });
}
