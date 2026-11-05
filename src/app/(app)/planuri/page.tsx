"use client";

import { HubList } from "@/components/Hub";
import { NAV_PLAN, NAV_TOOLS } from "@/components/nav";
import { PageHeader } from "@/components/ui";

/** Pe telefon, tab-ul „Planuri” din bara de jos: toate instrumentele de planificare, într-o singură listă. */
export default function PlansPage() {
  return (
    <>
      <PageHeader title="Planuri" />
      <HubList items={NAV_PLAN} />
      <HubList title="Unelte" items={NAV_TOOLS} />
    </>
  );
}
