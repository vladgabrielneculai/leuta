"use client";

import { HubList } from "@/components/Hub";
import { BETA_NAV, NAV_PLAN } from "@/components/nav";
import { PageHeader, useApp } from "@/components/ui";

/** Pe telefon, tab-ul „Planuri” din bara de jos: toate instrumentele de planificare, într-o singură listă. */
export default function PlansPage() {
  const { beta } = useApp();
  return (
    <>
      <PageHeader title="Planuri" />
      <HubList items={NAV_PLAN} />
      {beta && <HubList title="Unelte noi (beta)" items={BETA_NAV} />}
    </>
  );
}
