"use client";

import { useEffect, useState } from "react";
import { HubList } from "@/components/Hub";
import { ADMIN_NAV, NAV_ACCOUNT } from "@/components/nav";
import { MarketIndicators } from "@/components/Shell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api, PageHeader } from "@/components/ui";

type StatusUser = { username: string; isAdmin: boolean; firstName: string };

/** Pe telefon, tab-ul „Eu” din bara de jos: profilul, setările, tema, cursul euro și ieșirea din cont. */
export default function MePage() {
  const [user, setUser] = useState<StatusUser | null>(null);
  useEffect(() => {
    api<{ user: StatusUser | null }>("/api/auth/status")
      .then((r) => setUser(r.user))
      .catch(() => undefined);
  }, []);

  const logout = async () => {
    try {
      await api("/api/auth/logout", "POST");
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <>
      <PageHeader title={user ? `Salut, ${user.firstName || user.username}` : "Eu"} />
      <HubList items={[...NAV_ACCOUNT, ...(user?.isAdmin ? [ADMIN_NAV] : [])]} />
      <section className="mb-5 flex flex-col gap-2">
        <div className="flex min-h-[52px] items-center justify-between rounded-md border border-line bg-sheet px-3.5 text-[15px] text-ink">
          <span>Tema aplicației</span>
          <ThemeToggle />
        </div>
        <MarketIndicators />
      </section>
      {user && (
        <button onClick={logout} className="btn-danger w-full border border-rosu/30 py-3">
          Ieșire din cont ({user.username})
        </button>
      )}
    </>
  );
}
