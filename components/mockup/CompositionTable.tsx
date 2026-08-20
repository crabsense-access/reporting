import { formatNumber, formatPercent } from "@/lib/format";
import type { MockShareItem } from "@/lib/mock/generateMockData";

interface CompositionTableProps {
  items: MockShareItem[];
  valueFormatter?: (value: number) => string;
}

export function CompositionTable({ items, valueFormatter = formatNumber }: CompositionTableProps) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-sm text-foreground" title={item.label}>
            {item.label}
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
            {valueFormatter(item.value)}
          </div>
          <div className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatPercent(item.pct)}
          </div>
        </div>
      ))}
    </div>
  );
}
