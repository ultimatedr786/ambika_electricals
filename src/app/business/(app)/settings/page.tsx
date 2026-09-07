"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Coins, Palette, RotateCcw, Bell, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { InstallAppAction } from "@/components/shared/install-app-action";
import { LiveLoyaltyRulePanel } from "@/components/business/live-loyalty-rule-panel";
import { LiveBusinessSettingsPanel } from "@/components/business/live-business-settings-panel";
import { isDemoDevToolsEnabled, isSupabaseConfigured } from "@/lib/auth/env";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { createClient } from "@/lib/supabase/client";
import { tiers } from "@/lib/mock-data/business";
import { formatINR } from "@/lib/utils";

const BUSINESS_CATEGORY_LABEL: Record<string, { title: string; hint: string }> = {
  stock: { title: "Low stock alerts", hint: "Notify when a product drops below its threshold" },
  reward: { title: "Reward redemptions", hint: "When a member reserves or collects a reward" },
};

function useLiveNotificationPrefs() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [muted, setMutedState] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(configured);

  React.useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
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
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("muted_categories")
        .eq("business_id", bid)
        .maybeSingle();
      if (cancelled) return;
      setBusinessId(bid);
      setMutedState(((pref as { muted_categories: string[] } | null)?.muted_categories) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, supabase]);

  const setMuted = React.useCallback(
    async (category: string, isMuted: boolean) => {
      if (!supabase || !businessId) return;
      const next = isMuted ? [...new Set([...muted, category])] : muted.filter((c) => c !== category);
      setMutedState(next);
      const { error } = await supabase.rpc("set_notification_preferences", {
        p_business_id: businessId,
        p_muted_categories: next,
      });
      if (error) setMutedState(muted);
    },
    [supabase, businessId, muted]
  );

  return { configured, muted, loading, setMuted };
}

export default function SettingsPage() {
  const { reset } = useStore();
  const { business } = useServices();
  const [resetOpen, setResetOpen] = React.useState(false);
  // Reset-demo-data is a development/preview control only — never a
  // production affordance (MVP hotfix §"Remove visible Demo Mode").
  const devTools = isDemoDevToolsEnabled();
  const configured = isSupabaseConfigured();
  const liveNotify = useLiveNotificationPrefs();

  const [profile, setProfile] = React.useState({
    name: business.name, owner: business.ownerName, gst: business.gst,
    phone: business.phone, email: business.email, address: business.address,
  });
  const [earn, setEarn] = React.useState({ spend: business.earnRate.spend, points: business.earnRate.points, pointValue: business.pointValue, minRedeem: 500 });
  const [notify, setNotify] = React.useState({ lowStock: true, dailySummary: true, newMember: true, redemption: true, campaignEnd: false });

  return (
    <div className="space-y-5 flex-1 min-h-0 overflow-y-auto scroll-region pb-6 pr-1">
      <PageHeader title="Settings" description="Configure your business profile, loyalty programme and preferences." />

      <Tabs defaultValue="business">
        <TabsList className="flex-wrap">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
          <TabsTrigger value="tiers">Tiers</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-4 space-y-4">
          {/* Real, role-authorized settings. Renders only when Supabase is
              configured; the prototype card below stays for demo mode. */}
          <LiveBusinessSettingsPanel />

          {!configured && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-muted-foreground" aria-hidden /> Business profile</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Business name" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
                <Field label="Owner name" value={profile.owner} onChange={(v) => setProfile({ ...profile, owner: v })} />
                <Field label="GST number" value={profile.gst} onChange={(v) => setProfile({ ...profile, gst: v })} />
                <Field label="Phone" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
                <Field label="Email" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
                <Field label="Category" value={business.category} onChange={() => {}} />
                <div className="sm:col-span-2">
                  <Field label="Registered address" value={profile.address} onChange={(v) => setProfile({ ...profile, address: v })} />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => toast.success("Business profile saved.")}>Save changes</Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="loyalty" className="mt-4 space-y-4">
          {/* Live, versioned rule engine — renders only when Supabase is
              configured; the prototype card below stays for demo mode. */}
          <LiveLoyaltyRulePanel />

          {!configured && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Coins className="size-4 text-muted-foreground" aria-hidden /> Earning &amp; redemption</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <NumField label="Spend threshold (₹)" value={earn.spend} onChange={(v) => setEarn({ ...earn, spend: v })} />
                <NumField label="Points awarded" value={earn.points} onChange={(v) => setEarn({ ...earn, points: v })} />
                <NumField label="Minimum points to redeem" value={earn.minRedeem} onChange={(v) => setEarn({ ...earn, minRedeem: v })} />
                <div className="rounded-lg border border-dashed p-3">
                  <p className="text-sm font-medium">Points expiry</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    None. Points expiry is part of the live loyalty rule, and no expiry process runs at launch.
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Current earn model</p>
                <p className="mt-1 text-muted-foreground">
                  A member spending {formatINR(earn.spend)} earns <span className="font-medium text-foreground">{earn.points} points</span>, multiplied by their tier.
                  1 point ≈ ₹{earn.pointValue.toFixed(2)}, so {earn.minRedeem} points is worth about {formatINR(Math.round(earn.minRedeem * earn.pointValue))}.
                </p>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => toast.success("Loyalty settings saved.")}>Save changes</Button>
              </div>
            </Card>
          )}

          {devTools && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Developer tools</h2>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <div>
                  <p className="text-sm font-medium">Reset demo data</p>
                  <p className="text-xs text-muted-foreground">
                    Development/preview only. Restores the local mock customers, sales, rewards and points.
                  </p>
                </div>
                <Button variant="destructive" onClick={() => setResetOpen(true)}><RotateCcw /> Reset data</Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tiers" className="mt-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Award className="size-4 text-muted-foreground" aria-hidden /> Membership tiers</h2>
            <p className="mt-1 text-xs text-muted-foreground">Tiers are based on lifetime points earned.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {tiers.map((t) => (
                <div key={t.name} className="rounded-lg border p-4" style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{t.name}</p>
                    <Badge variant="secondary" className="tabular">{t.multiplier}x</Badge>
                  </div>
                  <p className="mt-1 text-xs tabular text-muted-foreground">
                    {t.min.toLocaleString("en-IN")}{t.max === null ? "+" : `–${t.max.toLocaleString("en-IN")}`} points
                  </p>
                  <ul className="mt-3 space-y-1">
                    {t.benefits.map((b) => <li key={b} className="text-xs text-muted-foreground">• {b}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="divide-y p-0">
            <div className="p-5 pb-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell className="size-4 text-muted-foreground" aria-hidden /> Notification preferences</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {configured ? "In-app only — these mute the in-app bell, nothing is emailed or texted." : "In-app only — no SMS, email or WhatsApp is sent in this prototype."}
              </p>
            </div>
            {configured
              ? (["stock", "reward"] as const).map((cat) => (
                  <div key={cat} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium">{BUSINESS_CATEGORY_LABEL[cat].title}</p>
                      <p className="text-xs text-muted-foreground">{BUSINESS_CATEGORY_LABEL[cat].hint}</p>
                    </div>
                    <Switch
                      checked={!liveNotify.muted.includes(cat)}
                      aria-label={BUSINESS_CATEGORY_LABEL[cat].title}
                      disabled={liveNotify.loading}
                      onCheckedChange={(v) => void liveNotify.setMuted(cat, !v)}
                    />
                  </div>
                ))
              : ([
                  ["lowStock", "Low stock alerts", "Notify when a product drops below 50 units"],
                  ["dailySummary", "Daily sales summary", "A recap of sales and points each evening"],
                  ["newMember", "New member joins", "When a customer enrols in the programme"],
                  ["redemption", "Reward redemptions", "When a member redeems a reward"],
                  ["campaignEnd", "Campaign ending soon", "Three days before a campaign ends"],
                ] as const).map(([key, title, hint]) => (
                  <div key={key} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <Switch
                      checked={notify[key]}
                      aria-label={title}
                      onCheckedChange={(v) => { setNotify({ ...notify, [key]: v }); toast.success(`${title} ${v ? "enabled" : "disabled"}.`); }}
                    />
                  </div>
                ))}
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4 text-muted-foreground" aria-hidden /> Appearance</h2>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground">Choose light, dark or match your system setting.</p>
              </div>
              <ThemeToggle />
            </div>
            <div className="mt-3 rounded-lg border p-4">
              <InstallAppAction />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description="Every change you've made in this session — sales, points, rewards, campaigns — will be restored to the original mock data."
        confirmLabel="Reset everything"
        destructive
        onConfirm={() => { reset(); setResetOpen(false); toast.success("Demo data restored."); }}
      />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)} />
    </div>
  );
}
