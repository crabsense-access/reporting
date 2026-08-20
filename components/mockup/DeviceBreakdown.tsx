import { formatPercent } from "@/lib/format";

interface DeviceBreakdownGroup {
  title: string;
  items: { label: string; pct: number }[];
}

interface DeviceBreakdownProps {
  groups: DeviceBreakdownGroup[];
}

export function DeviceBreakdown({ groups }: DeviceBreakdownProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((group) => (
        <div key={group.title} className="rounded-xl bg-neutral-50 p-4">
          <div className="mb-2 text-sm font-medium text-neutral-500">{group.title}</div>
          <div className="flex flex-col gap-2">
            {group.items.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-28 shrink-0 truncate text-xs text-neutral-700" title={item.label}>
                  {item.label}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-neutral-900" style={{ width: `${item.pct * 100}%` }} />
                </div>
                <div className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-500">
                  {formatPercent(item.pct)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
