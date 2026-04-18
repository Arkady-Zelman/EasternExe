"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, ...props }, ref) => {
    const pct = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
          className
        )}
        {...props}
      >
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
