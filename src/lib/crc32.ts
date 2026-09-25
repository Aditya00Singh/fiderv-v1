// Precomputed CRC32 table for fast polynomial lookup
const makeCRCTable = (): Uint32Array => {
  let c: number;
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
};

const crcTable = makeCRCTable();

export function calculateCRC32(data: Uint8Array, previousCrc = 0 ^ (-1)): number {
  let crc = previousCrc;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
  }
  return crc;
}

export function finalizeCRC32(crc: number): string {
  return ((crc ^ (-1)) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export async function computeBlobCRC32(blob: Blob): Promise<string> {
  const chunkSize = 1024 * 1024 * 2; // 2MB read chunks
  let offset = 0;
  let crc = 0 ^ (-1);

  while (offset < blob.size) {
    const slice = blob.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    crc = calculateCRC32(new Uint8Array(buffer), crc);
    offset += chunkSize;
  }

  return finalizeCRC32(crc);
}
