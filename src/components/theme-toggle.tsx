"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Cycle: system → light → dark → system
  const next = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  // Until mounted, render a placeholder of identical size so layout doesn't shift.
  const Icon = !mounted
    ? Sun
    : theme === "system"
      ? Monitor
      : (resolvedTheme === "dark" ? Moon : Sun);

  const label = !mounted
    ? "Theme"
    : theme === "system"
      ? "System theme"
      : theme === "dark"
        ? "Dark theme"
        : "Light theme";

  return (
    <button
      onClick={next}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
