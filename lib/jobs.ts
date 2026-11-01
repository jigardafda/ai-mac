import type { GenEvent } from "./generate";

/**
 * A build runs as a server-side job that outlives the request that started it.
 * Closing the window, reloading the page or opening the app a second time
 * attaches to the same job and replays what has been written so far, so a
 * build can never be lost or started twice.
 */
export type JobEvent = GenEvent | { type: "meta"; started: number; kind: "build" | "improve" } | { type: "done"; version?: number };
type Listener = (ev: JobEvent | null) => void;
export type Job = {
  appId: number;
  kind: "build" | "improve";
  started: number;
  finished?: number;
  done: boolean;
  status: string;
  code: string; // chunks so far
  tail: JobEvent[]; // non-chunk events in order
  listeners: Set<Listener>;
};

const STALE_MS = 12 * 60_000; // a job that has not finished in this long is abandoned
const KEEP_MS = 30_000; // finished jobs stay attachable briefly for late reloads

const g = globalThis as unknown as { __aicJobs?: Map<number, Job> };
const jobs = (g.__aicJobs ??= new Map());

export function getJob(appId: number): Job | undefined {
  const j = jobs.get(appId);
  if (!j) return undefined;
  if (j.done && j.finished && Date.now() - j.finished > KEEP_MS) { jobs.delete(appId); return undefined; }
  if (!j.done && Date.now() - j.started > STALE_MS) { jobs.delete(appId); return undefined; }
  return j;
}

export function startJob(appId: number, kind: Job["kind"], gen: AsyncGenerator<GenEvent>, onDone: (code: string) => Promise<Record<string, unknown>>): Job {
  const job: Job = { appId, kind, started: Date.now(), done: false, status: "Starting", code: "", tail: [], listeners: new Set() };
  jobs.set(appId, job);
  const emit = (ev: JobEvent) => {
    if (ev.type === "chunk") job.code += ev.text;
    else { job.tail.push(ev); if (ev.type === "status") job.status = ev.text; }
    for (const l of job.listeners) l(ev);
  };
  (async () => {
    try {
      for await (const ev of gen) {
        if (ev.type === "done") emit({ type: "done", ...(await onDone(ev.code)) });
        else emit(ev);
      }
    } catch (e) {
      emit({ type: "error", text: e instanceof Error ? e.message : "The build failed" });
    } finally {
      job.done = true;
      job.finished = Date.now();
      for (const l of job.listeners) l(null);
      job.listeners.clear();
      setTimeout(() => { if (jobs.get(appId) === job) jobs.delete(appId); }, KEEP_MS + 1000);
    }
  })();
  return job;
}

/** Streams a job as NDJSON: a meta line, everything so far, then live events until it ends. */
export function streamJob(job: Job): Response {
  const enc = new TextEncoder();
  let listener: Listener | null = null;
  const body = new ReadableStream({
    start(controller) {
      const send = (o: unknown) => { try { controller.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* client went away */ } };
      send({ type: "meta", started: job.started, kind: job.kind });
      for (const ev of job.tail) if (ev.type === "status") send(ev);
      if (job.code) send({ type: "chunk", text: job.code });
      const finals = job.tail.filter((e) => e.type === "done" || e.type === "error");
      if (job.done) { for (const ev of finals) send(ev); controller.close(); return; }
      listener = (ev) => {
        if (ev === null) { try { controller.close(); } catch { /* already closed */ } return; }
        send(ev);
      };
      job.listeners.add(listener);
    },
    cancel() {
      if (listener) job.listeners.delete(listener);
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
