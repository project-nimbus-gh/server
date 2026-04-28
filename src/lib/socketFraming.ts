const textDecoder = new TextDecoder();

export type FrameKind = 'json' | 'binary';

export type ParsedFrame =
  | { kind: 'json'; payload: string }
  | { kind: 'binary'; payload: Uint8Array<ArrayBufferLike> };

export function appendChunk(buffer: Uint8Array<ArrayBufferLike>, chunk: Uint8Array<ArrayBufferLike>) {
  const next = new Uint8Array(buffer.length + chunk.length);
  next.set(buffer, 0);
  next.set(chunk, buffer.length);
  return next;
}

export function parseIncomingBuffer(buffer: Uint8Array<ArrayBufferLike>): { frames: ParsedFrame[]; remainder: Uint8Array<ArrayBufferLike> } {
  const text = textDecoder.decode(buffer);

  if (text.trim().startsWith('{')) {
    const frames = text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => ({ kind: 'json' as const, payload: line }));

    return { frames, remainder: new Uint8Array(0) };
  }

  const frames: ParsedFrame[] = [];
  let remainder = buffer;

  while (remainder.length >= 10) {
    if (remainder[0] !== 0x02) {
      let startIndex = -1;
      for (let i = 1; i < remainder.length; i++) {
        if (remainder[i] === 0x02) {
          startIndex = i;
          break;
        }
      }

      if (startIndex === -1) {
        remainder = new Uint8Array(0);
        break;
      }

      remainder = remainder.slice(startIndex);
      if (remainder.length < 10) break;
    }

    const frame = remainder.slice(0, 10);
    if (frame[9] !== 0x03) {
      remainder = remainder.slice(1);
      continue;
    }

    frames.push({ kind: 'binary', payload: frame });
    remainder = remainder.slice(10);
  }

  return { frames, remainder };
}
