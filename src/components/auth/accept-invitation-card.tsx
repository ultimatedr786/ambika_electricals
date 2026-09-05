"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Building2, Info, MailX, PartyPopper, ShieldAlert, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { acceptInvitationAction } from "@/app/business/(app)/staff/team-actions";

export type InvitationState =
  | "pending"
  | "expired"
  | "revoked"
  | "accepted"
  | "not_found"
  | "lookup_unavailable";

export interface AcceptInvitationCardProps {
  token: string;
  state: InvitationState;
  businessName: string | null;
  storeName: string | null;
  role: "manager" | "staff" | null;
  invitedEmail: string | null;
  expiresAt: string | null;
  signedIn: boolean;
  viewerEmail: string | null;
  demoMode: boolean;
}

const ROLE_LABEL: Record<string, string> = { manager: "Manager", staff: "Staff" };

function Panel({
  icon,
  tone,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  tone: "warn" | "bad" | "good" | "info";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "bg-success/12 text-success"
      : tone === "bad"
        ? "bg-destructive/10 text-destructive"
        : tone === "warn"
          ? "bg-amber-500/10 text-amber-500"
          : "bg-primary/10 text-primary";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border bg-card p-7 text-center shadow-sm"
    >
      <div className={["mx-auto flex size-14 items-center justify-center rounded-2xl", toneClass].join(" ")}>{icon}</div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      {children}
    </motion.div>
  );
}

export function AcceptInvitationCard(props: AcceptInvitationCardProps) {
  const router = useRouter();
  const [accepting, setAccepting] = React.useState(false);
  const { token, state } = props;
  const invitePath = `/auth/invite/${token}`;

  if (props.demoMode) {
    return (
      <Panel
        icon={<Info className="size-6" />}
        tone="info"
        title="Demo mode"
        body="Real staff invitations activate once Supabase is configured (see SETUP_SUPABASE_AND_RESEND.md). In this prototype the Staff page demonstrates the invitation workflow with mock data."
      >
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </Panel>
    );
  }

  if (state === "not_found") {
    return (
      <Panel
        icon={<MailX className="size-6" />}
        tone="bad"
        title="Invitation not found"
        body="This invitation link doesn't match anything we have. It may be mistyped or very old — ask the business owner to send a fresh invitation."
      />
    );
  }

  if (state === "revoked") {
    return (
      <Panel
        icon={<MailX className="size-6" />}
        tone="bad"
        title="Invitation no longer valid"
        body="The business owner revoked this invitation. If you still need access, ask them to send a new one."
      />
    );
  }

  if (state === "accepted") {
    return (
      <Panel
        icon={<PartyPopper className="size-6" />}
        tone="good"
        title="Invitation already accepted"
        body="This invitation has been used. Sign in with the invited email address to open your business dashboard."
      >
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </Panel>
    );
  }

  if (state === "expired") {
    return (
      <Panel
        icon={<MailX className="size-6" />}
        tone="warn"
        title="Invitation expired"
        body={`This invitation expired${props.expiresAt ? ` on ${new Date(props.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}. Ask the business owner to send you a new one.`}
      />
    );
  }

  const businessLabel = props.businessName ?? "a business on Rewardly";
  const roleLabel = props.role ? ROLE_LABEL[props.role] : "team member";
  const emailMismatch = props.signedIn && props.invitedEmail && props.viewerEmail &&
    props.invitedEmail.toLowerCase() !== props.viewerEmail.toLowerCase();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border bg-card p-7 shadow-sm"
    >
      <div className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="size-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Join {businessLabel}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You&apos;re invited to help run the loyalty program as <strong className="text-foreground">{roleLabel}</strong>
          {props.storeName ? (
            <>
              {" "}at the <strong className="text-foreground">{props.storeName}</strong> store
            </>
          ) : null}
          .
        </p>
      </div>

      <dl className="mt-5 space-y-2.5 rounded-xl border bg-muted/40 p-4 text-sm">
        {props.invitedEmail && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Invited email</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              <UserRound className="size-3.5 text-muted-foreground" /> {props.invitedEmail}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Role</dt>
          <dd><Badge variant="secondary">{roleLabel}</Badge></dd>
        </div>
        {props.expiresAt && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Valid until</dt>
            <dd className="font-medium tabular">
              {new Date(props.expiresAt).toLocaleString("en-IN", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </dd>
          </div>
        )}
      </dl>

      {emailMismatch ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-600 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              You&apos;re signed in as <strong>{props.viewerEmail}</strong>, but this invitation was sent to{" "}
              <strong>{props.invitedEmail}</strong>. Invitations are single-use and bound to the invited address.
            </span>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(invitePath)}`}>
              Switch account <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      ) : props.signedIn ? (
        <div className="mt-5 space-y-2">
          <Button
            size="lg"
            className="w-full"
            loading={accepting}
            onClick={async () => {
              setAccepting(true);
              try {
                const result = await acceptInvitationAction(token);
                if (result.ok) {
                  toast.success(`Welcome to ${result.data.businessName}!`, {
                    description: `You now have ${ROLE_LABEL[result.data.role] ?? result.data.role} access.`,
                  });
                  router.push(result.data.redirectTo);
                  router.refresh();
                } else {
                  toast.error("Couldn't accept the invitation", { description: result.message });
                }
              } finally {
                setAccepting(false);
              }
            }}
          >
            Accept invitation <ArrowRight className="ml-1 size-4" />
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">
            Accepting grants {roleLabel.toLowerCase()} access to {businessLabel}. The invitation link becomes invalid
            afterwards.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          <Button asChild size="lg" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(invitePath)}`}>
              Sign in to accept <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href={`/signup?next=${encodeURIComponent(invitePath)}`}>Create your free account</Link>
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">
            Use the invited email address — the invitation only works for <strong>{props.invitedEmail ?? "that address"}</strong>.
          </p>
        </div>
      )}
    </motion.div>
  );
}
