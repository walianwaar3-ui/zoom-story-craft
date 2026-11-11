import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Megaphone,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Unlink,
  Send,
  ExternalLink,
  BarChart3,
  Bot,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ConnectionStatus = {
  connected: boolean;
  ad_account_id?: string;
  ad_account_name?: string;
  business_name?: string;
  page_name?: string;
  currency?: string;
  connected_at?: string;
  last_checked_at?: string;
  error?: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

type AdDraft = {
  id: string;
  name: string;
  objective: string;
  daily_budget: number;
  currency: string | null;
  status: string;
  campaign_id: string | null;
  review_url: string | null;
  failure_reason: string | null;
  created_at: string;
};

type Report = {
  window_days: number;
  spend: number;
  currency: string | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  link_clicks: number;
  impressions: number;
  reach: number;
  leads: number | null;
  video_views: number | null;
};

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^https?:\/\//.test(part)) {
      const clean = part.replace(/[)\].,]+$/, "");
      return (
        <a key={i} href={clean} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">
          {clean}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const objectiveLabel: Record<string, string> = {
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_AWARENESS: "Awareness",
};

const MetaAds = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tokenInput, setTokenInput] = useState("");
  const [accountInput, setAccountInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachedPostId, setAttachedPostId] = useState<string>("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportDays, setReportDays] = useState("30");
  const scrollRef = useRef<HTMLDivElement>(null);

  const statusQuery = useQuery({
    queryKey: ["meta-connection-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-connect", { body: { action: "status" } });
      if (error) throw error;
      return data as ConnectionStatus;
    },
  });

  const adsQuery = useQuery({
    queryKey: ["meta-ad-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ad_drafts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as AdDraft[];
    },
    enabled: !!statusQuery.data?.connected,
  });

  const postsQuery = useQuery({
    queryKey: ["recent-posts-for-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_content")
        .select("id, caption, image_url, created_at")
        .not("caption", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!statusQuery.data?.connected,
  });

  const connected = !!statusQuery.data?.connected;

  const loadReport = async (days: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads-agent", {
        body: { action: "report", days: Number(days) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReport(data.report as Report);
    } catch (e) {
      toast({ title: "Couldn't load report", description: (e as Error).message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (connected) loadReport(reportDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-connect", {
        body: { action: "connect", access_token: tokenInput, ad_account_id: accountInput },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ConnectionStatus;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["meta-connection-status"], data);
      setTokenInput("");
      setAccountInput("");
      toast({ title: "Connected", description: data.ad_account_name || data.ad_account_id });
    },
    onError: (e: Error) => toast({ title: "Connection failed", description: e.message, variant: "destructive" }),
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("meta-connect", { body: { action: "check" } });
      if (error) throw error;
      return data as ConnectionStatus;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["meta-connection-status"], data);
      if (data.error) toast({ title: "Connection issue", description: data.error, variant: "destructive" });
      else toast({ title: "Connection is healthy" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("meta-connect", { body: { action: "disconnect" } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(["meta-connection-status"], { connected: false });
      setMessages([]);
      setReport(null);
      toast({ title: "Disconnected" });
    },
  });

  const attachedPost = useMemo(
    () => postsQuery.data?.find((p) => p.id === attachedPostId) || null,
    [postsQuery.data, attachedPostId],
  );

  const sendMutation = useMutation({
    mutationFn: async (nextMessages: ChatMessage[]) => {
      const { data, error } = await supabase.functions.invoke("meta-ads-agent", {
        body: {
          messages: nextMessages,
          post: attachedPost ? { caption: attachedPost.caption, image_url: attachedPost.image_url } : null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { reply: string; ads: AdDraft[]; report?: Report | null };
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      if (data.ads) queryClient.setQueryData(["meta-ad-drafts"], data.ads);
      if (data.report) setReport(data.report);
    },
    onError: (e: Error) => {
      toast({ title: "Assistant error", description: e.message, variant: "destructive" });
      setMessages((prev) => [...prev, { role: "assistant", content: `Something went wrong: ${e.message}` }]);
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    sendMutation.mutate(next);
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <header className="page-header">
        <div>
          <p className="eyebrow mb-3">Workspace</p>
          <h1 className="page-title">Meta Ads</h1>
          <p className="page-subtitle">Turn your best-performing content into Meta (Facebook &amp; Instagram) ad campaigns.</p>
        </div>
      </header>

      {/* Connection */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                Meta ad account
              </CardTitle>
              <CardDescription>
                Connect the Business Manager system user that owns your ad account. The ads agent uses it to read your
                campaigns and create new ones — always paused, so nothing spends until you activate it.
              </CardDescription>
            </div>
            {connected ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <XCircle className="h-3 w-3" />
                Not connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking connection...
            </div>
          ) : connected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Ad account</p>
                  <p className="font-medium">{statusQuery.data?.ad_account_name || statusQuery.data?.ad_account_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Publishing as</p>
                  <p className="font-medium">{statusQuery.data?.page_name || "No Page linked"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Business</p>
                  <p className="font-medium">{statusQuery.data?.business_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last checked</p>
                  <p className="font-medium">
                    {statusQuery.data?.last_checked_at ? new Date(statusQuery.data.last_checked_at).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
              {statusQuery.data?.error && (
                <p className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-md p-2.5">
                  {statusQuery.data.error}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
                  {checkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Check connection
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">System User access token</label>
                  <Input
                    type="password"
                    placeholder="EAAG..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ad account ID</label>
                  <Input
                    placeholder="act_1234567890 or 1234567890"
                    value={accountInput}
                    onChange={(e) => setAccountInput(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={!tokenInput || !accountInput || connectMutation.isPending}
              >
                {connectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Connect
              </Button>
              <p className="text-xs text-muted-foreground bg-muted/30 border rounded-md p-2.5">
                A System User token needs no App Review since it only touches your own business's assets. If ad creation
                fails with "Development mode" errors, switch your Meta app to Live in App Review, or add this business as
                a tester.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {connected && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chat */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Ads assistant
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
                    New chat
                  </Button>
                </div>
                <CardDescription>Every ad it creates is paused — nothing can spend until you activate it.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 flex-1">
                <div ref={scrollRef} className="h-80 overflow-y-auto rounded-md border bg-muted/20 p-3">
                  {messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">
                      Ask for a campaign — e.g. "Build a traffic ad from my latest roofer post, $5/day, USA."
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((m, i) => (
                        <div
                          key={i}
                          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                            m.role === "user" ? "bg-primary text-primary-foreground ml-8" : "bg-background border mr-8"
                          }`}
                        >
                          {renderInline(m.content)}
                        </div>
                      ))}
                      {sendMutation.isPending && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background border rounded-lg px-3 py-2 mr-8">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {attachedPost && (
                  <div className="flex items-center gap-2 text-xs bg-accent/50 border rounded-md px-2.5 py-1.5">
                    <span className="truncate flex-1">Attached: {attachedPost.caption?.slice(0, 60)}...</span>
                    <button onClick={() => setAttachedPostId("")} className="shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Select value={attachedPostId} onValueChange={setAttachedPostId}>
                    <SelectTrigger className="w-11 shrink-0 px-0 justify-center">
                      <Megaphone className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      {(postsQuery.data || []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.caption?.slice(0, 50)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Choose a post, or ask about your ad account"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    className="min-h-0 resize-none"
                  />
                  <Button size="icon" onClick={handleSend} disabled={!input.trim() || sendMutation.isPending} className="shrink-0">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Ads created */}
            <Card>
              <CardHeader>
                <CardTitle>Ads created here</CardTitle>
                <CardDescription>
                  Created paused. Activate them in Ads Manager when you're ready. Anything marked incomplete failed
                  partway and should be deleted there.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {adsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </div>
                ) : !adsQuery.data?.length ? (
                  <p className="text-sm text-muted-foreground">No ads yet — ask the assistant to build one.</p>
                ) : (
                  <div className="space-y-3">
                    {adsQuery.data.map((ad) => (
                      <div key={ad.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{ad.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {objectiveLabel[ad.objective] || ad.objective} · {ad.currency || "$"}
                            {ad.daily_budget}/day · {new Date(ad.created_at).toLocaleDateString()}
                          </p>
                          {ad.status === "INCOMPLETE" && ad.failure_reason && (
                            <p className="text-xs text-destructive mt-0.5">{ad.failure_reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={ad.status === "PAUSED" ? "secondary" : "destructive"}>{ad.status}</Badge>
                          {ad.review_url && (
                            <a href={ad.review_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Report */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Report
                  </CardTitle>
                  <CardDescription>Live from your Meta ad account — every campaign, not just the ones made here.</CardDescription>
                </div>
                <Select
                  value={reportDays}
                  onValueChange={(v) => {
                    setReportDays(v);
                    loadReport(v);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {!report ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading report...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Total spent</p>
                      <p className="text-xl font-semibold tabular-nums">
                        {report.currency || "$"}
                        {report.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Leads</p>
                      <p className="text-xl font-semibold tabular-nums">{report.leads ?? "—"}</p>
                      {report.leads === null && <p className="text-[11px] text-muted-foreground">Needs a Meta pixel or lead form</p>}
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">CTR</p>
                      <p className="text-xl font-semibold tabular-nums">{report.ctr !== null ? `${report.ctr}%` : "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Link clicks</p>
                      <p className="text-xl font-semibold tabular-nums">{report.link_clicks.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Video views</p>
                      <p className="text-xl font-semibold tabular-nums">{report.video_views ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Reach</p>
                      <p className="text-xl font-semibold tabular-nums">{report.reach.toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {report.impressions.toLocaleString()} impressions
                    {report.cpc !== null && ` · ${report.currency || "$"}${report.cpc} CPC`}
                    {report.cpm !== null && ` · ${report.currency || "$"}${report.cpm} CPM`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default MetaAds;
