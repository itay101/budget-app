"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/budget", label: "Budget" },
  { href: "/accounts", label: "Accounts" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-neutral-200 bg-neutral-0 p-200">
      <div className="mb-300 text-h3 text-neutral-800">Budget App</div>
      <ul className="space-y-1">
        {links.map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={
                  "block rounded px-3 py-2 text-body font-medium " +
                  (active
                    ? "bg-brand-700/10 text-brand-700"
                    : "text-neutral-600 hover:bg-neutral-100")
                }
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
