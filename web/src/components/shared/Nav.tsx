"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { motion } from "framer-motion";

const TOP_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/simulator", label: "Simulator" },
];

const BOTTOM_TABS = [
  {
    href: "/",
    label: "Home",
    exact: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: "/receive",
    label: "Receive",
    exact: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="9" y1="22" x2="15" y2="22" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    exact: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
] as const;

function isTabActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar - logo always visible; links hidden on mobile */}
      <nav className="sticky top-0 z-10 flex items-center gap-1 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-surface/70">
        <Link href="/" className="mr-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            ArgusAI
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {TOP_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-2.5 py-1 text-sm transition-colors",
                  active
                    ? "bg-surface-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom tab bar - mobile only */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-10 flex md:hidden border-t border-border bg-surface/80 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {BOTTOM_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href, tab.exact);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors"
            >
              {active && (
                <motion.span
                  layoutId="bottom-tab-indicator"
                  className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span
                className={clsx(
                  "transition-colors",
                  active ? "text-accent" : "text-muted-foreground"
                )}
              >
                {tab.icon}
              </span>
              <span
                className={clsx(
                  "text-[10px] font-medium leading-none transition-colors",
                  active ? "text-accent" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
