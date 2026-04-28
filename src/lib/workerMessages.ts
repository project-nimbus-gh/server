export type WorkerMessage =
  | { type: 'buffer'; data: Uint8Array }
  | { type: 'json'; data: unknown };
