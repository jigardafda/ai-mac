import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteData, getApp, getData, listKeys, setData } from "@/lib/apps";

type Ctx = { params: Promise<{ slug: string }> };
const MAX_VALUE = 1_000_000; // 1 MB of JSON per key is plenty for these apps

export async function GET(req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key");
  if (key === null) return NextResponse.json({ keys: await listKeys(app.id) });
  return NextResponse.json({ value: await getData(app.id, key) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const text = await req.text();
  if (text.length > MAX_VALUE) return NextResponse.json({ error: "Too much data for one key" }, { status: 413 });
  const { key, value } = JSON.parse(text);
  if (typeof key !== "string" || !key) return NextResponse.json({ error: "key required" }, { status: 400 });
  // Setting null (or undefined) removes the key; jsonb cannot store SQL null.
  if (value === null || value === undefined) await deleteData(app.id, key);
  else await setData(app.id, key, value);
  return NextResponse.json({ ok: true });
}
