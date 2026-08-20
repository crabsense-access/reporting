import { cn } from "@/lib/utils";

interface CohortGridProps {
  cohortLabels: string[];
  weekLabels: string[];
  matrix: number[][];
}

function cellColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const alpha = 0.08 + (clamped / 100) * 0.85;
  return `hsl(243 75% 59% / ${alpha})`;
}

export function CohortGrid({ cohortLabels, weekLabels, matrix }: CohortGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-normal text-muted-foreground">Cohorte</th>
            {weekLabels.map((week) => (
              <th key={week} className="px-2 text-center text-[11px] font-normal text-muted-foreground">
                {week}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={cohortLabels[i]}>
              <td className="whitespace-nowrap pr-2 text-sm text-foreground">{cohortLabels[i]}</td>
              {row.map((value, j) => (
                <td
                  key={j}
                  className={cn(
                    "rounded-md py-1.5 text-center tabular-nums",
                    value > 55 ? "text-white" : "text-foreground"
                  )}
                  style={{ backgroundColor: cellColor(value) }}
                >
                  {value.toFixed(0)}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
