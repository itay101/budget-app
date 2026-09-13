import { Sidebar } from "@/components/Sidebar";
import { MobileNavShell } from "@/components/MobileNavShell";

/**
 * Layout for every authenticated app page (budget, accounts, ...) — a
 * route group (`(app)`, no effect on the URL) rather than the root
 * layout, specifically so it does *not* wrap /sign-in or /auth/callback.
 * Sidebar calls getCurrentBudget() -> getCurrentUser(), which redirects
 * to /sign-in when signed out; if this rendered on /sign-in too, a
 * signed-out visitor would never be able to reach it at all (the root
 * layout wrapping /sign-in with a redirecting Sidebar is exactly what
 * caused the redirect loop this route group fixes).
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileNavShell sidebar={<Sidebar />}>{children}</MobileNavShell>;
}
