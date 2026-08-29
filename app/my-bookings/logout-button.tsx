"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ redirectTo: "/" })}
      className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/10"
    >
      Log out
    </button>
  );
}
