import Link from "next/link";

export function Nav() {
  return (
    <nav className="flex items-center gap-4 border-b border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
      <Link href="/" className="font-semibold text-zinc-900 dark:text-zinc-100">
        ArgusAI
      </Link>
      <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        Dashboard
      </Link>
      <Link href="/simulator" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        Simulator
      </Link>
    </nav>
  );
}
