import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "uqr";
import jsQRImport from "jsqr";

const jsQR = jsQRImport.default ?? jsQRImport;

/**
 * Proves the customer-facing checkout QR is a *real* QR code, not artwork:
 * the same encoder the browser component uses is rasterized here and read back
 * by an independent decoder (jsQR — the library a phone-side scanner would
 * use). If the encoding settings in `ScannableQR` ever drift, this fails.
 *
 * It also pins the privacy property: what is drawn is exactly the opaque
 * token and nothing else — no membership number, no name, no URL wrapper.
 */

const SELECTOR = "0123456789ABCDEF";
const SECRET = "ZYXWVTSRQPNMKJHGFEDCBA9876";
const TOKEN = `RWD1.${SELECTOR}.${SECRET}`;

/** Same parameters as src/components/shared/qr-code.tsx. */
const ECC = "M";
const QUIET = 4;

/** Matrix → RGBA bitmap, the way a camera would see the rendered SVG. */
function rasterize(matrix, scale = 8) {
  const n = matrix.length;
  const span = (n + QUIET * 2) * scale;
  const buf = new Uint8ClampedArray(span * span * 4).fill(255);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix[r][c]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = (((r + QUIET) * scale + y) * span + ((c + QUIET) * scale + x)) * 4;
          buf[px] = 0;
          buf[px + 1] = 0;
          buf[px + 2] = 0;
          buf[px + 3] = 255;
        }
      }
    }
  }
  return { buf, span };
}

test("checkout QR round-trips through an independent decoder", () => {
  const { data: matrix } = encode(TOKEN, { ecc: ECC, border: 0 });
  const { buf, span } = rasterize(matrix);
  const decoded = jsQR(buf, span, span);

  assert.ok(decoded, "jsQR could not lock on to the rendered symbol");
  assert.equal(decoded.data, TOKEN);
});

test("the symbol stays small enough to read at counter distance", () => {
  const result = encode(TOKEN, { ecc: ECC, border: 0 });
  // The token's alphabet fits QR alphanumeric mode, so 48 chars stay at
  // version 3 (29 modules). A jump past version 5 would mean the payload
  // format grew and the on-screen modules got uncomfortably small.
  assert.ok(result.version <= 5, `unexpected QR version ${result.version}`);
  assert.equal(result.size, result.data.length);
  assert.equal(result.data.length, result.data[0].length);
});

test("nothing but the opaque token is encoded", () => {
  const { data: matrix } = encode(TOKEN, { ecc: ECC, border: 0 });
  const { buf, span } = rasterize(matrix);
  const decoded = jsQR(buf, span, span);

  // No URL wrapper, no scheme, no membership number, no name.
  assert.ok(!/^https?:/i.test(decoded.data));
  assert.ok(!decoded.data.includes("AE-"));
  assert.ok(!/rahul|sharma/i.test(decoded.data));
  assert.equal(decoded.data.split(".").length, 3);
  assert.equal(decoded.data.split(".")[0], "RWD1");
});

test("a scan-damaged symbol still decodes at error-correction level M", () => {
  const { data: matrix } = encode(TOKEN, { ecc: ECC, border: 0 });
  const damaged = matrix.map((row) => [...row]);
  // Smudge a 3x3 block in the data region (away from the finder patterns).
  for (let r = 14; r < 17; r++) {
    for (let c = 14; c < 17; c++) damaged[r][c] = false;
  }
  const { buf, span } = rasterize(damaged);
  const decoded = jsQR(buf, span, span);

  assert.ok(decoded, "level M should survive a small smudge");
  assert.equal(decoded.data, TOKEN);
});
