import type { ReactNode } from "react";

interface SectionCardProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function SectionCard({ id, title, description, children }: SectionCardProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </section>
  );
}
