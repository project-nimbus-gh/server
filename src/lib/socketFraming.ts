const textDecoder = new TextDecoder();

export type FrameKind = 'json' | 'binary';

export function appendChunk(buffer: Uint8Array<ArrayBufferLike>, chunk: Uint8Array<ArrayBufferLike>) {
  const next = new Uint8Array(buffer.length + chunk.length);
  next.set(buffer, 0);
  next.set(chunk, buffer.length);
  return next;
}

export function parseIncomingBuffer(buffer: Uint8Array<ArrayBufferLike>): { frames: Uint8Array<ArrayBufferLike>[]; remainder: Uint8Array<ArrayBufferLike> } {
  const text = textDecoder.decode(buffer);

  const frames: Uint8Array<ArrayBufferLike>[] = [];
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

    frames.push(frame);
    remainder = remainder.slice(10);
  }

  return { frames, remainder };
}
