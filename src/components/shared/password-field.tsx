"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const passwordChecks = [
  { label: "8+ characters", test: (v: string) => v.length >= 8 },
  { label: "Uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Number", test: (v: string) => /\d/.test(v) },
  { label: "Special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function passwordScore(v: string) {
  return passwordChecks.filter((c) => c.test(v)).length;
}

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordField.displayName = "PasswordField";

export function PasswordStrength({ value }: { value: string }) {
  const score = passwordScore(value);
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const tones = ["bg-muted", "bg-destructive", "bg-warning", "bg-brand-400", "bg-success"];
  if (!value) return null;
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i < score ? tones[score] : "bg-muted")}
          />
        ))}
        <span className="ml-1 w-14 text-right text-[11px] font-medium text-muted-foreground">{labels[score]}</span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {passwordChecks.map((c) => (
          <li
            key={c.label}
            className={cn("text-[11px]", c.test(value) ? "text-success" : "text-muted-foreground")}
          >
            {c.test(value) ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
