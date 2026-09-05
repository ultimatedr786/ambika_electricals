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

export default function StoresPage() {
  const { state } = useStore();
  const { storeService } = useServices();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", address: "", city: "", phone: "", manager: "" });

  const totals = React.useMemo(() => ({
    revenue: state.stores.reduce((s, x) => s + x.revenue, 0),
    sales: state.stores.reduce((s, x) => s + x.sales, 0),
    points: state.stores.reduce((s, x) => s + x.pointsIssued, 0),
  }), [state.stores]);

  const create = async () => {
    setSaving(true);
    await storeService.createStore({
      name: form.name, address: form.address, city: form.city, phone: form.phone, manager: form.manager,
      sales: 0, customers: 0, revenue: 0, pointsIssued: 0, status: "Active",
    });
    setSaving(false);
    setOpen(false);
    setForm({ name: "", address: "", city: "", phone: "", manager: "" });
    toast.success("Store added.");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stores"
        description="Locations running the Ambika Electricals rewards programme."
        actions={<Button onClick={() => setOpen(true)}><Plus /> Add Store</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stores" value={String(state.stores.length)} icon={Building2} />
        <StatCard label="Total revenue" value={formatINR(totals.revenue)} />
        <StatCard label="Total sales" value={formatNumber(totals.sales)} />
        <StatCard label="Points issued" value={formatNumber(totals.points)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {state.stores.map((s, i) => (
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
            <Field label="Manager" value={form.manager} onChange={(v) => setForm({ ...form, manager: v })} placeholder="Ruchi Shah" />
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
