import { NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { setWallpaper } from "@/lib/apps";
import { IMAGE_MODEL, openai } from "@/lib/openai";

/** Wallpaper pane: "Generate…" writes a new wallpaper with the image model and sets it. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt || String(prompt).trim().length < 3) return NextResponse.json({ error: "Describe the wallpaper." }, { status: 400 });
  const r = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: `macOS desktop wallpaper, wide composition, no text, no logos, no people, clean and high detail: ${String(prompt).slice(0, 400)}`,
    size: "1536x1024",
    quality: "medium",
    n: 1,
  });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) return NextResponse.json({ error: "No image came back." }, { status: 502 });
  const dir = path.join(process.cwd(), "public", "wallpapers");
  await mkdir(dir, { recursive: true });
  const file = `u${user.id}-${Date.now()}.png`;
  await writeFile(path.join(dir, file), Buffer.from(b64, "base64"));
  const url = `/wallpapers/${file}`;
  await setWallpaper(user.id, url);
  return NextResponse.json({ url });
}
