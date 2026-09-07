"use client";

import * as React from "react";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";

export interface LiveCampaign {
  id: string;
  name: string;
  description: string | null;
  audience: string;
  reward: string;
  status: "draft" | "scheduled" | "active" | "ended";
  startsAt: string;
  endsAt: string;
}

export function useLiveCampaigns() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [items, setItems] = React.useState<LiveCampaign[]>([]);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [activeMembers, setActiveMembers] = React.useState(0);
  const [loading, setLoading] = React.useState(configured);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: me } = await supabase
      .from("business_memberships")
      .select("business_id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const bid = (me as { business_id: string } | null)?.business_id ?? null;
    if (!bid) {
      setLoading(false);
      return;
    }
    setBusinessId(bid);
    const [campaignsRes, memRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, description, audience, reward, status, starts_at, ends_at")
        .eq("business_id", bid)
        .order("created_at", { ascending: false }),
      supabase.from("customer_memberships").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("status", "active"),
    ]);
    setActiveMembers(memRes.count ?? 0);
    setItems(
      ((campaignsRes.data ?? []) as { id: string; name: string; description: string | null; audience: string; reward: string; status: string; starts_at: string; ends_at: string }[]).map((c) => ({
        id: c.id, name: c.name, description: c.description, audience: c.audience, reward: c.reward,
        status: c.status as LiveCampaign["status"], startsAt: c.starts_at, endsAt: c.ends_at,
      }))
    );
    setLoading(false);
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const create = React.useCallback(
    async (values: { name: string; description: string; audience: string; reward: string; status: "draft" | "active"; startsAt: string; endsAt: string }) => {
      if (!businessId || !supabase) return;
      const { error } = await supabase.rpc("create_campaign", {
        p_business_id: businessId,
        p_name: values.name,
        p_description: values.description || null,
        p_audience: values.audience,
        p_reward: values.reward,
        p_status: values.status,
        p_starts_at: values.startsAt,
        p_ends_at: values.endsAt,
      });
      if (error) throw error;
      await reload();
    },
    [businessId, supabase, reload]
  );

  const setStatus = React.useCallback(
    async (campaignId: string, status: string) => {
      if (!supabase) return;
      const { error } = await supabase.rpc("set_campaign_status", { p_campaign_id: campaignId, p_status: status });
      if (error) throw error;
      await reload();
    },
    [supabase, reload]
  );

  return { configured, items, activeMembers, loading, create, setStatus };
}
