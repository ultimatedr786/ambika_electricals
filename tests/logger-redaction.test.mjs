import test from "node:test";
import assert from "node:assert/strict";
import { redact } from "../src/lib/observability/redact.ts";

/**
 * §7 requires "structured logging with secret/PII redaction". Redaction that
 * is not tested is redaction that quietly stops working the first time someone
 * renames a field — so these assert the two independent mechanisms (key names
 * and value shapes) and, importantly, that redaction survives nesting.
 */

// Fabricated fixtures: a JWT-shaped string whose payload says `service_role`,
// and a Supabase-shaped secret key. Neither has ever been valid anywhere.
// They are marked for the repository secret scanner, which correctly flags
// them by shape — the whole point of these tests is that the redactor treats
// values like these as credentials.
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlSGVyZQ"; // secret-scan-ignore
const QR = "RWD1.0123456789ABCDEF.ZYXWVTSRQPNMKJHGFEDCBA9876";

test("keys that name a credential are redacted whatever they contain", () => {
  const out = redact({
    password: "hunter2",
    access_token: "abc",
    apiKey: "xyz",
    SERVICE_ROLE_KEY: "abc",
    cookie: "sb-auth=1",
    code_hash: "deadbeef",
  });
  for (const v of Object.values(out)) assert.equal(v, "[REDACTED]");
});

test("credential-shaped values are redacted whatever the key is called", () => {
  const out = redact({ data: JWT, payload: QR, note: "sb_secret_abcdefghijklmnop" }); // secret-scan-ignore
  assert.equal(out.data, "[REDACTED:jwt]");
  assert.equal(out.payload, "[REDACTED:qr-token]");
  assert.equal(out.note, "[REDACTED:supabase-key]");
});

test("customer PII is redacted by shape as well as by key", () => {
  const out = redact({ contact: "rahul@example.com", mobile: "+91 98250 41200", who: "9825041200" });
  assert.equal(out.contact, "[REDACTED:email]");
  assert.equal(out.mobile, "[REDACTED]"); // key match
  assert.equal(out.who, "[REDACTED:phone]"); // value match
});

test("redaction reaches into nested structures and arrays", () => {
  const out = redact({
    sale: {
      customer: { email: "a@b.co", membershipNo: "AE-10248" },
      // A key that names a credential is redacted WHOLESALE, container and
      // all — deliberately conservative: we never want to reason about
      // whether every element of a "tokens" array was individually caught.
      tokens: [QR, QR],
      // A neutral key still gets element-level treatment.
      scanned: [QR, "INV-000123"],
    },
  });
  assert.equal(out.sale.customer.email, "[REDACTED]");
  assert.equal(out.sale.customer.membershipNo, "AE-10248", "membership numbers are not secret");
  assert.equal(out.sale.tokens, "[REDACTED]");
  assert.deepEqual(out.sale.scanned, ["[REDACTED:qr-token]", "INV-000123"]);
});

test("ordinary operational values survive untouched", () => {
  const out = redact({
    scope: "pos",
    invoiceNo: "INV-000123",
    totalPaise: 125000,
    points: 125,
    ok: true,
    storeId: "bbbbbbbb-0000-4000-8000-000000000001",
  });
  assert.equal(out.scope, "pos");
  assert.equal(out.invoiceNo, "INV-000123");
  assert.equal(out.totalPaise, 125000);
  assert.equal(out.ok, true);
  assert.equal(out.storeId, "bbbbbbbb-0000-4000-8000-000000000001");
});

test("errors keep their message but lose interpolated secrets", () => {
  const out = redact(new Error(JWT));
  assert.equal(out.name, "Error");
  assert.equal(out.message, "[REDACTED:jwt]");
});

test("redaction never throws on hostile input", () => {
  const cyclic = { name: "loop" };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => redact(cyclic));

  const deep = { a: { b: { c: { d: { e: { f: { g: { h: "deep" } } } } } } } };
  assert.doesNotThrow(() => redact(deep));
  assert.equal(redact(deep).a.b.c.d.e.f.g, "[truncated:depth]");

  assert.doesNotThrow(() => redact(undefined));
  assert.doesNotThrow(() => redact(() => "fn"));
  assert.equal(redact(10n), "10");
});

test("long arrays are truncated rather than flooding the log", () => {
  const out = redact(Array.from({ length: 120 }, (_, i) => i));
  assert.equal(out.length, 51);
  assert.match(String(out[50]), /truncated:70 more/);
});
