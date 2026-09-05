import test from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo, homeForViewer } from "../src/lib/auth/redirects.ts";

test("safeReturnTo: empty values fall back", () => {
  assert.equal(safeReturnTo(null), "/");
  assert.equal(safeReturnTo(undefined), "/");
  assert.equal(safeReturnTo(""), "/");
  assert.equal(safeReturnTo("   "), "/");
  assert.equal(safeReturnTo(null, "/customer/dashboard"), "/customer/dashboard");
});

test("safeReturnTo: allows normal same-origin paths", () => {
  assert.equal(safeReturnTo("/customer/dashboard"), "/customer/dashboard");
  assert.equal(safeReturnTo("/business/dashboard"), "/business/dashboard");
  assert.equal(safeReturnTo("/customer/rewards?tier=Gold"), "/customer/rewards?tier=Gold");
  assert.equal(safeReturnTo("/customer/rewards#top"), "/customer/rewards#top");
  assert.equal(safeReturnTo("/"), "/");
});

test("safeReturnTo: rejects absolute and protocol-relative URLs", () => {
  assert.equal(safeReturnTo("https://evil.example/customer"), "/");
  assert.equal(safeReturnTo("http://evil.example"), "/");
  assert.equal(safeReturnTo("//evil.example/path"), "/");
  assert.equal(safeReturnTo("/\\evil.example/path"), "/");
  assert.equal(safeReturnTo("javascript:alert(1)"), "/");
  assert.equal(safeReturnTo("mailto:x@evil.example"), "/");
  assert.equal(safeReturnTo("evil.example/path"), "/");
});

test("safeReturnTo: rejects percent-encoded escapes", () => {
  assert.equal(safeReturnTo("%2f%2fevil.example"), "/");
  assert.equal(safeReturnTo("%2F%2Fevil.example%2Fpath"), "/");
  assert.equal(safeReturnTo("%252f%252fevil.example"), "/"); // double-encoded
  assert.equal(safeReturnTo("%2fcustomer%2fdashboard"), "/customer/dashboard"); // single-encoded legit path
});

test("safeReturnTo: rejects malformed encoding and control characters", () => {
  assert.equal(safeReturnTo("/%zz"), "/");
  assert.equal(safeReturnTo("/customer\n.evil"), "/");
  assert.equal(safeReturnTo("/customer\t"), "/customer"); // trailing tab trims
});

test("safeReturnTo: blocks auth-exchange endpoints (loop protection)", () => {
  assert.equal(safeReturnTo("/auth/confirm?token_hash=abc"), "/");
  assert.equal(safeReturnTo("/auth/invite/accept"), "/");
});

test("safeReturnTo: custom fallback is honored", () => {
  assert.equal(safeReturnTo("//evil.example", "/customer/dashboard"), "/customer/dashboard");
});

test("homeForViewer: routes by business membership", () => {
  assert.equal(homeForViewer({ businessRoles: [] }), "/customer/dashboard");
  assert.equal(homeForViewer({ businessRoles: ["staff"] }), "/business/dashboard");
  assert.equal(homeForViewer({ businessRoles: ["manager"] }), "/business/dashboard");
  assert.equal(homeForViewer({ businessRoles: ["owner", "staff"] }), "/business/dashboard");
});
