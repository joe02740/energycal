"use client";

import { useEffect, useState } from "react";
import {
  Plug,
  Play,
  Square,
  RefreshCw,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPiuController, type PiuStatus } from "@/lib/piu/controller";
import type { Prover } from "@/lib/data/types";

const STATUS_LABEL: Record<PiuStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting…",
  connected: "Connected",
  running: "Running",
  aborting: "Aborting…",
  error: "Error",
};

const STATUS_COLOR: Record<PiuStatus, string> = {
  disconnected: "bg-muted-foreground/40",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500",
  running: "bg-emerald-500 animate-pulse",
  aborting: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
};

export function PiuControlPanel({ prover }: { prover: Prover | null }) {
  const [status, setStatus] = useState<PiuStatus>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = getPiuController();
    setStatus(ctrl.status);
    return ctrl.onStatus(setStatus);
  }, []);

  const v0NotImplemented = (action: string) => {
    setErrorMsg(
      `${action} requires a connected PIU. v0 is manual entry; v1 will wire ${prover?.piuCommType ?? "the PIU"} via Web Serial.`,
    );
  };

  const onConnect = async () => {
    setErrorMsg(null);
    try {
      await getPiuController().connect();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Connect failed");
    }
  };

  const onAutoRun = () => v0NotImplemented("Auto Run");
  const onAbort = () => v0NotImplemented("Abort");
  const onAnalogConfig = () => v0NotImplemented("Analog Config");

  const onRecalculate = () => {
    // The live calc panel already recalculates on every change. This button
    // is here to mirror PROVEit; it just clears any transient warning.
    setErrorMsg(null);
  };

  const piuDescription = prover
    ? `${prover.piuCommType ?? "PIU"} · ${prover.tag}`
    : "No prover selected";

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[status])}
            aria-hidden
          />
          <span className="font-medium">{STATUS_LABEL[status]}</span>
          <span className="text-muted-foreground">· {piuDescription}</span>
        </div>
        <Badge variant="secondary" className="font-normal">v1 hardware integration</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <ControlButton
          icon={Plug}
          label={status === "connected" || status === "running" ? "Disconnect" : "Connect"}
          onClick={onConnect}
          disabled={status === "connecting" || status === "aborting"}
        />
        <ControlButton
          icon={Play}
          label="Auto Run"
          variant="default"
          onClick={onAutoRun}
          disabled={status !== "connected"}
        />
        <ControlButton
          icon={Square}
          label="Abort"
          variant="destructive"
          onClick={onAbort}
          disabled={status !== "running"}
        />
        <ControlButton
          icon={RefreshCw}
          label="Recalculate"
          onClick={onRecalculate}
        />
        <ControlButton
          icon={SlidersHorizontal}
          label="Analog Config"
          onClick={onAnalogConfig}
          disabled={status !== "connected"}
        />
        {/* Reserved slots for upcoming controls */}
        <ControlButton icon={Wrench} label="Diagnostics" disabled placeholder />
        <ControlButton icon={Wrench} label="Calibrate" disabled placeholder />
      </div>
      {errorMsg && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{errorMsg}</p>
      )}
    </div>
  );
}

function ControlButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = "secondary",
  placeholder,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "secondary" | "destructive";
  placeholder?: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant={variant}
      size="sm"
      title={placeholder ? "Reserved — coming with hardware integration" : label}
      className={cn(placeholder && "opacity-50")}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
