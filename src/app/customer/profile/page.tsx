"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  Bell, ChevronRight, HelpCircle, LogOut, Mail, Pencil, Phone, Shield, Sparkles, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { TierBadge } from "@/components/shared/tier-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useCurrentCustomer } from "@/lib/store";
import { useServices } from "@/lib/services";
import { formatDate, initials } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Enter your full name"),
  phone: z.string().min(10, "Enter a valid mobile number"),
  email: z.string().email("Enter a valid email"),
  birthday: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export default function ProfilePage() {
  const router = useRouter();
  const customer = useCurrentCustomer();
  const { customerService, authService } = useServices();
  const { theme, setTheme } = useTheme();
  const [editing, setEditing] = React.useState(false);
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState({ offers: true, points: true, expiry: true, whatsapp: false });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      birthday: customer.birthday ?? "",
    },
  });

  const save = form.handleSubmit(async (values) => {
    await customerService.updateCustomer(customer.id, values);
    setEditing(false);
    toast.success("Customer updated", { description: "Your profile details have been saved." });
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" description="Your details, preferences and account settings." />

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Avatar className="size-14">
          <AvatarFallback className="text-base">{initials(customer.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{customer.name}</p>
          <p className="text-sm tabular text-muted-foreground">{customer.membershipId}</p>
          <div className="mt-1.5"><TierBadge tier={customer.tier} /></div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit profile</Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Personal details</h2>
        <dl className="mt-3.5 grid gap-3 sm:grid-cols-2">
          <Detail icon={UserRound} label="Name" value={customer.name} />
          <Detail icon={Phone} label="Phone" value={customer.phone} />
          <Detail icon={Mail} label="Email" value={customer.email} />
          <Detail icon={Sparkles} label="Birthday" value={customer.birthday ? formatDate(customer.birthday, "long") : "Not added"} />
          <Detail icon={Shield} label="Member since" value={formatDate(customer.memberSince, "long")} />
          <Detail icon={UserRound} label="Home store" value={`Ambika Electricals — ${customer.store}`} />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Bell className="size-4" /> Notifications</h2>
        <div className="mt-3.5 space-y-1">
          <Toggle label="Points and purchase updates" checked={prefs.points} onChange={(v) => setPrefs((p) => ({ ...p, points: v }))} />
          <Separator />
          <Toggle label="Offers and campaigns" checked={prefs.offers} onChange={(v) => setPrefs((p) => ({ ...p, offers: v }))} />
          <Separator />
          <Toggle label="Reward expiry reminders" checked={prefs.expiry} onChange={(v) => setPrefs((p) => ({ ...p, expiry: v }))} />
          <Separator />
          <Toggle label="WhatsApp updates" checked={prefs.whatsapp} onChange={(v) => setPrefs((p) => ({ ...p, whatsapp: v }))} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Preferences</h2>
        <div className="mt-3.5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Appearance</p>
            <p className="text-[13px] text-muted-foreground">Choose light, dark or match your device.</p>
          </div>
          <Select value={theme ?? "system"} onValueChange={setTheme}>
            <SelectTrigger className="w-32" aria-label="Theme"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="divide-y">
        <LinkRow icon={Shield} label="Security" hint="Password and sign-in" onClick={() => toast.info("Security settings are UI only in this prototype.")} />
        <LinkRow icon={HelpCircle} label="Help & support" hint="+91 98250 41200" onClick={() => toast.info("Call the store on +91 98250 41200 for help.")} />
        <LinkRow icon={LogOut} label="Sign out" onClick={() => setSignOutOpen(true)} destructive />
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update your contact details and birthday.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Full name</Label>
              <Input id="p-name" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-phone">Phone</Label>
              <Input id="p-phone" inputMode="tel" {...form.register("phone")} />
              {form.formState.errors.phone && <p className="text-xs text-destructive">{form.formState.errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-email">Email</Label>
              <Input id="p-email" type="email" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-bday">Birthday</Label>
              <Input id="p-bday" type="date" {...form.register("birthday")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" loading={form.formState.isSubmitting}>Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Rewardly?"
        description="You'll need to sign in again to view your points and rewards."
        confirmLabel="Sign out"
        onConfirm={() => { authService.signOut(); router.push("/login"); }}
      />
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm font-medium">{value}</dd>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between py-2.5">
      <Label htmlFor={id} className="cursor-pointer font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LinkRow({
  icon: Icon, label, hint, onClick, destructive,
}: { icon: React.ElementType; label: string; hint?: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-h-[56px] items-center gap-3.5 px-5 text-left transition-colors hover:bg-accent/50"
    >
      <Icon className={`size-[18px] ${destructive ? "text-destructive" : "text-muted-foreground"}`} />
      <span className="flex-1">
        <span className={`block text-sm font-medium ${destructive ? "text-destructive" : ""}`}>{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
