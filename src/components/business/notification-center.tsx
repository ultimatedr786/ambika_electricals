"use client";

import { LiveNotificationCenter } from "@/components/shared/live-notification-center";

/**
 * Business bell. `LiveNotificationCenter` renders the database-backed,
 * Realtime-subscribed centre when Supabase is configured and transparently
 * falls back to the prototype's local one when it is not.
 */
export function NotificationCenter() {
  return <LiveNotificationCenter audience="business" />;
}
