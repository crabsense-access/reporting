import type { ReactNode } from "react";

import { BreadcrumbTitle } from "@/components/mockup/BreadcrumbTitle";
import { EntityRail, type EntityRailSubitemKey } from "@/components/mockup/EntityRail";
import { MockupBanner } from "@/components/mockup/MockupBanner";
import { MockupSidebar, type MockupNavGroup } from "@/components/mockup/MockupSidebar";

interface MockupPageShellProps {
  title: string;
  groups: MockupNavGroup[];
  activeSubitemKey: EntityRailSubitemKey;
  children: ReactNode;
}

export function MockupPageShell({ title, groups, activeSubitemKey, children }: MockupPageShellProps) {
  return (
    <div className="min-h-screen bg-neutral-200">
      <MockupBanner />
      <EntityRail activeSubitemKey={activeSubitemKey} />
      <MockupSidebar groups={groups} />
      <main className="ml-[32rem] min-h-screen bg-neutral-100 px-8 pb-8 pt-16">
        <BreadcrumbTitle parent="Analítica" current={title} />
        <div className="mt-8 flex flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}
