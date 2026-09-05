"use client";

import { toast } from "sonner";
import { Copy, Gift, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { useCurrentCustomer } from "@/lib/store";
import { formatNumber } from "@/lib/utils";

export default function ReferralsPage() {
  const customer = useCurrentCustomer();
  const message = `Join me at Ambika Electricals Rewards! Use my code ${customer.referralCode} and we both earn bonus points on electrical purchases.`;

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Ambika Electricals Rewards", text: message });
        return;
      } catch { /* dismissed */ }
    }
    navigator.clipboard?.writeText(message);
    toast.success("Invite copied to clipboard");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Invite friends. Earn rewards." description="You earn 200 points when a friend makes their first electrical purchase." />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-center text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">Your referral code</p>
          <p className="mt-2 text-3xl font-semibold tracking-[0.2em]">{customer.referralCode}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => { navigator.clipboard?.writeText(customer.referralCode); toast.success("Copied to clipboard"); }}
            >
              <Copy /> Copy Code
            </Button>
            <Button variant="secondary" onClick={share}><Share2 /> Share</Button>
            <Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(message); toast.success("Message copied — paste it into WhatsApp"); }}>
              WhatsApp
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Friends invited</p>
          <p className="mt-1 text-xl font-semibold tabular">{customer.referrals + 2}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Successful</p>
          <p className="mt-1 text-xl font-semibold tabular">{customer.referrals}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Points earned</p>
          <p className="mt-1 text-xl font-semibold tabular text-success">+{formatNumber(customer.referrals * 200)}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">How it works</h2>
        <ol className="mt-3.5 space-y-3.5">
          {[
            { icon: Share2, title: "Share your code", body: `Send ${customer.referralCode} to a friend who buys electrical goods.` },
            { icon: Users, title: "They join Rewardly", body: "Your friend creates an account and gets 100 welcome points." },
            { icon: Gift, title: "You both earn", body: "You get 200 points after their first purchase at Ambika Electricals." },
          ].map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="size-[18px]" />
              </span>
              <div>
                <p className="text-sm font-medium">{i + 1}. {s.title}</p>
                <p className="text-[13px] text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
