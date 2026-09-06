"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Bell, Lock, Plus, Store as StoreIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";

/**
 * Essential business settings (Step 3 Slice 8, doc §6).
 *
 * Deliberately narrow: identity, stores and notification preferences. The
 * loyalty rule has its own panel, and staff/store membership already has a
 * working screen — this does not duplicate either, it links to them. §6 is
 * explicit that a broad, untested settings surface is worse than none.
 *
 * Every write goes through an RPC that re-checks the role server-side; the
 * disabled controls below are honest about what a manager may not do rather
 * than hiding it and failing on submit.
 */

interface StoreRow {
  id: string;
  name: string;
  code: string | null;
  addressLine: string | null;
  city: string | null;
  phone: string | null;
  isActive: boolean;
}

/** Categories a user may silence. `security` is intentionally absent. */
const MUTABLE_CATEGORIES: { value: string; label: string; hint: string }[] = [
  { value: "points", label: "Points awarded", hint: "Every member sale that earns points" },
  { value: "reward", label: "Reward activity", hint: "Redemptions reserved, collected or cancelled" },
  { value: "stock", label: "Low stock", hint: "When a product crosses its reorder level" },
  { value: "staff", label: "Team changes", hint: "Invitations and membership updates" },
  { value: "rule", label: "Loyalty rule changes", hint: "New earning-rate versions" },
  { value: "system", label: "System notices", hint: "General service messages" },
];

export function LiveBusinessSettingsPanel() {
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);

  const [profile, setProfile] = React.useState({
    name: "", legalName: "", gstin: "", supportEmail: "", supportPhone: "",
  });
  const [profileBusy, setProfileBusy] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const [stores, setStores] = React.useState<StoreRow[]>([]);
  const [newStore, setNewStore] = React.useState({ name: "", code: "", city: "" });
  const [storeBusy, setStoreBusy] = React.useState(false);
  const [storeError, setStoreError] = React.useState<string | null>(null);

  const [muted, setMuted] = React.useState<Set<string>>(new Set());
  const [prefsBusy, setPrefsBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id, role")
        .eq("profile_id", user.id)
        .eq("status", "active");
      const rows = (me ?? []) as { business_id: string; role: "owner" | "manager" | "staff" }[];
      if (rows.length === 0) return;

      const bid = rows[0].business_id;
      setBusinessId(bid);
      setIsOwner(rows[0].role === "owner");

      const [bizRes, storeRes, prefRes] = await Promise.all([
        supabase
          .from("businesses")
          .select("name, legal_name, gstin, support_email, support_phone")
          .eq("id", bid)
          .maybeSingle(),
        supabase
          .from("stores")
          .select("id, name, code, address_line, city, phone, is_active")
          .eq("business_id", bid)
          .order("name"),
        supabase
          .from("notification_preferences")
          .select("muted_categories")
          .eq("business_id", bid)
          .maybeSingle(),
      ]);

      const b = bizRes.data as Record<string, unknown> | null;
      if (b) {
        setProfile({
          name: String(b.name ?? ""),
          legalName: String(b.legal_name ?? ""),
          gstin: String(b.gstin ?? ""),
          supportEmail: String(b.support_email ?? ""),
          supportPhone: String(b.support_phone ?? ""),
        });
      }
      setStores(
        ((storeRes.data ?? []) as Record<string, unknown>[]).map((s) => ({
          id: String(s.id),
          name: String(s.name),
          code: s.code == null ? null : String(s.code),
          addressLine: s.address_line == null ? null : String(s.address_line),
          city: s.city == null ? null : String(s.city),
          phone: s.phone == null ? null : String(s.phone),
          isActive: Boolean(s.is_active),
        }))
      );
      const prefs = (prefRes.data as { muted_categories?: string[] } | null)?.muted_categories ?? [];
      setMuted(new Set(prefs));
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const saveProfile = async () => {
    if (!supabase) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      const { error } = await supabase.rpc("update_business_profile", {
        p_name: profile.name || null,
        p_legal_name: profile.legalName || null,
        p_gstin: profile.gstin || null,
        p_support_email: profile.supportEmail || null,
        p_support_phone: profile.supportPhone || null,
      });
      if (error) {
        const m = (error.message ?? "").toLowerCase();
        setProfileError(
          m.includes("invalid_gstin")
            ? "That GSTIN doesn't look right — it should be 15 characters, e.g. 24ABKPE1234K1Z9."
            : m.includes("invalid_email")
              ? "That support email address isn't valid."
              : m.includes("invalid_name")
                ? "The business name needs to be between 2 and 120 characters."
                : m.includes("not_authorized")
                  ? "Only the business owner can change these details."
                  : "Couldn't save those details. Please try again."
        );
        return;
      }
      toast.success("Business details saved.");
      await reload();
    } finally {
      setProfileBusy(false);
    }
  };

  const addStore = async () => {
    if (!supabase) return;
    setStoreBusy(true);
    setStoreError(null);
    try {
      const { error } = await supabase.rpc("upsert_store", {
        p_store_id: null,
        p_name: newStore.name,
        p_code: newStore.code || null,
        p_address_line: null,
        p_phone: null,
        p_is_active: true,
        p_city: newStore.city || null,
        p_region: null,
      });
      if (error) {
        setStoreError(
          (error.message ?? "").includes("invalid_name")
            ? "A store name needs at least 2 characters."
            : "Couldn't add that store."
        );
        return;
      }
      toast.success(`${newStore.name} added.`);
      setNewStore({ name: "", code: "", city: "" });
      await reload();
    } finally {
      setStoreBusy(false);
    }
  };

  const toggleStore = async (store: StoreRow) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("upsert_store", {
      p_store_id: store.id,
      p_name: null,
      p_code: null,
      p_address_line: null,
      p_phone: null,
      p_is_active: !store.isActive,
      p_city: null,
      p_region: null,
    });
    if (error) {
      toast.error("Couldn't change that store.");
      return;
    }
    toast.success(store.isActive ? `${store.name} closed.` : `${store.name} reopened.`);
    await reload();
  };

  const togglePreference = async (category: string) => {
    if (!supabase || !businessId) return;
    const next = new Set(muted);
    if (next.has(category)) next.delete(category);
    else next.add(category);

    setMuted(next); // optimistic
    setPrefsBusy(true);
    try {
      const { error } = await supabase.rpc("set_notification_preferences", {
        p_business_id: businessId,
        p_muted_categories: [...next],
      });
      if (error) {
        setMuted(muted); // roll back
        toast.error("Couldn't save that preference.");
      }
    } finally {
      setPrefsBusy(false);
    }
  };

  if (!configured) return null;
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading business settings…
        </CardContent>
      </Card>
    );
  }
  if (!businessId) return null;

  return (
    <div className="space-y-4">
      {/* --- identity ------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="size-4" aria-hidden />
            </span>
            Business details
            <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Live
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Shown to customers and printed on reward vouchers. Rewardly is not your invoice of
            record — your billing system stays authoritative for GST.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business name</Label>
              <Input id="biz-name" value={profile.name} disabled={!isOwner}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-legal">Legal name</Label>
              <Input id="biz-legal" value={profile.legalName} disabled={!isOwner}
                onChange={(e) => setProfile({ ...profile, legalName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-gstin">GSTIN</Label>
              <Input id="biz-gstin" value={profile.gstin} disabled={!isOwner} placeholder="24ABKPE1234K1Z9"
                onChange={(e) => setProfile({ ...profile, gstin: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-email">Support email</Label>
              <Input id="biz-email" type="email" value={profile.supportEmail} disabled={!isOwner}
                onChange={(e) => setProfile({ ...profile, supportEmail: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-phone">Support phone</Label>
              <Input id="biz-phone" value={profile.supportPhone} disabled={!isOwner}
                onChange={(e) => setProfile({ ...profile, supportPhone: e.target.value })} />
            </div>
          </div>
          {profileError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {profileError}
            </p>
          )}
          {isOwner ? (
            <Button onClick={saveProfile} loading={profileBusy}>Save details</Button>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" aria-hidden /> Only the owner can change these.
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- stores ---------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <StoreIcon className="size-4" aria-hidden />
            </span>
            Stores
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Closing a store hides it from the till without deleting it — sales, stock and staff
            assignments keep pointing at it.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y rounded-xl border">
            {stores.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                <span className="font-medium">{s.name}</span>
                {s.code && <Badge variant="outline" className="font-mono text-[10px]">{s.code}</Badge>}
                {s.city && <span className="text-xs text-muted-foreground">{s.city}</span>}
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{s.isActive ? "Open" : "Closed"}</span>
                  <Switch
                    checked={s.isActive}
                    disabled={!isOwner}
                    onCheckedChange={() => void toggleStore(s)}
                    aria-label={`${s.isActive ? "Close" : "Reopen"} ${s.name}`}
                  />
                </span>
              </li>
            ))}
            {stores.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">No stores yet.</li>
            )}
          </ul>

          {isOwner && (
            <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <Input placeholder="Store name" value={newStore.name} aria-label="New store name"
                  onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} />
                <Input placeholder="Code (optional)" value={newStore.code} aria-label="New store code"
                  onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} />
                <Input placeholder="City (optional)" value={newStore.city} aria-label="New store city"
                  onChange={(e) => setNewStore({ ...newStore, city: e.target.value })} />
              </div>
              {storeError && <p className="text-xs text-destructive" role="alert">{storeError}</p>}
              <Button size="sm" onClick={addStore} loading={storeBusy}
                disabled={newStore.name.trim().length < 2}>
                <Plus /> Add store
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- notification preferences ---------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="size-4" aria-hidden />
            </span>
            Your notifications
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These are yours alone — they follow you across devices and do not change what your
            colleagues see.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {MUTABLE_CATEGORIES.map((c) => (
            <div key={c.value} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-[11px] text-muted-foreground">{c.hint}</p>
              </div>
              <Switch
                checked={!muted.has(c.value)}
                disabled={prefsBusy}
                onCheckedChange={() => void togglePreference(c.value)}
                aria-label={`${muted.has(c.value) ? "Enable" : "Mute"} ${c.label} notifications`}
              />
            </div>
          ))}
          <Separator className="my-1" />
          <div className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 opacity-70">
            <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">Security alerts</p>
              <p className="text-[11px] text-muted-foreground">
                Always on. Blocked QR scans and similar events cannot be silenced.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
