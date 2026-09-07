"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Building2, MapPin, Phone, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatINR, formatNumber } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { createClient } from "@/lib/supabase/client";

interface LiveStoreRow {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  isActive: boolean;
  revenuePaise: number;
  sales: number;
  customers: number;
  pointsIssued: number;
}

function useLiveStores() {
  const configured = isSupabaseConfigured();
  const supabase = React.useMemo(() => createClient(), []);
  const [rows, setRows] = React.useState<LiveStoreRow[]>([]);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);
  const [loading, setLoading] = React.useState(configured);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id, role")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      const meRow = me as { business_id: string; role: string } | null;
      if (!meRow) return;
      setBusinessId(meRow.business_id);
      setIsOwner(meRow.role === "owner");

      const [storesRes, salesRes] = await Promise.all([
        supabase
          .from("stores")
          .select("id, name, address_line, city, region, phone, is_active")
          .eq("business_id", meRow.business_id)
          .order("name"),
        supabase
          .from("sales")
          .select("store_id, total_paise, total_points, customer_membership_id")
          .eq("business_id", meRow.business_id)
          .eq("status", "completed")
          .limit(5000),
      ]);

      const agg = new Map<string, { revenuePaise: number; sales: number; points: number; members: Set<string> }>();
      for (const s of (salesRes.data ?? []) as { store_id: string; total_paise: number; total_points: number; customer_membership_id: string | null }[]) {
        const a = agg.get(s.store_id) ?? { revenuePaise: 0, sales: 0, points: 0, members: new Set<string>() };
        a.revenuePaise += Number(s.total_paise);
        a.sales += 1;
        a.points += Number(s.total_points);
        if (s.customer_membership_id) a.members.add(s.customer_membership_id);
        agg.set(s.store_id, a);
      }

      setRows(
        ((storesRes.data ?? []) as { id: string; name: string; address_line: string | null; city: string | null; region: string | null; phone: string | null; is_active: boolean }[]).map((s) => {
          const a = agg.get(s.id);
          return {
            id: s.id,
            name: s.name,
            address: s.address_line ?? "",
            city: [s.city, s.region].filter(Boolean).join(", "),
            phone: s.phone ?? "",
            isActive: s.is_active,
            revenuePaise: a?.revenuePaise ?? 0,
            sales: a?.sales ?? 0,
            customers: a?.members.size ?? 0,
            pointsIssued: a?.points ?? 0,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const create = React.useCallback(
    async (values: { name: string; address: string; city: string; phone: string }) => {
      if (!supabase) return;
      const [city, region] = values.city.split(",").map((v) => v.trim());
      const { error } = await supabase.rpc("upsert_store", {
        p_name: values.name,
        p_address_line: values.address || null,
        p_city: city || null,
        p_region: region || null,
        p_phone: values.phone || null,
      });
      if (error) throw error;
      await reload();
    },
    [supabase, reload]
  );

  return { configured, rows, businessId, isOwner, loading, create };
}

export default function StoresPage() {
  const { state } = useStore();
  const { storeService } = useServices();
  const live = useLiveStores();
  const configured = live.configured;
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", address: "", city: "", phone: "", manager: "" });

  const totals = React.useMemo(() => {
    if (configured) {
      return {
        revenue: live.rows.reduce((s, x) => s + x.revenuePaise, 0) / 100,
        sales: live.rows.reduce((s, x) => s + x.sales, 0),
        points: live.rows.reduce((s, x) => s + x.pointsIssued, 0),
      };
    }
    return {
      revenue: state.stores.reduce((s, x) => s + x.revenue, 0),
      sales: state.stores.reduce((s, x) => s + x.sales, 0),
      points: state.stores.reduce((s, x) => s + x.pointsIssued, 0),
    };
  }, [configured, live.rows, state.stores]);

  const create = async () => {
    setSaving(true);
    try {
      if (configured) {
        await live.create(form);
      } else {
        await storeService.createStore({
          name: form.name, address: form.address, city: form.city, phone: form.phone, manager: form.manager,
          sales: 0, customers: 0, revenue: 0, pointsIssued: 0, status: "Active",
        });
      }
      setOpen(false);
      setForm({ name: "", address: "", city: "", phone: "", manager: "" });
      toast.success("Store added.");
    } catch (err) {
      toast.error("Couldn't add the store", { description: err instanceof Error ? err.message : "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const storeCount = configured ? live.rows.length : state.stores.length;

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="space-y-4 shrink-0">
        <PageHeader
          title="Stores"
          description="Locations running the Ambika Electricals rewards programme."
          actions={(!configured || live.isOwner) ? <Button onClick={() => setOpen(true)}><Plus /> Add Store</Button> : undefined}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Stores" value={String(storeCount)} icon={Building2} />
          <StatCard label="Total revenue" value={formatINR(totals.revenue)} />
          <StatCard label="Total sales" value={formatNumber(totals.sales)} />
          <StatCard label="Points issued" value={formatNumber(totals.points)} />
        </div>
      </div>

      {live.loading && configured ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          Loading stores…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 flex-1 min-h-0 overflow-y-auto scroll-region p-1">
          {configured
            ? live.rows.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{s.name}</h3>
                        {(s.address || s.city) && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{[s.address, s.city].filter(Boolean).join(", ")}
                          </p>
                        )}
                        {s.phone && (
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="size-3.5" aria-hidden />{s.phone}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={s.isActive ? "Active" : "Inactive"} />
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <Metric label="Revenue" value={formatINR(s.revenuePaise / 100)} />
                      <Metric label="Sales" value={formatNumber(s.sales)} />
                      <Metric label="Members" value={formatNumber(s.customers)} />
                      <Metric label="Points" value={formatNumber(s.pointsIssued)} />
                    </div>
                  </Card>
                </motion.div>
              ))
            : state.stores.map((s, i) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{s.name}</h3>
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{s.address}, {s.city}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3.5" aria-hidden />{s.phone}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="size-3.5" aria-hidden />Manager: {s.manager}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>

                    <Separator className="my-4" />

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <Metric label="Revenue" value={formatINR(s.revenue)} />
                      <Metric label="Sales" value={formatNumber(s.sales)} />
                      <Metric label="Members" value={formatNumber(s.customers)} />
                      <Metric label="Points" value={formatNumber(s.pointsIssued)} />
                    </div>
                  </Card>
                </motion.div>
              ))}
        </div>
      )}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add a store"
        description="New stores can immediately record sales and issue points."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} disabled={form.name.trim().length < 3}>Add store</Button>
          </>
        }
      >
          <div className="space-y-4 py-2">
            <Field label="Store name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ambika Electricals — Katargam" />
            <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Shop 8, Krishna Plaza" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City & PIN" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="Surat, Gujarat 395004" />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+91 98250 41300" />
            </div>
            {!configured && (
              <Field label="Manager" value={form.manager} onChange={(v) => setForm({ ...form, manager: v })} placeholder="Ruchi Shah" />
            )}
          </div>
      </FormDialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <p className="truncate text-sm font-semibold tabular">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
