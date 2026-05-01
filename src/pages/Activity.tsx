import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Activity as ActivityIcon, ChevronDown, Copy, Trash2, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FEATURE_LABELS, type ActivityFeature } from "@/lib/activityLog";

type ActivityRow = {
  id: string;
  feature: ActivityFeature | string;
  label: string | null;
  inputs: Record<string, unknown>;
  content_id: string | null;
  transcript_id: string | null;
  created_at: string;
};

const FEATURE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All features" },
  ...Object.entries(FEATURE_LABELS).map(([value, label]) => ({ value, label })),
];

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

const Activity = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [feature, setFeature] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as ActivityRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("activity_log").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast({ title: "Activity deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let rows = data || [];
    if (feature !== "all") rows = rows.filter((r) => r.feature === feature);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const inputStr = JSON.stringify(r.inputs || {}).toLowerCase();
        return (
          (r.label || "").toLowerCase().includes(s) ||
          inputStr.includes(s) ||
          (r.feature || "").toLowerCase().includes(s)
        );
      });
    }
    return rows;
  }, [data, feature, search]);

  // Group by feature for the segmented view
  const grouped = useMemo(() => {
    const groups: Record<string, ActivityRow[]> = {};
    for (const row of filtered) {
      const key = row.feature || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return groups;
  }, [filtered]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-brand shadow-glow">
          <ActivityIcon className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-2xl tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Every prompt and input you've sent — segmented by feature so you can reuse anything later.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts, captions, hooks…"
            className="pl-9"
          />
        </div>
        <Select value={feature} onValueChange={setFeature}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEATURE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No activity yet. Generate or regenerate a post to start building your prompt history.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([featKey, rows]) => (
            <section key={featKey} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {FEATURE_LABELS[featKey as ActivityFeature] || featKey}
                </h2>
                <Badge variant="secondary" className="h-5 text-[11px]">
                  {rows.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {rows.map((row) => (
                  <Collapsible key={row.id} className="group">
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger className="w-full text-left">
                        <div className="flex items-start justify-between gap-3 p-4 hover:bg-muted/40 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {row.label || "(no label)"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(row.created_at)}
                            </p>
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 mt-1 shrink-0" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                          {Object.entries(row.inputs || {}).map(([k, v]) => {
                            const value =
                              typeof v === "string" ? v : JSON.stringify(v, null, 2);
                            return (
                              <div key={k} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                                    {k}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => copy(value)}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    Copy
                                  </Button>
                                </div>
                                <pre className="text-xs whitespace-pre-wrap break-words bg-background border rounded-md p-2 font-mono leading-relaxed">
                                  {value || "(empty)"}
                                </pre>
                              </div>
                            );
                          })}

                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default Activity;
