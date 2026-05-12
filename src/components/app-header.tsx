import Link from "next/link";
import { Gauge } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { TenantSwitcher } from "./tenant-switcher";
import { BackButton } from "./back-button";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-6">
        <div className="flex min-w-0 items-center gap-1">
          <BackButton />
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Gauge className="h-4 w-4 text-primary" />
            Energy Cal
          </Link>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/proving/new"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            New proving
          </Link>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <Link
            href="/import"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Import
          </Link>
          <span className="mx-1 text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/60">History</span>
          <div className="ml-2 flex items-center gap-1">
            <TenantSwitcher />
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}
