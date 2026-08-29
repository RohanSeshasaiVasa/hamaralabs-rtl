"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function Navbar() {
  const pathname = usePathname();
  const linkClasses = (href: string) =>
    clsx(
      "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
      pathname === href
        ? "bg-[var(--foreground)] text-[var(--background)]"
        : "text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/10"
    );

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--foreground)]/10 bg-[color:color-mix(in_oklab,var(--background),transparent_0%)]/70 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Hamaralabs
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/" className={linkClasses("/")}>
            Home
          </Link>
          <Link href="/buy" className={linkClasses("/buy")}>
            Buy
          </Link>
          <Link href="/login" className={linkClasses("/login")}>
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}