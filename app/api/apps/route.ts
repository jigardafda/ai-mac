import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createApp, listApps } from "@/lib/apps";
import { designApp } from "@/lib/generate";
import { generateIcon } from "@/lib/icons";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ apps: await listApps(user.id) });
}

/** Creates a new app from a wish. The code itself is generated on first open. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { wish } = await req.json().catch(() => ({}));
  if (!wish || String(wish).trim().length < 4) return NextResponse.json({ error: "Describe the app in a few words." }, { status: 400 });
  const design = await designApp(String(wish).trim());
  const existing = await listApps(user.id);
  let slug = design.slug;
  let n = 2;
  while (existing.some((a) => a.slug === slug)) slug = `${design.slug}-${n++}`;
  let icon = "/icons/new-app.png";
  try {
    icon = await generateIcon(design.iconPrompt);
  } catch {
    // keep the placeholder icon; the app still works
  }
  await createApp(user.id, { slug, name: design.name, description: design.description, icon_url: icon });
  return NextResponse.json({ slug, name: design.name });
}
