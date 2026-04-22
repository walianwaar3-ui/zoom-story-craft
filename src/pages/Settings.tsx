import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  Webhook,
  Link2,
  Lock,
  Unlock,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

const FUNCTIONS_BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1`
  : `https://${PROJECT_ID}.supabase.co/functions/v1`;

const WEBHOOKS = [
  {
    id: "zoom",
    name: "Zoom",
    description: "Triggers when a Zoom Cloud Recording finishes processing.",
    url: `${FUNCTIONS_BASE}/zoom-webhook`,
    events: ["recording.completed", "recording.transcript_completed"],
    setupHint:
      "Add this URL in Zoom Marketplace → Your App → Feature → Event Subscriptions. Subscribe to the events listed below.",
  },
  {
    id: "fathom",
    name: "Fathom",
    description: "Triggers when a Fathom meeting summary/transcript is ready.",
    url: `${FUNCTIONS_BASE}/fathom-meetings`,
    events: ["meeting.ended", "transcript.ready"],
    setupHint:
      "Add this URL in Fathom → Settings → Integrations → Webhooks (or use the in-app 'Import from Fathom' flow which auto-registers it).",
  },
];

const Settings = () => {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unlockedId, setUnlockedId] = useState<string | null>(null);

  const maskUrl = (url: string) => {
    try {
      const u = new URL(url);
      return `${u.origin}/${"•".repeat(Math.min(24, u.pathname.length - 1))}`;
    } catch {
      return "•".repeat(40);
    }
  };

  const toggleLock = (id: string) => {
    setUnlockedId((prev) => (prev === id ? null : id));
  };

  const ghlQuery = useQuery({
    queryKey: ["ghl-connection-check"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ghl-social", {
        body: { action: "accounts" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const accounts =
        data?.results?.accounts ||
        data?.accounts ||
        data?.social_media_accounts ||
        data ||
        [];
      const list = Array.isArray(accounts)
        ? accounts.filter((a: any) => !a.deleted && !a.isExpired)
        : [];
      return { connected: true, accountCount: list.length };
    },
    retry: false,
  });

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Settings
        </h2>
        <p className="text-muted-foreground mt-1">
          Manage integrations and webhook endpoints.
        </p>
      </div>

      {/* GHL Connection */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                GoHighLevel Connection
              </CardTitle>
              <CardDescription>
                Used to publish posts to your GHL Social Planner.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => ghlQuery.refetch()}
              disabled={ghlQuery.isFetching}
            >
              {ghlQuery.isFetching ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Test connection
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ghlQuery.isLoading || ghlQuery.isFetching ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking connection...
            </div>
          ) : ghlQuery.isError ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  Not connected
                </p>
                <p className="text-xs text-muted-foreground">
                  {(ghlQuery.error as Error)?.message ||
                    "Unable to reach GoHighLevel. Check that GHL_API_KEY and GHL_LOCATION_ID are configured."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Connected</p>
                  <Badge variant="secondary" className="text-xs">
                    {ghlQuery.data?.accountCount || 0} social account
                    {ghlQuery.data?.accountCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  GoHighLevel API is reachable and credentials are valid.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Trigger Events */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Webhook Trigger Events
          </CardTitle>
          <CardDescription>
            Paste these URLs into Zoom and Fathom to auto-generate posts when new meetings finish.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {WEBHOOKS.map((wh) => (
            <div key={wh.id} className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold">{wh.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {wh.description}
                  </p>
                </div>
                <Badge variant="outline">{wh.events.length} events</Badge>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1.5">
                  Webhook URL
                  {unlockedId !== wh.id && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      <Lock className="h-2.5 w-2.5 mr-0.5" />
                      Locked
                    </Badge>
                  )}
                </label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={unlockedId === wh.id ? wh.url : maskUrl(wh.url)}
                    className="font-mono text-xs"
                    onClick={(e) => {
                      if (unlockedId === wh.id) {
                        (e.target as HTMLInputElement).select();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleLock(wh.id)}
                    title={unlockedId === wh.id ? "Lock URL" : "Unlock URL"}
                  >
                    {unlockedId === wh.id ? (
                      <Unlock className="h-4 w-4" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(wh.url, `${wh.id}-url`)}
                    disabled={unlockedId !== wh.id}
                    title={unlockedId !== wh.id ? "Unlock to copy" : "Copy URL"}
                  >
                    {copiedId === `${wh.id}-url` ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {unlockedId !== wh.id && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Click the lock to reveal and copy this URL.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Trigger Events
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {wh.events.map((evt) => (
                    <button
                      key={evt}
                      onClick={() => copy(evt, `${wh.id}-${evt}`)}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs font-mono hover:bg-muted transition-colors"
                    >
                      {evt}
                      {copiedId === `${wh.id}-${evt}` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/30 rounded-md p-2.5 border">
                💡 {wh.setupHint}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
