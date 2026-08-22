"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

/**
 * Mobile-first app shell: the Sidebar (a server component, passed in as
 * `sidebar`) is rendered off-canvas as a slide-in drawer below the `md`
 * breakpoint, opened via a hamburger button in a small top bar, and shown
 * as the normal persistent left column at `md` and up — same as before
 * this component existed.
 *
 * Sidebar/children stay server components; this wrapper only owns the
 * open/closed state and the responsive positioning classes, so none of
 * the data fetching in Sidebar needs to move to the client.
 */
export function MobileNavShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Tapping a nav link inside the drawer navigates (changing the
  // pathname) — close the drawer when that happens rather than requiring
  // a separate tap on the backdrop.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Keep the page from scrolling behind an open drawer on mobile.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200 bg-neutral-0 p-200 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-1 rounded p-1.5 text-neutral-600 hover:bg-neutral-100"
        >
          <Icon name="menu" label="Open menu" />
        </button>
        <span className="text-h3 text-neutral-800">Budget App</span>
      </header>

      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-neutral-800/40 md:hidden"
        />
      )}

      <div
        className={
          "fixed inset-y-0 left-0 z-40 overflow-y-auto bg-neutral-0 shadow-xl transition-transform duration-200 ease-in-out " +
          "md:static md:z-auto md:translate-x-0 md:shadow-none " +
          (open ? "translate-x-0" : "-translate-x-full")
        }
      >
        {sidebar}
      </div>

      <main className="min-w-0 flex-1 p-200 md:p-400">{children}</main>
    </div>
  );
}
