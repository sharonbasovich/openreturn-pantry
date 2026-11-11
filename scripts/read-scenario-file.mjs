// Node-only file boundary. The browser parser continues to validate strings.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { MAX_JSON_BYTES } from '../src/import.mjs';

const tooLarge = () => new Error(`Scenario JSON is too large. The limit is ${MAX_JSON_BYTES.toLocaleString('en-US')} UTF-8 bytes.`);
const notFile = () => new Error('Scenario input must be a regular file (not a directory, symbolic link or special file).');

export async function readScenarioFile(path) {
  // Reject special files before opening. NONBLOCK also avoids waiting on a FIFO
  // swapped into place after this check on platforms that support the flag.
  if (!(await lstat(path)).isFile()) throw notFile();
  const handle = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw notFile();
    if (info.size > MAX_JSON_BYTES) throw tooLarge();
    // Never read more than the cap plus one detection byte, even if the file
    // grows after stat. This is a bounded read, not an atomic file snapshot.
    const buffer = Buffer.alloc(MAX_JSON_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_JSON_BYTES || (await handle.stat()).size > MAX_JSON_BYTES) throw tooLarge();
    try {
      // Keep BOM in the string: JSON.parse has always rejected a JSON BOM.
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
    } catch {
      throw new Error('Scenario JSON must contain valid UTF-8 bytes.');
    }
  } finally {
    await handle.close();
  }
}
