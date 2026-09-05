import { headers } from "next/headers";
import { BusinessShell } from "@/components/business/business-shell";
import { guardBusinessArea, getViewer, primaryBusinessRole } from "@/lib/auth/session";

export default async function BusinessAppLayout({ children }: { children: React.ReactNode }) {
  // Stage E.3/E.4 — business area requires a real session with an active
  // owner/manager/staff membership (completing a fresh business signup via
  // the audited RPC when needed). No-op in Demo mode.
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "/business/dashboard";
  await guardBusinessArea(pathname);
  const viewer = await getViewer();
  const liveRole = primaryBusinessRole(viewer);

  return <BusinessShell liveRole={liveRole}>{children}</BusinessShell>;
}
