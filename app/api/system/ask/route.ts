import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { CHAT_MODEL, openai } from "@/lib/openai";

/** The `ask` command of the Linux app's macOS-style shell. */
export async function POST(req: Request) {
  await requireUser();
  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const r = await openai.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 800,
    messages: [
      { role: "system", content: "You answer inside a terminal on a Mac-style desktop called AI Mac. Plain text only, no markdown, at most 12 lines, wrap at 76 columns." },
      { role: "user", content: String(prompt).slice(0, 4000) },
    ],
  });
  return NextResponse.json({ text: r.choices[0]?.message?.content ?? "" });
}
