"use client";

import * as React from "react";
import { toast } from "sonner";
import { ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { initials, relativeTime } from "@/lib/utils";
import type { StaffMember } from "@/types";

const roles: StaffMember["role"][] = ["Owner", "Manager", "Cashier", "Marketing"];

const permissions: Record<StaffMember["role"], string[]> = {
  Owner: ["Full access", "Billing & settings", "Staff management"],
  Manager: ["Sales & customers", "Rewards & campaigns", "Store analytics"],
  Cashier: ["Record sales", "Scan customer QR", "View customers"],
  Marketing: ["Campaigns & challenges", "Rewards catalogue", "Analytics"],
};

export default function StaffPage() {
  const { state } = useStore();
  const { staffService } = useServices();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", role: "Cashier" as StaffMember["role"], store: "Main Store" });

  const results = state.staff.filter((s) => {
    const t = query.trim().toLowerCase();
    return !t || `${s.name} ${s.email} ${s.role}`.toLowerCase().includes(t);
  });

  const invite = async () => {
    setSaving(true);
    await staffService.createStaff({
      name: form.name, email: form.email, role: form.role, store: form.store,
      status: "Invited", lastActive: new Date().toISOString(),
    });
    setSaving(false);
    setOpen(false);
    setForm({ name: "", email: "", role: "Cashier", store: "Main Store" });
    toast.success("Invitation sent", { description: "In this prototype no real email is delivered." });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description="Team members who can operate the rewards programme."
        actions={<Button onClick={() => setOpen(true)}><UserPlus /> Invite Staff</Button>}
      />

      <SearchInput value={query} onChange={setQuery} placeholder="Search staff by name, email or role" className="max-w-md" />

      {results.length === 0 ? (
        <EmptyState icon={UserPlus} title="No staff found." description="Try a different search term." />
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9"><AvatarFallback>{initials(s.name)}</AvatarFallback></Avatar>
                        <div>
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={s.role}
                        onValueChange={async (v) => {
                          await staffService.updateStaff(s.id, { role: v as StaffMember["role"] });
                          toast.success(`${s.name} is now a ${v}.`);
                        }}
                      >
                        <SelectTrigger className="w-[130px]" aria-label={`Role for ${s.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.store}</TableCell>
                    <TableCell className="text-muted-foreground">{relativeTime(s.lastActive)}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {permissions[s.role].slice(0, 2).map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-2.5 md:hidden">
            {results.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10"><AvatarFallback>{initials(s.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{s.role}</Badge>
                  <Badge variant="outline">{s.store}</Badge>
                  <span className="text-xs text-muted-foreground">{relativeTime(s.lastActive)}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> Role permissions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => (
            <div key={r} className="rounded-lg border bg-muted/30 p-3.5">
              <p className="text-sm font-medium">{r}</p>
              <ul className="mt-2 space-y-1">
                {permissions[r].map((p) => <li key={p} className="text-xs text-muted-foreground">• {p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Invite a team member"
        description="They'll get access based on the role you choose."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={invite} loading={saving} disabled={form.name.trim().length < 3 || !form.email.includes("@")}>Send invite</Button>
          </>
        }
      >
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sname">Full name</Label>
              <Input id="sname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Devang Rana" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semail">Work email</Label>
              <Input id="semail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="devang@ambikaelectricals.in" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffMember["role"] })}>
                  <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Store</Label>
                <Select value={form.store} onValueChange={(v) => setForm({ ...form, store: v })}>
                  <SelectTrigger aria-label="Store"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Main Store">Main Store</SelectItem>
                    <SelectItem value="City Branch">City Branch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium">{form.role} can:</p>
              <ul className="mt-1 space-y-0.5">
                {permissions[form.role].map((p) => <li key={p} className="text-xs text-muted-foreground">• {p}</li>)}
              </ul>
            </div>
          </div>
      </FormDialog>
    </div>
  );
}
