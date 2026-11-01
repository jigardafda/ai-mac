import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { requireUser } from "@/lib/auth";
import { storageStats } from "@/lib/apps";
import { CHAT_MODEL, CODE_MODEL, IMAGE_MODEL } from "@/lib/openai";

let commit = "";
function gitCommit() {
  if (commit) return commit;
  try { commit = execSync("git rev-parse --short HEAD", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { commit = "dev"; }
  return commit;
}

/** About This Mac, Storage and Software Update read from here. */
export async function GET() {
  const user = await requireUser();
  const apps = await storageStats(user.id);
  return NextResponse.json({
    name: "AI Mac",
    version: "1.0",
    build: gitCommit(),
    chip: "AI Mac Engine",
    models: { code: CODE_MODEL, chat: CHAT_MODEL, image: IMAGE_MODEL },
    node: process.version,
    uptime: Math.floor(process.uptime()),
    user: user.email,
    apps,
    totals: { apps: apps.length, built: apps.filter((a) => a.version).length, code: apps.reduce((n, a) => n + a.code, 0), data: apps.reduce((n, a) => n + a.data, 0), versions: apps.reduce((n, a) => n + a.versions, 0) },
  });
}
