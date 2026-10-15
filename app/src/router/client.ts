import type { BikeStation, PlanRequest, PlanResult } from './types';

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: PlanResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: PlanResult; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result!);
    };
  }
  return worker;
}

export function planInWorker(req: PlanRequest, bikes: BikeStation[] | null): Promise<PlanResult> {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, req: structuredClone(req), bikes: bikes ? structuredClone(bikes) : null });
  });
}
