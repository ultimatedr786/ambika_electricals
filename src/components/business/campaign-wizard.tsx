"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { useServices } from "@/lib/services";
import { cn, formatNumber, sleep } from "@/lib/utils";

const steps = ["Goal", "Audience", "Reward", "Schedule", "Review"] as const;

const goals = [
  { id: "repeat", label: "Drive repeat purchases", hint: "Bring existing members back into store" },
  { id: "winback", label: "Win back lapsed members", hint: "Re-engage customers inactive 60+ days" },
  { id: "upsell", label: "Increase basket size", hint: "Reward larger electrical orders" },
  { id: "launch", label: "Promote a new range", hint: "Push a brand or product category" },
];

const audiences = [
  "All members",
  "Gold & Platinum members",
  "Silver members",
  "Bronze members",
  "Lapsed members (60+ days)",
  "Electricians & contractors",
  "New members (last 30 days)",
];

const rewardTemplates = [
  "2X points on all purchases",
  "3X points on Lighting",
  "500 bonus points on ₹5,000+ spend",
  "Free Philips 9W LED Bulb on ₹3,000+ spend",
  "10% off Wires & Cables",
  "₹500 off on Havells fans",
];

const aiSuggestions = [
  {
    prompt: "Diwali lighting push",
    name: "Diwali Roshni Bonus",
    description: "Celebrate Diwali with triple points on all Lighting purchases at Ambika Electricals — LED bulbs, panels, decorative holders and more.",
    goal: "launch",
    audience: "All members",
    reward: "3X points on Lighting",
    days: 21,
  },
  {
    prompt: "Bring back quiet customers",
    name: "We Miss You — Electrician Special",
    description: "A 500-point welcome-back bonus for members who haven't shopped in 60 days, plus 2X points on wires and switchgear.",
    goal: "winback",
    audience: "Lapsed members (60+ days)",
    reward: "500 bonus points on ₹5,000+ spend",
    days: 30,
  },
  {
    prompt: "Grow contractor basket size",
    name: "Contractor Bulk Boost",
    description: "Reward contractors buying in bulk — double points on orders above ₹10,000 across Wires & Cables and Protection.",
    goal: "upsell",
    audience: "Electricians & contractors",
    reward: "2X points on all purchases",
    days: 45,
  },
];

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function CampaignWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state } = useStore();
  const { campaignService } = useServices();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  const [goal, setGoal] = React.useState("repeat");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [audience, setAudience] = React.useState(audiences[0]);
  const [reward, setReward] = React.useState(rewardTemplates[0]);
  const [startDate, setStartDate] = React.useState(addDays(0));
  const [endDate, setEndDate] = React.useState(addDays(21));

  React.useEffect(() => {
    if (open) {
      setStep(0); setGoal("repeat"); setName(""); setDescription("");
      setAudience(audiences[0]); setReward(rewardTemplates[0]);
      setStartDate(addDays(0)); setEndDate(addDays(21));
    }
  }, [open]);

  const estimatedReach = React.useMemo(() => {
    const total = state.customers.length * 240;
    const factor =
      audience === "All members" ? 1
        : audience.startsWith("Gold") ? 0.28
        : audience.startsWith("Silver") ? 0.34
        : audience.startsWith("Bronze") ? 0.3
        : audience.startsWith("Lapsed") ? 0.18
        : audience.startsWith("Electricians") ? 0.22
        : 0.12;
    return Math.round(total * factor);
  }, [audience, state.customers.length]);

  const canContinue = step === 0 ? name.trim().length >= 3 : true;

  const applySuggestion = (s: (typeof aiSuggestions)[number]) => {
    setGoal(s.goal); setName(s.name); setDescription(s.description);
    setAudience(s.audience); setReward(s.reward);
    setStartDate(addDays(0)); setEndDate(addDays(s.days));
    setAiOpen(false);
    setStep(4);
    toast.success("Draft generated", { description: "Review the details and launch when you're ready." });
  };

  const launch = async (status: "Active" | "Draft") => {
    setSaving(true);
    await campaignService.createCampaign({ name, description, status, audience, reward, startDate, endDate });
    setSaving(false);
    onOpenChange(false);
    toast.success(status === "Active" ? "Campaign launched" : "Draft saved", {
      description: status === "Active" ? `${name} is now live for ${formatNumber(estimatedReach)} members.` : `${name} saved as a draft.`,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create campaign</DialogTitle>
            <DialogDescription>Step {step + 1} of 5 · {steps[step]}</DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b px-6 pb-4">
          <div className="flex items-center gap-1.5" role="list" aria-label="Wizard progress">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-1 items-center gap-1.5" role="listitem">
                <div
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                    i < step && "border-primary bg-primary text-primary-foreground",
                    i === step && "border-primary text-primary",
                    i > step && "text-muted-foreground"
                  )}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step ? <Check className="size-3" aria-hidden /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className={cn("h-px flex-1 bg-border", i < step && "bg-primary")} />}
              </div>
            ))}
          </div>

          </div>

          <DialogBody className="py-4">
          <div className="min-h-[280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                {step === 0 && (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <Label>What&apos;s the goal?</Label>
                      <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}><Wand2 /> Create with AI</Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {goals.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGoal(g.id)}
                          aria-pressed={goal === g.id}
                          className={cn(
                            "min-h-[44px] rounded-lg border p-3 text-left transition-all hover:bg-muted/50",
                            goal === g.id && "border-primary bg-primary/5 ring-1 ring-primary"
                          )}
                        >
                          <p className="text-sm font-medium">{g.label}</p>
                          <p className="text-xs text-muted-foreground">{g.hint}</p>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cname">Campaign name</Label>
                      <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Festival Electrical Savings" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cdesc">Description</Label>
                      <Textarea id="cdesc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What members will see" />
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <Label>Who should receive it?</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {audiences.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAudience(a)}
                          aria-pressed={audience === a}
                          className={cn(
                            "min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm transition-all hover:bg-muted/50",
                            audience === a && "border-primary bg-primary/5 ring-1 ring-primary"
                          )}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                    <Card className="flex items-center justify-between p-3.5">
                      <span className="text-sm text-muted-foreground">Estimated reach</span>
                      <motion.span key={estimatedReach} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-lg font-semibold tabular">
                        {formatNumber(estimatedReach)} members
                      </motion.span>
                    </Card>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Label>What&apos;s the reward?</Label>
                    <div className="grid gap-2">
                      {rewardTemplates.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReward(r)}
                          aria-pressed={reward === r}
                          className={cn(
                            "min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm transition-all hover:bg-muted/50",
                            reward === r && "border-primary bg-primary/5 ring-1 ring-primary"
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="creward">Or write your own</Label>
                      <Input id="creward" value={reward} onChange={(e) => setReward(e.target.value)} />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Label>When does it run?</Label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cstart">Start date</Label>
                        <Input id="cstart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cend">End date</Label>
                        <Input id="cend" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Quick duration</Label>
                      <Select onValueChange={(v) => setEndDate(addDays(Number(v)))}>
                        <SelectTrigger aria-label="Quick duration"><SelectValue placeholder="Choose a preset" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">1 week</SelectItem>
                          <SelectItem value="14">2 weeks</SelectItem>
                          <SelectItem value="21">3 weeks</SelectItem>
                          <SelectItem value="30">1 month</SelectItem>
                          <SelectItem value="90">3 months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Members will be notified in-app when the campaign starts. No SMS or WhatsApp is sent in this prototype.
                    </p>
                  </>
                )}

                {step === 4 && (
                  <Card className="divide-y">
                    <div className="p-4">
                      <p className="text-sm font-semibold">{name || "Untitled campaign"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{description || "No description added."}</p>
                    </div>
                    <Row label="Goal" value={goals.find((g) => g.id === goal)?.label ?? "—"} />
                    <Row label="Audience" value={audience} />
                    <Row label="Estimated reach" value={`${formatNumber(estimatedReach)} members`} />
                    <Row label="Reward" value={reward} />
                    <Row label="Runs" value={`${startDate} → ${endDate}`} />
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <Separator />

          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : setStep((s) => s - 1))}>
              {step === 0 ? "Cancel" : <><ChevronLeft /> Back</>}
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>Continue <ChevronRight /></Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => launch("Draft")} disabled={saving}>Save as draft</Button>
                <Button onClick={() => launch("Active")} loading={saving}><Sparkles /> Launch campaign</Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} onApply={applySuggestion} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function AiAssistant({
  open, onOpenChange, onApply,
}: { open: boolean; onOpenChange: (v: boolean) => void; onApply: (s: (typeof aiSuggestions)[number]) => void }) {
  const [prompt, setPrompt] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [results, setResults] = React.useState<typeof aiSuggestions>([]);

  React.useEffect(() => {
    if (open) { setPrompt(""); setResults([]); setThinking(false); }
  }, [open]);

  const generate = async (text: string) => {
    setPrompt(text);
    setThinking(true);
    setResults([]);
    await sleep(1600);
    const t = text.toLowerCase();
    const ranked = [...aiSuggestions].sort((a, b) => {
      const score = (s: typeof a) => (t.includes(s.prompt.split(" ")[0].toLowerCase()) ? -1 : 0);
      return score(a) - score(b);
    });
    setResults(ranked);
    setThinking(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" aria-hidden /> Create with AI</DialogTitle>
          <DialogDescription>
            Describe what you want to achieve. Suggestions are simulated locally in this prototype.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="pb-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="aiprompt">Your goal</Label>
            <Textarea
              id="aiprompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Get contractors to buy more Polycab wire before Diwali"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {aiSuggestions.map((s) => (
              <Badge
                key={s.prompt}
                variant="outline"
                className="cursor-pointer px-2.5 py-1 hover:bg-muted"
                onClick={() => generate(s.prompt)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && generate(s.prompt)}
              >
                {s.prompt}
              </Badge>
            ))}
          </div>

          <Button className="w-full" onClick={() => generate(prompt)} disabled={prompt.trim().length < 4 || thinking}>
            {thinking ? <><Loader2 className="animate-spin" aria-hidden /> Drafting campaigns…</> : <><Sparkles /> Generate campaign ideas</>}
          </Button>

          <AnimatePresence>
            {results.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                {results.map((s, i) => (
                  <motion.div key={s.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                    <Card className="p-3.5">
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{s.audience}</Badge>
                        <Badge variant="secondary">{s.reward}</Badge>
                        <Badge variant="outline">{s.days} days</Badge>
                      </div>
                      <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => onApply(s)}>Use this draft</Button>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
