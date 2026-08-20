import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const sidebarBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold leading-none",
  {
    variants: {
      variant: {
        positive: "bg-emerald-200 text-emerald-800",
        negative: "bg-red-200 text-red-800",
        neutral: "bg-neutral-300 text-neutral-700",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface SidebarBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof sidebarBadgeVariants> {
  count: number;
}

export function SidebarBadge({ count, variant, className, ...props }: SidebarBadgeProps) {
  return (
    <span className={cn(sidebarBadgeVariants({ variant }), className)} {...props}>
      {count}
    </span>
  );
}
