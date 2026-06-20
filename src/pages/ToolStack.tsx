import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Impact = "Core" | "High" | "Support";

interface Tool {
  id: string;
  name: string;
  why: string;
  impact: Impact;
  cost: number;
}

const STORAGE_KEY = "tool-stack:v1";

const SEED: Tool[] = [
  { id: "1", name: "GoHighLevel", why: "CRM + automation + client acquisition systems", impact: "Core", cost: 297 },
  { id: "2", name: "Supabase", why: "Database + auth + versioned prompt templates", impact: "Core", cost: 25 },
  { id: "3", name: "n8n", why: "Workflow orchestration layer", impact: "High", cost: 24 },
  { id: "4", name: "Claude (Anthropic)", why: "AI reasoning + content backbone", impact: "Core", cost: 100 },
  { id: "5", name: "Lovable", why: "App build environment", impact: "Core", cost: 25 },
  { id: "6", name: "Meta Ads", why: "Paid acquisition channel", impact: "Core", cost: 0 },
  { id: "7", name: "Zoom + Fathom", why: "Call capture + transcripts", impact: "High", cost: 35 },
  { id: "8", name: "Canva", why: "Design / creative", impact: "Support", cost: 13 },
];

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function ToolStack() {
  const [tools, setTools] = useState<Tool[]>(() => {
    if (typeof window === "undefined") return SEED;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as Tool[];
      }
    } catch {
      // ignore
    }
    return SEED;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    } catch {
      // ignore
    }
  }, [tools]);

  const total = useMemo(
    () => tools.reduce((sum, t) => sum + (Number.isFinite(t.cost) ? t.cost : 0), 0),
    [tools],
  );

  const update = (id: string, patch: Partial<Tool>) =>
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const remove = (id: string) =>
    setTools((prev) => prev.filter((t) => t.id !== id));

  const add = () =>
    setTools((prev) => [
      ...prev,
      { id: newId(), name: "", why: "", impact: "Support", cost: 0 },
    ]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand shadow-glow">
            <Wrench className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-tight">Tool Stack</h1>
            <p className="text-sm text-muted-foreground">
              The tools powering the operation, why they're here, and what they cost.
            </p>
          </div>
        </div>
        <Button onClick={add} className="gap-2">
          <Plus className="h-4 w-4" />
          Add tool
        </Button>
      </header>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[18%]">Tool</TableHead>
              <TableHead>Why I'm using it</TableHead>
              <TableHead className="w-[140px]">Impact</TableHead>
              <TableHead className="w-[140px] text-right">Cost (USD/mo)</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No tools yet. Click "Add tool" to start.
                </TableCell>
              </TableRow>
            ) : (
              tools.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Input
                      value={t.name}
                      onChange={(e) => update(t.id, { name: e.target.value })}
                      placeholder="Tool name"
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={t.why}
                      onChange={(e) => update(t.id, { why: e.target.value })}
                      placeholder="Why this tool"
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.impact}
                      onValueChange={(v: Impact) => update(t.id, { impact: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Core">Core</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Support">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={Number.isFinite(t.cost) ? t.cost : 0}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        update(t.id, { cost: Number.isFinite(n) ? n : 0 });
                      }}
                      className="h-9 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(t.id)}
                      aria-label={`Delete ${t.name || "row"}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                Total monthly cost
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
