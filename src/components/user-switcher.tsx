"use client";

import * as React from "react";
import { UserRound, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { getRepository } from "@/lib/data/repository";
import type { Contact } from "@/lib/data/types";
import { setActiveUser, useActiveUser } from "@/lib/user/activeUser";

const ADD = "__create__";

/** Header widget: pick (or add) who's proving today. Auto-fills "Performed by". */
export function UserSwitcher() {
  const tenant = useCurrentTenant();
  const user = useActiveUser();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [contacts, setContacts] = React.useState<Contact[]>([]);

  const repo = React.useMemo(() => getRepository(tenant.id), [tenant.id]);
  React.useEffect(() => {
    if (!open) return;
    repo.listContacts().then((cs) => setContacts(cs.sort((a, b) => a.name.localeCompare(b.name))));
  }, [open, repo]);

  const trimmed = query.trim();
  const exactExists = contacts.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());

  const choose = (c: Contact) => {
    setActiveUser({ contactId: c.id, name: c.name });
    setQuery("");
    setOpen(false);
  };
  const create = async () => {
    const c = await repo.createContact({ name: trimmed, role: "technician" });
    choose(c);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 font-normal")}
        title="Active user — auto-fills Performed by"
      >
        <UserRound className="h-4 w-4" />
        <span className="max-w-32 truncate">{user ? user.name : "Who's proving?"}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command
          filter={(v, s) => {
            if (v === ADD) return 1;
            const c = contacts.find((x) => x.id === v);
            return (c?.name ?? "").toLowerCase().includes(s.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search or add a name…" value={query} onValueChange={setQuery} />
          <CommandList>
            {!(trimmed && !exactExists) && <CommandEmpty>No people yet — type a name.</CommandEmpty>}
            <CommandGroup>
              {contacts.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => choose(c)}>
                  <Check className={cn("mr-2 h-4 w-4", user?.contactId === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.name}</span>
                  {c.role ? (
                    <span className="ml-auto text-xs text-muted-foreground">{c.role.replace(/_/g, " ")}</span>
                  ) : null}
                </CommandItem>
              ))}
              {trimmed && !exactExists && (
                <CommandItem value={ADD} onSelect={create} className="text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="truncate">Add “{trimmed}”</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
