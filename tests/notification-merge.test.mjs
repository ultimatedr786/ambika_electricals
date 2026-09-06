import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeNotification,
  mergeNotifications,
  sortNotifications,
  unreadCount,
} from "../src/lib/notifications/merge.ts";

/**
 * §5 requires that "duplicate/reconnect events do not duplicate activity".
 * The database guarantees that for the stored rows (unique dedupe_key); this
 * file guarantees it for the client list, which is the part a flaky socket
 * actually stresses.
 */

const n = (id, dedupeKey, createdAt, read = false) => ({ id, dedupeKey, createdAt, read });

const A = n("a", "points:1", "2026-09-06T10:00:00.000Z");
const B = n("b", "reward:2", "2026-09-06T11:00:00.000Z");

test("a new notification is prepended", () => {
  const list = mergeNotification([A], B);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "b");
});

test("the same id arriving twice does not duplicate", () => {
  const list = mergeNotifications([], [A, A, A]);
  assert.equal(list.length, 1);
});

test("the same event under a different row id does not duplicate", () => {
  // What a replayed socket event or a double subscription looks like.
  const replay = n("a-again", "points:1", "2026-09-06T10:00:00.000Z");
  const list = mergeNotification([A], replay);
  assert.equal(list.length, 1);
  assert.equal(list[0].dedupeKey, "points:1");
});

test("read state is monotonic — a replay cannot un-read an item", () => {
  const readA = { ...A, read: true };
  const socketCopy = n("a", "points:1", "2026-09-06T10:00:00.000Z", false);
  const list = mergeNotification([readA], socketCopy);
  assert.equal(list.length, 1);
  assert.equal(list[0].read, true, "a socket row must not resurrect a dismissed item");
});

test("an incoming read flag can mark an unread item read", () => {
  const list = mergeNotification([A], { ...A, read: true });
  assert.equal(list[0].read, true);
});

test("merging never mutates the input list", () => {
  const original = [A];
  const copy = [...original];
  mergeNotification(original, B);
  assert.deepEqual(original, copy);
});

test("merging a reconnect page leaves the list stable", () => {
  // The resync after a dropped socket refetches rows we already hold.
  const before = mergeNotifications([], [B, A]);
  const readBefore = before.map((x) => ({ ...x, read: true }));
  const after = mergeNotifications(readBefore, [B, A]);
  assert.equal(after.length, 2, "a resync must not duplicate anything");
  assert.ok(after.every((x) => x.read), "a resync must not un-read anything");
});

test("sorting is newest first and total", () => {
  const list = sortNotifications([A, B]);
  assert.deepEqual(
    list.map((x) => x.id),
    ["b", "a"]
  );
});

test("unreadCount counts only unread entries", () => {
  assert.equal(unreadCount([A, B]), 2);
  assert.equal(unreadCount([{ ...A, read: true }, B]), 1);
  assert.equal(unreadCount([{ ...A, read: true }, { ...B, read: true }]), 0);
  assert.equal(unreadCount([]), 0);
});
