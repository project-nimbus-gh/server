import net from 'net';
import { Worker, type WorkerOptions } from 'worker_threads';
import { createLogger } from './lib/logger';
import { appendChunk, parseIncomingBuffer } from './lib/socketFraming';
import type { TelemetryRecord } from './lib/telemetry';
import { createWorkerPool } from './lib/workerPool';

const log = createLogger('server');
const WORKER_COUNT = 4;
const FLUSH_INTERVAL_MS = 15_000;

const memoryBuffer: TelemetryRecord[] = [];

const workerPool = createWorkerPool(WORKER_COUNT, new URL('./worker.ts', import.meta.url), (record) => {
  pushToMemory(record as TelemetryRecord);
});

const dbWorker = new Worker(new URL('./dbWorker.ts', import.meta.url), { type: 'module' } as WorkerOptions);
dbWorker.on('message', (message: any) => {
  if (message?.action === 'log') log.info({ component: 'db' }, message.msg);
  if (message?.action === 'error') log.error({ component: 'db', error: message.error }, 'database worker error');
});
dbWorker.on('error', (error) => log.error({ error }, 'database worker crashed'));

function pushToMemory(record: TelemetryRecord) {
  memoryBuffer.push(record);
}

setInterval(() => {
  if (memoryBuffer.length === 0) return;
  const toFlush = memoryBuffer.splice(0, memoryBuffer.length);
  dbWorker.postMessage({ action: 'flush', records: toFlush });
  log.info({ flushed: toFlush.length }, 'flushed buffered records to database worker');
}, FLUSH_INTERVAL_MS);

const server = net.createServer((socket) => {
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  socket.on('data', (chunk: Uint8Array<ArrayBufferLike>) => {
    buffer = appendChunk(buffer, chunk);
    const { frames, remainder } = parseIncomingBuffer(buffer);
    buffer = remainder;

    for (const frame of frames) {
      workerPool.post({ type: 'buffer', data: frame.payload as Uint8Array });
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
  await dbWorker.terminate();
  process.exit(0);
});
