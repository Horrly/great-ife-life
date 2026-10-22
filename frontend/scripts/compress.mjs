// After `vite build`: write .gz and .br copies next to each big text/model file in dist, so the server
// (WhiteNoise) can send the small version. The 3D people and the game code shrink to about half or less,
// which matters most on slow mobile data.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;
const KINDS = /\.(js|css|html|svg|json|webmanifest|glb|txt)$/;
let before = 0;
let after = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (KINDS.test(name) && statSync(path).size > 1024) {
      const raw = readFileSync(path);
      const gz = gzipSync(raw, { level: 9 });
      const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      writeFileSync(`${path}.gz`, gz);
      writeFileSync(`${path}.br`, br);
      before += raw.length;
      after += Math.min(gz.length, br.length);
    }
  }
}
walk(DIST);
console.log(`compressed: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB`);
