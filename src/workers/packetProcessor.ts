import { PacketType } from '../lib/constants';
import { unpack } from '../lib/packet';
import { createLogger } from '../lib/logger';
import type { TelemetryRecord } from '../lib/telemetry';

const log = createLogger('packet-worker');

export function handlePacketMessage(message: Uint8Array, emit: (payload: unknown) => void) {
  try {
    const packet = unpack(message);
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
