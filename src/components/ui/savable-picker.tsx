"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

export interface PickerOption {
  value: string; // stable id
  label: string;
  hint?: string;
  searchText?: string;
}

const ADD = "__create__";

/**
 * Combobox that can also create. Pick an existing option to autofill, or type a
 * new name and choose "Add" to persist it to the roster and select it. The typed
 * query is passed to onCreate, which returns the new option id (or null).
 */
export function SavablePicker({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches.",
  addLabel = (q) => `Add “${q}”`,
  disabled,
  className,
}: {
  options: PickerOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCreate?: (label: string) => Promise<string | null> | string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  addLabel?: (query: string) => string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);

  const trimmed = query.trim();
  const exactExists = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const showAdd = !!onCreate && trimmed.length > 0 && !exactExists;

  const handleCreate = async () => {
    if (!onCreate) return;
    const id = await onCreate(trimmed);
    if (id) onChange(id);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between font-normal",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,28rem)] p-0" align="start">
        <Command
          filter={(v, s) => {
            if (v === ADD) return 1; // never filter out the add row
            const opt = options.find((o) => o.value === v);
            const hay = (opt?.searchText ?? opt?.label ?? "").toLowerCase();
            return hay.includes(s.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {!showAdd && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value === value ? null : o.value);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate">{o.label}</span>
                    {o.hint ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
                  </div>
                </CommandItem>
              ))}
              {showAdd && (
                <CommandItem value={ADD} onSelect={handleCreate} className="text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="truncate">{addLabel(trimmed)}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
