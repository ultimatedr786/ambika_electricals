"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import {
  mergeNotification,
  sortNotifications,
  unreadCount as countUnread,
} from "@/lib/notifications/merge";

/**
 * Live notification state (Step 3 Slice 7).
 *
 * One hook owns the whole contract so the bell, the badge and any future
 * notifications page cannot drift apart:
 *
 *   • an initial RLS-filtered fetch (the server decides what you may see);
 *   • a tenant-scoped Realtime subscription for new rows;
 *   • **narrow** cache updates — an INSERT prepends one item, marking read
 *     flips one flag. Nothing here ever refetches the application, and the
 *     only full refetch is the deliberate resync after a dropped socket;
 *   • de-duplication by id AND by the database's `dedupe_key`, so a replayed
 *     event, a double subscription or an optimistic insert that also arrives
 *     over the socket collapses into one entry;
 *   • optimistic read state that reconciles with the server, and rolls back
 *     if the RPC refuses;
 *   • an honest connection state, without alert spam.
 */

export type NotificationAudience = "customer" | "business";

export interface LiveNotification {
  id: string;
  audience: NotificationAudience;
  category: "points" | "reward" | "stock" | "staff" | "rule" | "security" | "system";
  title: string;
  body: string | null;
  sourceType: string | null;
  sourceId: string | null;
  storeId: string | null;
  metadata: Record<string, unknown>;
  dedupeKey: string;
  createdAt: string;
  read: boolean;
}

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline" | "disabled";

const PAGE_SIZE = 30;

/** Row → view model. Kept in one place; the socket and the fetch share it. */
function toNotification(row: Record<string, unknown>, readIds: Set<string>): LiveNotification {
  const id = String(row.id);
  return {
    id,
    audience: row.audience as NotificationAudience,
    category: row.category as LiveNotification["category"],
    title: String(row.title),
    body: row.body == null ? null : String(row.body),
    sourceType: row.source_type == null ? null : String(row.source_type),
    sourceId: row.source_id == null ? null : String(row.source_id),
    storeId: row.store_id == null ? null : String(row.store_id),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    dedupeKey: String(row.dedupe_key ?? id),
    createdAt: String(row.created_at),
    read: readIds.has(id),
  };
}

export function useLiveNotifications(audience: NotificationAudience) {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [items, setItems] = React.useState<LiveNotification[]>([]);
  const [connection, setConnection] = React.useState<ConnectionState>(
    configured ? "connecting" : "disabled"
  );
  const [loading, setLoading] = React.useState(configured);
  // Read-side muting (Slice 8). A notification row is shared by everyone
  // entitled to see it, so a personal preference can only ever filter what is
  // displayed — never what is emitted.
  const [muted, setMuted] = React.useState<Set<string>>(new Set());

  // Kept in a ref so the Realtime callback never closes over a stale list and
  // never needs to be re-subscribed when the list changes.
  const itemsRef = React.useRef<LiveNotification[]>([]);
  itemsRef.current = items;

  const load = React.useCallback(async (): Promise<boolean> => {
    if (!configured || !supabase) return false;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // Two RLS-filtered reads: the events this profile may see, and this
    // profile's own read rows. The join is done here because the read table
    // is deliberately personal and not exposed through the event query.
    const [notifRes, readRes, prefRes] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, audience, category, title, body, source_type, source_id, store_id, metadata, dedupe_key, created_at"
        )
        .eq("audience", audience)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
      supabase.from("notification_reads").select("notification_id"),
      supabase.from("notification_preferences").select("muted_categories"),
    ]);

    if (notifRes.error) return false;

    const mutedSet = new Set<string>();
    for (const row of (prefRes.data ?? []) as { muted_categories?: string[] }[]) {
      for (const c of row.muted_categories ?? []) mutedSet.add(c);
    }
    setMuted(mutedSet);

    const readIds = new Set(
      ((readRes.data ?? []) as { notification_id: string }[]).map((r) => r.notification_id)
    );
    setItems(
      ((notifRes.data ?? []) as Record<string, unknown>[]).map((r) => toNotification(r, readIds))
    );
    return true;
  }, [audience, configured, supabase]);

  // Initial load.
  React.useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void load().then((ok) => {
      if (cancelled) return;
      setLoading(false);
      if (!ok) setConnection("offline");
    });
    return () => {
      cancelled = true;
    };
  }, [configured, load]);

  // Realtime subscription. Scoped to this audience; RLS scopes it to this
  // tenant — an unauthorized row physically never reaches the socket.
  React.useEffect(() => {
    if (!configured || !supabase) return;

    let disposed = false;
    let resyncTimer: number | undefined;

    const channel = supabase
      .channel(`notifications:${audience}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `audience=eq.${audience}` },
        (payload) => {
          if (disposed) return;
          const row = payload.new as Record<string, unknown>;
          // A brand-new event is unread by definition; mergeOne protects any
          // row the user has already dealt with.
          setItems((list) => sortNotifications(mergeNotification(list, toNotification(row, new Set()))));
        }
      )
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Catch up on anything that happened while the socket was down.
          // This is the ONE full refetch in the hook, and it only runs on a
          // transition — not on every event.
          window.clearTimeout(resyncTimer);
          resyncTimer = window.setTimeout(() => void load(), 0);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("reconnecting");
        } else if (status === "CLOSED") {
          setConnection((c) => (c === "live" ? "reconnecting" : c));
        }
      });

    return () => {
      disposed = true;
      window.clearTimeout(resyncTimer);
      void supabase.removeChannel(channel);
    };
  }, [audience, configured, supabase, load]);

  // Browser-level connectivity, so "offline" is honest rather than inferred
  // from a socket that has not noticed yet.
  React.useEffect(() => {
    if (!configured) return;
    const onOffline = () => setConnection("offline");
    const onOnline = () => {
      setConnection("reconnecting");
      void load();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [configured, load]);

  // Muted categories are hidden from the list AND the badge, so the bell
  // never advertises something the user chose not to see.
  const visible = React.useMemo(
    () => items.filter((n) => !muted.has(n.category)),
    [items, muted]
  );
  const unreadCount = React.useMemo(() => countUnread(visible), [visible]);

  /** Optimistic, then reconciled. A refusal rolls the single flag back. */
  const markRead = React.useCallback(
    async (id: string) => {
      const before = itemsRef.current;
      if (before.find((n) => n.id === id)?.read) return;
      setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));

      if (!supabase) return;
      const { error } = await supabase.rpc("mark_notification_read", { p_notification_id: id });
      if (error) {
        setItems((list) => list.map((n) => (n.id === id ? { ...n, read: false } : n)));
      }
    },
    [supabase]
  );

  const markAllRead = React.useCallback(async () => {
    const before = itemsRef.current;
    setItems((list) => list.map((n) => ({ ...n, read: true })));

    if (!supabase) return;
    const { error } = await supabase.rpc("mark_all_notifications_read", { p_audience: audience });
    if (error) setItems(before);
  }, [audience, supabase]);

  return {
    items: visible,
    unreadCount,
    connection,
    loading,
    enabled: configured,
    markRead,
    markAllRead,
    refresh: load,
  };
}
