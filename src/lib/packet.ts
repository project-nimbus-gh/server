import { STX, ETX, PacketType } from "./constants";
import { PacketHandlingError } from "./errors";

export type SensorPacket = {
  /**
   * Packet type: internally a 4-bit unsigned integer
   */
  type: PacketType;

  /**
   * Temperature in Celsius, from -150.00 to 150.00 with 0.01 precision
   */
  temperature: number;

  /**
   * Humidity percentage, from 0.0 to 100.0 with 0.1 precision
   */
  humidity: number;

  /**
   * Serial number, a numeric identifier for the telemetry sensor, up to 32-bit unsigned integer limit
   */
  serial: number;
};

/**
 * Validates a SensorPacket object to ensure all fields are within their specified ranges.
 * @param packet The SensorPacket to validate
 * @throws PacketHandlingError if any field is out of its valid range
 */
export function validatePacket(packet: SensorPacket): void {
  if (packet.type < 0 || packet.type > 15) {
    throw new PacketHandlingError("Packet type must be between 0 and 15");
  }
  if (packet.temperature < -150 || packet.temperature > 150) {
    throw new PacketHandlingError("Packet temperature must be between -150 and 150 °C");
  }
  if (packet.humidity < 0 || packet.humidity > 100) {
    throw new PacketHandlingError("Packet humidity must be between 0 and 100 %");
  }
  if (packet.serial < 0 || packet.serial > 0xFFFFFFFF) {
    throw new PacketHandlingError("Packet serial number must be a valid unsigned 32-bit integer");
  }
}

/**
 * Packs a SensorPacket into a Uint8Array for transmission.
 * @param packet The SensorPacket to pack
 * @returns A Uint8Array containing the packed packet
 */
export function pack(packet: SensorPacket): Uint8Array {
  const tScaled = Math.round((packet.temperature + 150) * 100);
  const hScaled = Math.round(packet.humidity * 10);

  let tel = 0;
  tel |= (packet.type & 0x0F) << 28;
  tel |= (tScaled & 0x7FFF) << 13;
  tel |= (hScaled & 0x03FF) << 3;

  let count = 0;
  for (let i = 1; i < 32; i++) if ((tel >> i) & 1) count++;
  if (count % 2 !== 0) tel |= 0x01;

  const buf = new Uint8Array(10);
  buf[0] = STX;

  // Main data
  new DataView(buf.buffer).setUint32(1, tel, false); // Big Endian

  // Serial number
  new DataView(buf.buffer).setUint32(5, packet.serial, false);

  buf[9] = ETX;
  return buf;
}

/**
 * Unpacks a Uint8Array into a SensorPacket object.
 * @param raw The Uint8Array to unpack
 * @returns A SensorPacket object if the array is valid, null otherwise
 */
export function unpack(raw: Uint8Array): (SensorPacket & { valid: boolean }) | null {
  if (raw[0] !== STX || raw[raw.length - 1] !== ETX) return null;

  const view = new DataView(raw.buffer);
  const tel = view.getUint32(1, false);
  const serial = view.getUint32(5, false);

  // Parity check
  let count = 0;
  for (let i = 0; i < 32; i++) if ((tel >> i) & 1) count++;

  const temperature = Number((((tel >> 13) & 0x7FFF) / 100 - 150).toFixed(2));
  const humidity = Number((((tel >> 3) & 0x03FF) / 10).toFixed(1));

  return {
    type: (tel >> 28) & 0x0F,
    temperature,
    humidity,
    serial: serial,
    valid: (count % 2 === 0)
  };
}
