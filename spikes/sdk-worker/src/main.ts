import * as Comlink from 'comlink';
import type { RadarSdkApi } from './worker';

// Main thread: only a Comlink proxy. t0 is taken before the worker is spawned.
const t0 = performance.now();
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const sdk = Comlink.wrap<RadarSdkApi>(worker);
(window as any).sdk = sdk;
(window as any).spike = { t0, worker, sinceStart: () => performance.now() - t0 };
document.getElementById('out')!.textContent = 'worker spawned';
