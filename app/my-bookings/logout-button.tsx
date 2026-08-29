"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--foreground)]/75 hover:bg-[var(--foreground)]/10"
    >
      Log out
    </button>
  );
}
