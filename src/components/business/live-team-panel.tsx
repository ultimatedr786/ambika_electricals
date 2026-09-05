"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Copy,
  Crown,
  MailX,
  Store,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/auth/env";
import { initials } from "@/lib/utils";
import {
  changeMemberRoleAction,
  createInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
  setMemberStoreAction,
} from "@/app/business/(app)/staff/team-actions";

/**
 * Live team & invitations (Stage F) — real Supabase data, rendered above the
 * prototype roster on the Staff page.
 *
 * Visibility follows the RLS matrix:
 *  - owner   → roster + invitations + role changes + removal + store scoping
 *  - manager → read-only roster
 *  - staff / demo mode → panel not rendered
 *
 * Every mutation goes through a server action calling a SECURITY DEFINER RPC
 * that re-checks role & tenancy; denials are audited server-side.
 */

type LiveRole = "owner" | "manager" | "staff";

interface MemberRow {
  profileId: string;
  name: string;
  email: string;
  role: LiveRole;
  storeIds: string[];
  isSelf: boolean;
}

interface InvitationRow {
  id: string;
  email: string;
  role: "manager" | "staff";
  storeId: string | null;
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
}

const EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
];

export function LiveTeamPanel() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const configured = isSupabaseConfigured();

  const [loading, setLoading] = React.useState(true);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [businessName, setBusinessName] = React.useState<string | null>(null);
  const [viewerRole, setViewerRole] = React.useState<LiveRole | null>(null);
  const [viewerId, setViewerId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [invitations, setInvitations] = React.useState<InvitationRow[]>([]);
  const [stores, setStores] = React.useState<{ id: string; name: string }[]>([]);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [inviteForm, setInviteForm] = React.useState({
    email: "",
    role: "staff" as "manager" | "staff",
    storeId: "none",
    expiresInHours: "72",
  });
  const [copyLink, setCopyLink] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!configured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: me } = await supabase
        .from("business_memberships")
        .select("business_id, role, profile_id")
        .eq("status", "active");
      const rows = (me ?? []) as { business_id: string; role: LiveRole; profile_id: string }[];
      if (rows.length === 0 || rows[0].role === "staff") {
        setViewerRole(rows[0]?.role ?? null);
        setMembers([]);
        setInvitations([]);
        return;
      }

      const bid = rows[0].business_id;
      setBusinessId(bid);
      setViewerRole(rows[0].role);
      setViewerId(rows[0].profile_id);

      const [businessRes, rosterRes, storeRes, storeMemRes, invRes] = await Promise.all([
        supabase.from("businesses").select("name").eq("id", bid).maybeSingle(),
        supabase.from("business_memberships").select("profile_id, role").eq("business_id", bid).eq("status", "active"),
        supabase.from("stores").select("id, name").eq("business_id", bid).order("name"),
        supabase.from("store_memberships").select("profile_id, store_id").eq("business_id", bid),
        rows[0].role === "owner"
          ? supabase.from("invitations").select("id, email, role, store_id, status, expires_at, created_at").eq("business_id", bid).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const roster = (rosterRes.data ?? []) as { profile_id: string; role: LiveRole }[];
      const profileIds = roster.map((r) => r.profile_id);
      const { data: profilesData } = profileIds.length
        ? await supabase.from("profiles").select("id, email, display_name").in("id", profileIds)
        : { data: [] };
      const profiles = new Map(
        ((profilesData ?? []) as { id: string; email: string; display_name: string | null }[]).map((p) => [p.id, p])
      );
      const storeMem = (storeMemRes.data ?? []) as { profile_id: string; store_id: string }[];

      setBusinessName(((businessRes.data as { name?: string } | null)?.name ?? null) as string | null);
      setStores((storeRes.data ?? []) as { id: string; name: string }[]);
      setMembers(
        roster.map((r) => ({
          profileId: r.profile_id,
          name: profiles.get(r.profile_id)?.display_name ?? profiles.get(r.profile_id)?.email ?? "Team member",
          email: profiles.get(r.profile_id)?.email ?? "",
          role: r.role,
          storeIds: storeMem.filter((s) => s.profile_id === r.profile_id).map((s) => s.store_id),
          isSelf: r.profile_id === rows[0].profile_id,
        }))
      );
      setInvitations(
        ((invRes.data ?? []) as {
          id: string; email: string; role: "manager" | "staff"; store_id: string | null;
          status: "pending" | "accepted" | "revoked"; expires_at: string; created_at: string;
        }[]).map((i) => ({
          id: i.id, email: i.email, role: i.role, storeId: i.store_id, status: i.status,
          expiresAt: i.expires_at, createdAt: i.created_at,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  if (!configured) return null;
  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        Loading live team…
      </Card>
    );
  }
  if (!businessId || !viewerRole || viewerRole === "staff") return null;

  const isOwner = viewerRole === "owner";
  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? null;

  const submitInvite = async () => {
    if (!businessId || !inviteForm.email.includes("@")) return;
    setInviteBusy(true);
    try {
      const result = await createInvitationAction({
        businessId,
        email: inviteForm.email,
        role: inviteForm.role,
        storeId: inviteForm.storeId === "none" ? null : inviteForm.storeId,
        expiresInHours: Number(inviteForm.expiresInHours),
      });
      if (!result.ok) {
        toast.error("Couldn't send the invitation", { description: result.message });
        return;
      }
      if (result.data.emailSent) {
        toast.success("Invitation sent", {
          description: `${inviteForm.email} will receive a single-use link${result.data.acceptUrl ? "" : " by email"}.`,
        });
      } else {
        setCopyLink(result.data.acceptUrl);
        toast.info("Email delivery isn't configured yet", {
          description: "Share the invitation link manually — it's shown in the dialog.",
        });
      }
      setInviteForm({ email: "", role: "staff", storeId: "none", expiresInHours: "72" });
      await reload();
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-4.5" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Live team
              <Badge variant="outline" className="gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Supabase
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              {businessName ?? "Your business"} · signed-in membership data with database-enforced permissions
            </p>
          </div>
        </div>
        {isOwner && (
          <Button size="sm" onClick={() => { setCopyLink(null); setInviteOpen(true); }}>
            <UserPlus /> Invite team member
          </Button>
        )}
      </div>

      {/* Roster */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Stores</TableHead>
            {isOwner && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.profileId}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-9"><AvatarFallback>{initials(m.name)}</AvatarFallback></Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {m.name}
                      {m.isSelf && <span className="ml-1.5 text-[11px] text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {isOwner && m.role !== "owner" && !m.isSelf ? (
                  <Select
                    value={m.role}
                    disabled={busyId === m.profileId}
                    onValueChange={async (v) => {
                      if (!businessId) return;
                      setBusyId(m.profileId);
                      try {
                        const res = await changeMemberRoleAction(businessId, m.profileId, v as "manager" | "staff");
                        if (res.ok) {
                          toast.success(`${m.name} is now a ${v === "manager" ? "Manager" : "Staff"} member.`);
                          await reload();
                        } else {
                          toast.error("Couldn't change the role", { description: res.message });
                        }
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[120px]" aria-label={`Role for ${m.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={m.role === "owner" ? "default" : "secondary"} className="gap-1 capitalize">
                    {m.role === "owner" && <Crown className="size-3" aria-hidden />} {m.role}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {m.role === "owner" ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="size-3.5" aria-hidden /> All stores
                  </span>
                ) : m.storeIds.length === 0 ? (
                  <span className="text-xs text-muted-foreground">All stores (unscoped)</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {m.storeIds.map((sid) => (
                      <Badge key={sid} variant="outline" className="gap-1 text-[10px]">
                        <Store className="size-2.5" aria-hidden /> {storeName(sid) ?? "Store"}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              {isOwner && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {m.role !== "owner" && (
                      <>
                        {stores.map((s) => (
                          <Button
                            key={s.id}
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={busyId === m.profileId}
                            title={m.storeIds.includes(s.id) ? `Unscope from ${s.name}` : `Scope to ${s.name}`}
                            onClick={async () => {
                              setBusyId(m.profileId);
                              try {
                                const res = await setMemberStoreAction(
                                  m.storeIds.includes(s.id) ? "unassign" : "assign",
                                  s.id,
                                  m.profileId
                                );
                                if (res.ok) {
                                  toast.success(`Store access updated for ${m.name}.`);
                                  await reload();
                                } else {
                                  toast.error("Couldn't update store access", { description: res.message });
                                }
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            <Store className="mr-1 size-3" /> {s.name}
                          </Button>
                        ))}
                        {!m.isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                            disabled={busyId === m.profileId}
                            onClick={async () => {
                              if (!businessId) return;
                              if (!window.confirm(`Remove ${m.name} from ${businessName ?? "the business"}? They'll lose access immediately.`)) return;
                              setBusyId(m.profileId);
                              try {
                                const res = await removeMemberAction(businessId, m.profileId);
                                if (res.ok) {
                                  toast.success(`${m.name} no longer has access.`);
                                  await reload();
                                } else {
                                  toast.error("Couldn't remove the member", { description: res.message });
                                }
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            <UserMinus className="mr-1 size-3" /> Remove
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Invitations (owner only) */}
      {isOwner && (
        <div className="border-t px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserCog className="size-4 text-muted-foreground" aria-hidden /> Invitations
          </h3>
          {invitations.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              No invitations yet. Invite a manager or staff member — they&apos;ll get a single-use email link.
            </p>
          ) : (
            <ul className="mt-2.5 space-y-2">
              {invitations.map((inv) => {
                const expired = inv.status === "pending" && new Date(inv.expiresAt).getTime() < Date.now();
                const derived = inv.status === "pending" && expired ? "expired" : inv.status;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    <Badge
                      variant={derived === "pending" ? "secondary" : derived === "accepted" ? "default" : "outline"}
                      className={derived === "expired" || derived === "revoked" ? "text-muted-foreground" : ""}
                    >
                      {derived}
                    </Badge>
                    <span className="font-medium">{inv.email}</span>
                    <span className="text-xs text-muted-foreground capitalize">{inv.role}</span>
                    {inv.storeId && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Store className="size-2.5" aria-hidden /> {storeName(inv.storeId) ?? "Store"}
                      </Badge>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {derived === "pending" && (
                        <>
                          expires {new Date(inv.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                            disabled={busyId === inv.id}
                            onClick={async () => {
                              if (!businessId) return;
                              setBusyId(inv.id);
                              try {
                                const res = await revokeInvitationAction(businessId, inv.id);
                                if (res.ok) {
                                  toast.success("Invitation revoked.", { description: `${inv.email} can no longer use it.` });
                                  await reload();
                                } else {
                                  toast.error("Couldn't revoke the invitation", { description: res.message });
                                }
                              } finally {
                                setBusyId(null);
                              }
                            }}
                          >
                            <MailX className="mr-1 size-3" /> Revoke
                          </Button>
                        </>
                      )}
                      {derived === "expired" && <span>expired — send a new one</span>}
                      {derived === "accepted" && <span>accepted</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Invite dialog */}
      <FormDialog
        open={inviteOpen}
        onOpenChange={(o) => { setInviteOpen(o); if (!o) setCopyLink(null); }}
        title="Invite a team member"
        description="They'll receive a single-use email link. Invitations are bound to the invited address and expire automatically."
        footer={
          copyLink ? (
            <Button onClick={() => { setCopyLink(null); setInviteOpen(false); }}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={submitInvite} loading={inviteBusy} disabled={!inviteForm.email.includes("@")}>
                Send invitation
              </Button>
            </>
          )
        }
      >
        {copyLink ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Email delivery isn&apos;t configured on this deployment (see SETUP_SUPABASE_AND_RESEND.md §4). Share this
              single-use link with <strong className="text-foreground">{inviteForm.email || "the invitee"}</strong>:
            </p>
            <div className="flex gap-2">
              <Input readOnly value={copyLink} className="text-xs" aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(copyLink);
                    toast.success("Link copied to clipboard.");
                  } catch {
                    toast.error("Couldn't copy — select the link manually.");
                  }
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Work email</Label>
              <Input
                id="inv-email"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="teammate@example.com"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(v) => setInviteForm({ ...inviteForm, role: v as "manager" | "staff" })}
                >
                  <SelectTrigger aria-label="Invitation role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Store scope</Label>
                <Select value={inviteForm.storeId} onValueChange={(v) => setInviteForm({ ...inviteForm, storeId: v })}>
                  <SelectTrigger aria-label="Store scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All stores</SelectItem>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expires in</Label>
                <Select value={inviteForm.expiresInHours} onValueChange={(v) => setInviteForm({ ...inviteForm, expiresInHours: v })}>
                  <SelectTrigger aria-label="Invitation expiry"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium">{inviteForm.role === "manager" ? "Manager" : "Staff"} can:</p>
              <ul className="mt-1 space-y-0.5">
                {(inviteForm.role === "manager"
                  ? ["Record sales & manage customers", "Manage rewards, campaigns and analytics", "Edit customer memberships"]
                  : ["Record sales & scan customer QR", "View customers and catalogue", "No settings or staff management"]
                ).map((p) => (
                  <li key={p} className="text-xs text-muted-foreground">• {p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </FormDialog>
    </Card>
  );
}
