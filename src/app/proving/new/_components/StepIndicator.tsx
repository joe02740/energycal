"use client";

import { cn } from "@/lib/utils";

interface Step {
  title: string;
  description: string;
}

export function StepIndicator({
  steps,
  current,
  onStepClick,
}: {
  steps: Step[];
  current: number;
  onStepClick: (n: number) => void;
}) {
  return (
    <ol className="flex w-full items-center gap-2">
      {steps.map((s, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <li key={i} className="flex-1">
            <button
              onClick={() => onStepClick(i)}
              className={cn(
                "flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors",
                active && "border-primary bg-primary/10",
                done && "border-muted bg-muted/50",
                !active && !done && "border-border hover:bg-muted/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-muted text-foreground",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{s.title}</span>
              </div>
              <span className="mt-0.5 text-xs text-muted-foreground">{s.description}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
