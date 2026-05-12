"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { ProvingRecord } from "@/lib/data/types";

interface MfHistoryChartProps {
  provings: ProvingRecord[];
  meterIds?: string[];
  meterTags?: Record<string, string>;
  height?: number;
  /** Where the "perfect" reference line sits. Default 1.0. */
  referenceMf?: number;
  /** Extra tolerance band lines. */
  tolerance?: number; // e.g. 0.0005 for ±0.05%
}

const COLORS = [
  "var(--primary)",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

export function MfHistoryChart({
  provings,
  meterIds,
  meterTags,
  height = 280,
  referenceMf = 1.0,
  tolerance,
}: MfHistoryChartProps) {
  // Build meter list: explicit meterIds or auto from data
  const ids = meterIds ?? Array.from(new Set(provings.map((p) => p.meterId)));

  // Pivot: each x-tick is a date; each meter is a series.
  // Recharts LineChart expects array of objects with the date + per-meter MF keys.
  const allDates = Array.from(
    new Set(provings.filter((p) => p.mf != null).map((p) => p.datePerformed)),
  ).sort();

  const data = allDates.map((d) => {
    const point: Record<string, number | string | null> = { date: d.slice(0, 10) };
    for (const id of ids) {
      const match = provings.find(
        (p) => p.datePerformed === d && p.meterId === id && p.mf != null,
      );
      point[id] = match?.mf ?? null;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="date"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={["auto", "auto"]}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v) => Number(v).toFixed(4)}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
          formatter={(v, name) => {
            const num = typeof v === "number" ? v : Number(v);
            const display = Number.isFinite(num) ? num.toFixed(5) : "—";
            const label = typeof name === "string" ? (meterTags?.[name] ?? name) : String(name);
            return [display, label];
          }}
        />
        <ReferenceLine
          y={referenceMf}
          stroke="currentColor"
          strokeDasharray="4 4"
          opacity={0.4}
          label={{ value: "1.0000", position: "right", fontSize: 10 }}
        />
        {tolerance && (
          <>
            <ReferenceLine
              y={referenceMf + tolerance}
              stroke="currentColor"
              strokeDasharray="2 4"
              opacity={0.2}
            />
            <ReferenceLine
              y={referenceMf - tolerance}
              stroke="currentColor"
              strokeDasharray="2 4"
              opacity={0.2}
            />
          </>
        )}
        {ids.length > 1 && (
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(name: string) => meterTags?.[name] ?? name}
          />
        )}
        {ids.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
            name={id}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
