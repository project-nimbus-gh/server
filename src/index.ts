import { pack, unpack } from "./lib/packet";

const encoded = pack({ type: 1, temperature: 22.55, humidity: 45.2, serial: 987654 });

console.log("Hex Stream:", Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log("Binary Stream:", Array.from(encoded).map(b => b.toString(2).padStart(8, '0')).join(' '));

console.log("\nDecoded:", unpack(encoded))
