import net from 'net';
import { Worker, type WorkerOptions } from 'worker_threads';
import { createLogger } from './lib/logger';
import { closeTelemetryBuffer, drainTelemetryBuffer, enqueueTelemetryRecord } from './lib/redisBuffer';
import { appendChunk, parseIncomingBuffer } from './lib/socketFraming';
import type { TelemetryRecord } from './lib/telemetry';
import { createWorkerPool } from './lib/workerPool';

const log = createLogger('server');
const WORKER_COUNT = 4;
const FLUSH_INTERVAL_MS = 15_000;
let flushInProgress = false;

const workerPool = createWorkerPool(WORKER_COUNT, new URL('./worker.ts', import.meta.url), (record) => {
  void enqueueTelemetryRecord(record as TelemetryRecord);
});

const dbWorker = new Worker(new URL('./dbWorker.ts', import.meta.url), { type: 'module' } as WorkerOptions);
dbWorker.on('message', (message: any) => {
  if (message?.action === 'log') log.info({ component: 'db' }, message.msg);
  if (message?.action === 'error') log.error({ component: 'db', error: message.error }, 'database worker error');
});
dbWorker.on('error', (error) => log.error({ error }, 'database worker crashed'));

setInterval(() => {
  if (flushInProgress) return;

  flushInProgress = true;
  void (async () => {
    try {
      const toFlush = await drainTelemetryBuffer();
      if (toFlush.length === 0) return;

      dbWorker.postMessage({ action: 'flush', records: toFlush });
      log.info({ flushed: toFlush.length }, 'flushed buffered records to database worker');
    } finally {
      flushInProgress = false;
    }
  })();
}, FLUSH_INTERVAL_MS);

const server = net.createServer((socket) => {
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  socket.on('data', (chunk: Uint8Array<ArrayBufferLike>) => {
    buffer = appendChunk(buffer, chunk);
    const { frames, remainder } = parseIncomingBuffer(buffer);
    buffer = remainder;

    for (const frame of frames) {
      workerPool.post(frame);
    }
  });

  socket.on('error', (error) => log.error({ error }, 'socket error'));
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => log.info({ port: PORT }, 'TCP server listening'));

process.once('SIGINT', async () => {
  log.info('shutting down');
  server.close();
  await workerPool.shutdown();
  await closeTelemetryBuffer();
  await dbWorker.terminate();
  process.exit(0);
});
