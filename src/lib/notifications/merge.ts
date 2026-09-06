/**
 * Pure merge/de-duplication logic for the live notification list.
 *
 * Kept free of React, Supabase and the DOM so the property that matters most —
 * "a replayed or duplicated event never duplicates an entry, and never
 * resurrects something the user already read" — is unit-testable directly
 * (tests/notification-merge.test.mjs).
 */

export interface MergeableNotification {
  id: string;
  /** The database's uniqueness key for the underlying event. */
  dedupeKey: string;
  createdAt: string;
  read: boolean;
}

/**
 * Insert or update exactly one notification, leaving every other entry alone.
 *
 * Identity is `id` OR `dedupeKey`: the same fact can arrive twice with
 * different row ids only if something upstream is broken, but it can very
 * easily arrive twice with the SAME id (socket replay after a reconnect, an
 * optimistic insert that also comes over the wire). Matching on both is what
 * makes reconnect safe.
 *
 * Read state is monotonic — once true it stays true — so a socket row, which
 * is always unread, cannot un-read something the user just dismissed.
 */
export function mergeNotification<T extends MergeableNotification>(list: T[], incoming: T): T[] {
  const at = list.findIndex((n) => n.id === incoming.id || n.dedupeKey === incoming.dedupeKey);
  if (at === -1) return [incoming, ...list];

  const next = [...list];
  next[at] = { ...incoming, read: list[at].read || incoming.read };
  return next;
}

/** Merge a whole page (initial load, or the resync after a reconnect). */
export function mergeNotifications<T extends MergeableNotification>(list: T[], incoming: T[]): T[] {
  return incoming.reduce<T[]>((acc, n) => mergeNotification(acc, n), list);
}

/** Newest first — the order the bell renders in. */
export function sortNotifications<T extends MergeableNotification>(list: T[]): T[] {
  return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Badge count. Trivial, but it must agree with the list the user can see. */
export function unreadCount(list: MergeableNotification[]): number {
  return list.reduce((n, item) => (item.read ? n : n + 1), 0);
}
