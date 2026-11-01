import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getApp } from "@/lib/apps";
import { CHAT_MODEL, openai } from "@/lib/openai";

/** Lets a running app ask the model a question. Short answers, no tools. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const { prompt, options } = await req.json().catch(() => ({}));
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const r = await openai.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 1200,
    messages: [
      { role: "system", content: options?.system || `You are a helper inside the "${app.name}" app on a user's desktop. Answer briefly and plainly.` },
      { role: "user", content: String(prompt).slice(0, 8000) },
    ],
  });
  return NextResponse.json({ text: r.choices[0]?.message?.content ?? "" });
}
