"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/simulator", label: "Simulator" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-surface/70">
      <Link href="/" className="mr-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
          A
        </span>
        <span className="text-sm font-semibold tracking-tight text-foreground">ArgusAI</span>
      </Link>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "rounded-md px-2.5 py-1 text-sm transition-colors",
              active ? "bg-surface-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
