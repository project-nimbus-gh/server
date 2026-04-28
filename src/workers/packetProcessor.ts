import { PacketType } from '../lib/constants';
import { unpack } from '../lib/packet';
import { createLogger } from '../lib/logger';
import type { TelemetryRecord } from '../lib/telemetry';

const log = createLogger('packet-worker');

type InMsg = { type: 'buffer'; data: Uint8Array } | { type: 'json'; data: unknown };

export function handlePacketMessage(message: InMsg, emit: (payload: unknown) => void) {
  try {
    if (message.type !== 'buffer') {
      log.debug({ payloadType: message.type }, 'ignoring non-binary message');
      return;
    }

    const packet = unpack(message.data);
    if (packet && packet.valid && packet.type === PacketType.SENSOR) {
      const record: TelemetryRecord = {
        deviceId: packet.serial,
        timestamp: new Date(),
        temperature: packet.temperature,
        humidity: packet.humidity
      };
      emit({ action: 'record', record });
    }
  } catch (error) {
    log.error({ error }, 'failed to process packet');
    emit({ action: 'error', error: String(error) });
  }
}
