"use client";

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowRight, Cake, Calendar, Gift, Layers, Megaphone, Package, Plus, Sparkles,
  Trash2, TrendingUp, UserPlus, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shared/form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { productCategories } from "@/lib/mock-data/products";
import { cn, formatNumber } from "@/lib/utils";
import type { RewardRule } from "@/types";

type RuleType = RewardRule["type"];

const triggers: { type: RuleType; label: string; hint: string; icon: LucideIcon }[] = [
  { type: "spend", label: "Customer spends", hint: "Earn points per ₹ spent", icon: TrendingUp },
  { type: "product", label: "Buys a product", hint: "Bonus on specific items", icon: Package },
  { type: "category", label: "Buys from category", hint: "Multiplier per category", icon: Layers },
  { type: "multiplier", label: "On specific days", hint: "Weekend or festival boost", icon: Calendar },
  { type: "signup", label: "Creates an account", hint: "Welcome bonus", icon: UserPlus },
  { type: "first_purchase", label: "Makes first purchase", hint: "Activation bonus", icon: Sparkles },
  { type: "referral", label: "Refers a friend", hint: "Referral bonus", icon: Users },
  { type: "birthday", label: "Has a birthday", hint: "Birthday month bonus", icon: Cake },
  { type: "campaign", label: "Campaign is running", hint: "Campaign multiplier", icon: Megaphone },
];

const iconFor = (t: RuleType) => triggers.find((x) => x.type === t)?.icon ?? Zap;
const isMultiplier = (t: RuleType) => t === "category" || t === "multiplier" || t === "campaign";

export default function RulesPage() {
  const { state } = useStore();
  const { ruleService } = useServices();
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<RewardRule | null>(null);

  const activeCount = state.rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reward Rules"
        description="Define exactly how members earn points. Rules apply automatically at checkout."
        actions={<Button onClick={() => setBuilderOpen(true)}><Plus /> Create Rule</Button>}
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap className="size-5" aria-hidden /></div>
          <div>
            <p className="text-sm font-medium">Base earn rate</p>
            <p className="text-xs text-muted-foreground">10 points per ₹100 spent, multiplied by the member&apos;s tier.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[["Bronze", "1x"], ["Silver", "1.25x"], ["Gold", "1.5x"], ["Platinum", "2x"]].map(([t, m]) => (
            <Badge key={t} variant="secondary" className="tabular">{t} {m}</Badge>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Active rules <span className="text-muted-foreground">({activeCount} of {state.rules.length} enabled)</span>
        </h2>
      </div>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {state.rules.map((rule) => {
            const Icon = iconFor(rule.type);
            return (
              <motion.div
                key={rule.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className={cn("p-4 transition-colors", !rule.enabled && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{rule.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">WHEN</span>
                          <span className="text-muted-foreground">{rule.when}</span>
                          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                          <span className="rounded-md bg-success/10 px-1.5 py-0.5 font-medium text-success">THEN</span>
                          <span className="text-foreground">{rule.then}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={rule.enabled}
                        aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                        onCheckedChange={() => {
                          ruleService.toggleRule(rule.id);
                          toast.success(`${rule.name} ${rule.enabled ? "disabled" : "enabled"}.`);
                        }}
                      />
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(rule)} aria-label={`Delete ${rule.name}`}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <RuleBuilder open={builderOpen} onOpenChange={setBuilderOpen} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this rule?"
        description={`"${deleting?.name}" will stop applying to new sales. This can't be undone in the prototype.`}
        confirmLabel="Delete rule"
        destructive
        onConfirm={() => {
          if (deleting) {
            ruleService.deleteRule(deleting.id);
            toast.success(`${deleting.name} deleted.`);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RuleBuilder({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { ruleService } = useServices();
  const { state } = useStore();
  const [type, setType] = React.useState<RuleType>("spend");
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState(100);
  const [target, setTarget] = React.useState("Lighting");
  const [value, setValue] = React.useState(10);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) { setType("spend"); setName(""); setAmount(100); setTarget("Lighting"); setValue(10); }
  }, [open]);

  const whenText = React.useMemo(() => {
    switch (type) {
      case "spend": return `Customer spends ₹${formatNumber(amount)}`;
      case "product": return `Customer buys ${target}`;
      case "category": return `Purchase from ${target}`;
      case "multiplier": return `Purchase on ${target}`;
      case "signup": return "Customer creates an account";
      case "first_purchase": return "Customer makes their first purchase";
      case "referral": return "A referred friend makes a purchase";
      case "birthday": return "It's the customer's birthday month";
      case "campaign": return `${target} is running`;
    }
  }, [type, amount, target]);

  const thenText = isMultiplier(type) ? `Award ${value}X points` : `Award ${formatNumber(value)} ${type === "spend" ? "" : "bonus "}points`;

  const targetOptions =
    type === "category" ? (productCategories as unknown as string[])
      : type === "product" ? state.products.slice(0, 20).map((p) => p.name)
      : type === "multiplier" ? ["Saturday or Sunday", "Weekdays", "Diwali week", "the 1st of the month"]
      : type === "campaign" ? state.campaigns.map((c) => c.name)
      : [];

  const save = async () => {
    setSaving(true);
    await ruleService.createRule({
      name: name.trim() || `${whenText} rule`,
      type,
      when: whenText,
      then: thenText,
      value,
      enabled: true,
    });
    setSaving(false);
    onOpenChange(false);
    toast.success("Rule created", { description: `${whenText} → ${thenText}` });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create a reward rule"
      description="Pick a trigger, then choose what members earn."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={value <= 0}>Create rule</Button>
        </>
      }
    >
        <div className="space-y-5 py-2">
          <div>
            <Label className="mb-2 block">1. When this happens</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {triggers.map((t) => {
                const Icon = t.icon;
                const selected = type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => { setType(t.type); setValue(isMultiplier(t.type) ? 2 : 100); setTarget(t.type === "campaign" ? (state.campaigns[0]?.name ?? "Campaign") : t.type === "multiplier" ? "Saturday or Sunday" : t.type === "product" ? (state.products[0]?.name ?? "any LED product") : "Lighting"); }}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-[44px] rounded-lg border p-3 text-left transition-all hover:border-primary/40 hover:bg-muted/50",
                      selected && "border-primary bg-primary/5 ring-1 ring-primary"
                    )}
                  >
                    <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <p className="mt-1.5 text-[13px] font-medium leading-tight">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground">{t.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            {type === "spend" && (
              <div className="space-y-1.5">
                <Label htmlFor="amt">Spend threshold (₹)</Label>
                <Input id="amt" inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)} />
              </div>
            )}
            {targetOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label>{type === "multiplier" ? "Days" : type === "campaign" ? "Campaign" : type === "category" ? "Category" : "Product"}</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger aria-label="Rule target"><SelectValue /></SelectTrigger>
                  <SelectContent>{targetOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="val">2. Then award {isMultiplier(type) ? "multiplier" : "points"}</Label>
              <Input id="val" inputMode="numeric" value={value} onChange={(e) => setValue(Number(e.target.value.replace(/\D/g, "")) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rulename">Rule name</Label>
              <Input id="rulename" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali lighting bonus" />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">WHEN</Badge>
              <span>{whenText}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
              <Badge className="bg-success/15 text-success hover:bg-success/15">THEN</Badge>
              <span className="font-medium">{thenText}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gift className="size-3.5" aria-hidden />
              Applies on top of the member&apos;s tier multiplier.
            </p>
          </div>
        </div>
    </FormDialog>
  );
}
