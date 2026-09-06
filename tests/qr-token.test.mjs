import test from "node:test";
import assert from "node:assert/strict";
import {
  QR_TOKEN_RE,
  groupQrToken,
  isQrTokenShape,
  normalizeQrToken,
  qrTokenSelector,
} from "../src/lib/qr/token.ts";

/**
 * These mirror the database contract in
 * supabase/migrations/20260906160000_membership_qr_tokens.sql — if the SQL
 * format ever changes, both this file and the QR1 assertion in
 * scripts/rls-check/10_assertions.sql must change with it.
 */

const SELECTOR = "0123456789ABCDEF";              // 16 chars
const SECRET = "ZYXWVTSRQPNMKJHGFEDCBA9876";      // 26 chars
const TOKEN = `RWD1.${SELECTOR}.${SECRET}`;

test("QR_TOKEN_RE accepts a well-formed token", () => {
  assert.ok(QR_TOKEN_RE.test(TOKEN));
});

test("QR_TOKEN_RE rejects wrong version, lengths and alphabet", () => {
  assert.ok(!QR_TOKEN_RE.test(`RWD2.${SELECTOR}.${SECRET}`));
  assert.ok(!QR_TOKEN_RE.test(`RWD1.${SELECTOR.slice(1)}.${SECRET}`));
  assert.ok(!QR_TOKEN_RE.test(`RWD1.${SELECTOR}.${SECRET}A`));
  // I, L, O and U are not part of the Crockford alphabet used on the wire.
  assert.ok(!QR_TOKEN_RE.test(`RWD1.${"I".repeat(16)}.${SECRET}`));
  assert.ok(!QR_TOKEN_RE.test(`RWD1.${SELECTOR}.${"U".repeat(26)}`));
  assert.ok(!QR_TOKEN_RE.test("not-a-token"));
  assert.ok(!QR_TOKEN_RE.test(""));
});

test("normalizeQrToken mirrors the SQL qr_normalize folding", () => {
  assert.equal(normalizeQrToken(`  ${TOKEN.toLowerCase()}  `), TOKEN);
  // Spaces, hyphens and underscores added by a human reader are dropped.
  assert.equal(normalizeQrToken("RWD1.0123 4567-89AB_CDEF." + SECRET), TOKEN);
  // Ambiguous characters fold to their canonical digit.
  assert.equal(normalizeQrToken("OIL"), "011");
  // The dots that separate version / selector / secret survive.
  assert.equal(normalizeQrToken(TOKEN).split(".").length, 3);
});

test("isQrTokenShape only passes normalizable tokens", () => {
  assert.ok(isQrTokenShape(TOKEN));
  assert.ok(isQrTokenShape(TOKEN.toLowerCase()));
  assert.ok(isQrTokenShape(`rwd1. ${SELECTOR} . ${SECRET}`.replace(/ /g, " ")));
  assert.ok(!isQrTokenShape("AE-10248"));
  assert.ok(!isQrTokenShape("RWD1."));
  assert.ok(!isQrTokenShape("javascript:alert(1)"));
});

test("qrTokenSelector exposes the public half only", () => {
  assert.equal(qrTokenSelector(TOKEN), SELECTOR);
  // Never returns the secret, and refuses malformed input outright.
  assert.notEqual(qrTokenSelector(TOKEN), SECRET);
  assert.equal(qrTokenSelector("nope"), null);
});

test("groupQrToken is readable and lossless", () => {
  const grouped = groupQrToken(TOKEN);
  assert.equal(grouped.replace(/[\s·]/g, ""), SELECTOR + SECRET);
  assert.ok(grouped.includes(" "));
});
