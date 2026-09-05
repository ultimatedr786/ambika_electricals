import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 proxy (the replacement for middleware.ts) — Stage E.1/E.3/E.6.
 *
 * Jobs on every request:
 *  1. Forward the exact pathname as an `x-pathname` request header so route
 *     layouts can preserve the precise return-to destination after sign-in.
 *  2. Refresh the Supabase auth session and keep the SSR cookies in sync, so
 *     server components never read a stale/expired session and navigation
 *     never loops between the proxy and layouts.
 *  3. Gate the protected route groups (/customer/*, /business/* except the
 *     public business signup) — anonymous visitors are redirected to /login
 *     with the destination preserved in `next`.
 *
 * Demo mode: when the Supabase env values are absent the proxy only does (1)
 * and the Phase 1 mock app behaves exactly as before. Role-level
 * authorization (customer vs owner/manager/staff) is enforced in the route
 * layouts and again by RLS — the proxy owns "is there a session at all".
 */

const PROTECTED_PREFIXES = ["/customer", "/business"];
const PUBLIC_PATHS = ["/business/signup"];

function isProtected(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", `${pathname}${search}`);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    // Demo mode — no real auth configured; never enforce protection.
    return supabaseResponse;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do NOT inline or remove: getUser() performs the session refresh that
  // writes new cookies through setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Preserve the exact destination; /login validates it with safeReturnTo
    // before using it (open-redirect defense lives there, not here).
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  // Everything except static assets and Next internals.
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon.svg|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|ico|css|map)$).*)",
  ],
};
