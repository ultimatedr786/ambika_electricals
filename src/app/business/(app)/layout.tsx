import { BusinessShell } from "@/components/business/business-shell";

export default function BusinessAppLayout({ children }: { children: React.ReactNode }) {
  return <BusinessShell>{children}</BusinessShell>;
}
