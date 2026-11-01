import { NextResponse } from "next/server";
import os from "node:os";
import { requireUser } from "@/lib/auth";
import { getJob } from "@/lib/jobs";
import { listApps } from "@/lib/apps";
import { sql } from "@/lib/db";

let lastCpu = process.cpuUsage();
let lastAt = Date.now();

/** Live numbers for Activity Monitor: the server process, the machine, the database, and this user's builds. */
export async function GET() {
  const user = await requireUser();
  const now = Date.now();
  const cpu = process.cpuUsage(lastCpu);
  const elapsed = Math.max(1, (now - lastAt) * 1000);
  const serverCpu = Math.min(100, ((cpu.user + cpu.system) / elapsed) * 100);
  lastCpu = process.cpuUsage(); lastAt = now;
  const mem = process.memoryUsage();
  const load = os.loadavg();
  const cores = os.cpus().length || 1;
  const apps = await listApps(user.id);
  const [db] = await sql<{ size: string; conns: number }[]>`select pg_size_pretty(pg_database_size(current_database())) as size, (select count(*)::int from pg_stat_activity where datname = current_database()) as conns`;
  const [me] = await sql<{ versions: number; records: number; bytes: number }[]>`
    select (select count(*)::int from app_versions v join apps a on a.id = v.app_id where a.user_id = ${user.id}) as versions,
           (select count(*)::int from app_data d join apps a on a.id = d.app_id where a.user_id = ${user.id}) as records,
           coalesce((select sum(length(v.code)) from app_versions v join apps a on a.id = v.app_id where a.user_id = ${user.id}), 0)::int as bytes`;
  const building = apps.filter((a) => { const j = getJob(a.id); return j && !j.done; }).map((a) => { const j = getJob(a.id)!; return { slug: a.slug, name: a.name, kind: j.kind, started: j.started, chars: j.code.length, status: j.status }; });
  return NextResponse.json({
    at: now,
    server: { pid: process.pid, cpu: serverCpu, rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, external: mem.external, uptime: process.uptime(), node: process.version },
    machine: { cores, load1: load[0], load5: load[1], load15: load[2], totalMem: os.totalmem(), freeMem: os.freemem(), platform: `${os.type()} ${os.release()}`, hostUptime: os.uptime() },
    db: { size: db.size, connections: db.conns },
    user: { apps: apps.length, built: apps.filter((a) => a.version).length, ...me },
    building,
  });
}
