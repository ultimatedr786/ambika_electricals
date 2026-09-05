import { headers } from "next/headers";
import { CustomerShell } from "@/components/customer/customer-shell";
import { guardCustomerArea } from "@/lib/auth/session";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  // Stage E.3 — customer area requires a real session when Supabase is
  // configured; a no-op in Demo mode so the Phase 1 journey is untouched.
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "/customer/dashboard";
  await guardCustomerArea(pathname);

  return <CustomerShell>{children}</CustomerShell>;
}
