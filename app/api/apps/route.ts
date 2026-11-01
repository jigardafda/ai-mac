import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createApp, listApps } from "@/lib/apps";
export { listApps };
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
  let icon = "/icons/new-app.png";
  try {
    icon = await generateIcon(design.iconPrompt);
  } catch {
    // keep the placeholder icon; the app still works
  }
  // Two submissions at once can race for the same slug, so retry with a suffix on conflict.
  for (let n = 1; n <= 6; n++) {
    const slug = n === 1 ? design.slug : `${design.slug}-${n}`;
    try {
      await createApp(user.id, { slug, name: design.name, description: design.description, icon_url: icon });
      return NextResponse.json({ slug, name: design.name });
    } catch (e) {
      if (!(e instanceof Error && /unique|duplicate/i.test(e.message))) throw e;
    }
  }
  return NextResponse.json({ error: "Could not find a free name for the app." }, { status: 409 });
}
