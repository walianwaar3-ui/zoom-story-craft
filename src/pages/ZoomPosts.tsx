import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Video, Calendar, User, Loader2, Eye, Send, Trash2, Plus, Download, SlidersHorizontal } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import ImportFathomDialog from "@/components/ImportFathomDialog";
import { useToast } from "@/hooks/use-toast";

type Transcript = {
  id: string;
  meeting_topic: string;
  meeting_date: string | null;
  summary: string | null;
  transcript: string | null;
  client_name: string | null;
  issues_discussed: string | null;
  status: string;
  created_at: string;
};

type GeneratedResult = {
  success: boolean;
  content_id: string;
  caption: string;
  image_url: string | null;
};

const POST_TYPES = [
  { value: "evergreen", label: "Evergreen", desc: "Authority, frameworks" },
  { value: "promo", label: "Promo", desc: "Offer, product, CTA-driven" },
  { value: "news_reaction", label: "News Reaction", desc: "Industry event" },
  { value: "personal_story", label: "Personal Story", desc: "Relatable, mindset" },
];
const CTA_OPTIONS = ["auto", "System Map", "Funnel", "Blueprint", "Ladder", "Engine", "Structure", "Stack"];
const STYLE_OPTIONS = ["auto", "Anchor Shot", "Operator Shot", "News Report", "Versus", "Relatable"];
const todayISO = () => new Date().toISOString().slice(0, 10);

const ZoomPosts = () => {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [viewTranscript, setViewTranscript] = useState<Transcript | null>(null);
  const [postCount, setPostCount] = useState<number>(1);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [showFathomImport, setShowFathomImport] = useState(false);
  // Fine-tune dialog state
  const [fineTuneTranscript, setFineTuneTranscript] = useState<Transcript | null>(null);
  const [ftPostDate, setFtPostDate] = useState(todayISO());
  const [ftPostType, setFtPostType] = useState("evergreen");
  const [ftHook, setFtHook] = useState("");
  const [ftContext, setFtContext] = useState("");
  const [ftCtaGoal, setFtCtaGoal] = useState("auto");
  const [ftImageStyle, setFtImageStyle] = useState("auto");
  const [ftAspectRatio, setFtAspectRatio] = useState("1:1");
  // GHL popup state
  const [ghlData, setGhlData] = useState<GeneratedResult | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    meeting_topic: "",
    client_name: "",
    meeting_date: "",
    summary: "",
    issues_discussed: "",
    transcript: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: transcripts, isLoading } = useQuery({
    queryKey: ["zoom-transcripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zoom_transcripts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Transcript[];
    },
  });

  // Fetch GHL accounts when the GHL dialog is open
  const { data: ghlAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["ghl-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ghl-social", {
        body: { action: "accounts" },
      });
      if (error) throw error;
      const accounts = data?.results?.accounts || data?.accounts || data?.social_media_accounts || data || [];
      return Array.isArray(accounts) ? accounts.filter((a: any) => !a.deleted && !a.isExpired) : [];
    },
    enabled: !!ghlData,
  });

  const generateMutation = useMutation({
    mutationFn: async ({
      transcriptId,
      postCount,
      aspectRatio,
    }: {
      transcriptId: string;
      postCount: number;
      aspectRatio: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-zoom-post", {
        body: {
          transcript_id: transcriptId,
          post_count: postCount,
          aspect_ratio: aspectRatio,
        },
      });
      if (error) throw error;
      return data as GeneratedResult & { total_posts?: number; posts?: GeneratedResult[] };
    },
    onSuccess: (data) => {
      const total = (data as any)?.total_posts ?? 1;
      if (total > 1) {
        toast({
          title: `${total} posts generated`,
          description: "Your post series is ready in Generated Posts.",
        });
      } else if (data?.image_url) {
        toast({
          title: "Post Generated!",
          description: "Caption + image ready. You can now post it to GHL.",
        });
      } else {
        toast({
          title: "Caption Generated (no image)",
          description: (data as any)?.warning || "Image generation failed — you can still post the caption.",
          variant: "destructive",
        });
      }
      setSelectedTranscript(null);
      setPostCount(1);
      queryClient.invalidateQueries({ queryKey: ["zoom-transcripts"] });
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      queryClient.invalidateQueries({ queryKey: ["posts-count"] });
      queryClient.invalidateQueries({ queryKey: ["new-transcripts-count"] });

      // Only open the GHL "post now" dialog for a single post — for batches, send the user to Generated Posts.
      if (total === 1) {
        setGhlData(data);
        setSelectedAccounts([]);
        setScheduleDate("");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const fineTuneMutation = useMutation({
    mutationFn: async () => {
      if (!fineTuneTranscript) throw new Error("No transcript selected");
      const { data, error } = await supabase.functions.invoke("generate-manual-post", {
        body: {
          transcript_id: fineTuneTranscript.id,
          post_date: ftPostDate,
          post_type: ftPostType,
          hook: ftHook,
          context: ftContext,
          cta_goal: ftCtaGoal,
          image_style: ftImageStyle,
          aspect_ratio: ftAspectRatio,
        },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message || "Generation failed";
        try {
          const body = await ctx?.response?.json?.();
          if (body?.error) msg = body.error;
        } catch (_) { /* ignore */ }
        throw new Error(msg);
      }
      return data as GeneratedResult;
    },
    onSuccess: (data) => {
      if (data?.image_url) {
        toast({ title: "Post Generated!", description: "Caption + image ready." });
      } else {
        toast({
          title: "Caption Generated (no image)",
          description: (data as any)?.warning || "Image generation failed — caption saved.",
          variant: "destructive",
        });
      }
      setFineTuneTranscript(null);
      setFtHook("");
      setFtContext("");
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      queryClient.invalidateQueries({ queryKey: ["posts-count"] });
      setGhlData(data);
      setSelectedAccounts([]);
      setScheduleDate("");
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (form: typeof uploadForm) => {
      const { error } = await supabase.from("zoom_transcripts").insert({
        meeting_topic: form.meeting_topic,
        client_name: form.client_name || null,
        meeting_date: form.meeting_date || null,
        summary: form.summary || null,
        issues_discussed: form.issues_discussed || null,
        transcript: form.transcript || null,
        status: "new",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Uploaded", description: "Transcript added successfully." });
      setShowUpload(false);
      setUploadForm({ meeting_topic: "", client_name: "", meeting_date: "", summary: "", issues_discussed: "", transcript: "" });
      queryClient.invalidateQueries({ queryKey: ["zoom-transcripts"] });
      queryClient.invalidateQueries({ queryKey: ["new-transcripts-count"] });
    },
    onError: (error: any) => {
      toast({ title: "Upload Failed", description: error.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("zoom_transcripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Transcript removed." });
      queryClient.invalidateQueries({ queryKey: ["zoom-transcripts"] });
      queryClient.invalidateQueries({ queryKey: ["new-transcripts-count"] });
    },
    onError: (error: any) => {
      toast({ title: "Delete Failed", description: error.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const postToGHLMutation = useMutation({
    mutationFn: async ({
      caption,
      image_url,
      account_ids,
      schedule_date,
    }: {
      caption: string;
      image_url: string | null;
      account_ids: string[];
      schedule_date?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("ghl-social", {
        body: { action: "post", caption, image_url, account_ids, schedule_date: schedule_date || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Posted to GHL!", description: "Your post has been sent to GoHighLevel Social Planner." });
      setGhlData(null);
      setSelectedAccounts([]);
      setScheduleDate("");
    },
    onError: (error: any) => {
      toast({
        title: "GHL Post Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "No date";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow mb-3">Source material</p>
          <h1 className="page-title">Zoom Transcripts</h1>
          <p className="page-subtitle">
            Every call you've had, ready to become a week's worth of content.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs font-medium">
            {transcripts?.length || 0} {transcripts?.length === 1 ? "transcript" : "transcripts"}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setShowFathomImport(true)}>
            <Download className="h-4 w-4 mr-1.5" />
            Import from Fathom
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)} className="bg-gradient-brand hover:opacity-95 shadow-glow">
            <Plus className="h-4 w-4 mr-1.5" />
            Upload Transcript
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !transcripts?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No transcripts yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Connect your Zapier webhook to start receiving Zoom call transcripts automatically.
              Your webhook URL will be shown in the settings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {transcripts.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition-shadow">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold truncate">{t.meeting_topic}</h3>
                    <Badge
                      variant={t.status === "new" ? "default" : "secondary"}
                      className="shrink-0"
                    >
                      {t.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {t.client_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {t.client_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(t.meeting_date)}
                    </span>
                  </div>
                  {t.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {t.summary}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewTranscript(t)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedTranscript(t);
                      setPostCount(1);
                      setAspectRatio("1:1");
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Quick Generate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFineTuneTranscript(t);
                      setFtPostDate(todayISO());
                      setFtPostType("evergreen");
                      setFtHook("");
                      setFtContext(
                        [t.summary, t.issues_discussed].filter(Boolean).join("\n\n")
                      );
                      setFtCtaGoal("auto");
                      setFtImageStyle("auto");
                      setFtAspectRatio("1:1");
                    }}
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-1" />
                    Fine-tune
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this transcript?")) {
                        deleteMutation.mutate(t.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Transcript Dialog */}
      <Dialog open={!!viewTranscript} onOpenChange={() => setViewTranscript(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewTranscript?.meeting_topic}</DialogTitle>
            <DialogDescription>
              {viewTranscript?.client_name && `Client: ${viewTranscript.client_name} · `}
              {formatDate(viewTranscript?.meeting_date || null)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewTranscript?.summary && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Summary</h4>
                <p className="text-sm text-muted-foreground">{viewTranscript.summary}</p>
              </div>
            )}
            {viewTranscript?.issues_discussed && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Issues Discussed</h4>
                <p className="text-sm text-muted-foreground">{viewTranscript.issues_discussed}</p>
              </div>
            )}
            {viewTranscript?.transcript && (
              <div>
                <h4 className="text-sm font-semibold mb-1">Full Transcript</h4>
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-4 rounded-lg max-h-96 overflow-y-auto">
                  {viewTranscript.transcript}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate Post Dialog */}
      <Dialog open={!!selectedTranscript} onOpenChange={() => setSelectedTranscript(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Social Posts</DialogTitle>
            <DialogDescription>
              From: {selectedTranscript?.meeting_topic}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Small summary preview */}
            {(selectedTranscript?.summary || selectedTranscript?.issues_discussed) && (
              <div className="bg-muted p-3 rounded-lg space-y-2">
                {selectedTranscript?.summary && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                      Summary
                    </p>
                    <p className="text-sm text-foreground line-clamp-4">
                      {selectedTranscript.summary}
                    </p>
                  </div>
                )}
                {selectedTranscript?.issues_discussed && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                      Key Issues
                    </p>
                    <p className="text-sm text-foreground line-clamp-3">
                      {selectedTranscript.issues_discussed}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Number of posts to generate */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Number of posts (1–14 days)
              </label>
              <Select
                value={String(postCount)}
                onValueChange={(v) => setPostCount(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n === 1 ? "post" : `posts (${n} days)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Each post explores a different angle from the same transcript.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Image Aspect Ratio
              </label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1:1">Square (1:1)</SelectItem>
                  <SelectItem value="9:16">Story (9:16)</SelectItem>
                  <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                  <SelectItem value="4:5">Portrait (4:5)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (selectedTranscript) {
                  generateMutation.mutate({
                    transcriptId: selectedTranscript.id,
                    postCount,
                    aspectRatio,
                  });
                }
              }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {postCount > 1
                    ? `Generating ${postCount} posts... this may take a few minutes`
                    : "Analyzing caption → Generating image..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {postCount > 1 ? `Generate ${postCount} Posts` : "Generate Post"}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Transcript Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Transcript</DialogTitle>
            <DialogDescription>Manually add a Zoom call transcript.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Meeting Topic *</label>
              <Input
                placeholder="e.g., Sales call with ABC Sheds"
                value={uploadForm.meeting_topic}
                onChange={(e) => setUploadForm((f) => ({ ...f, meeting_topic: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Client Name</label>
                <Input
                  placeholder="e.g., John Smith"
                  value={uploadForm.client_name}
                  onChange={(e) => setUploadForm((f) => ({ ...f, client_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Meeting Date</label>
                <Input
                  type="date"
                  value={uploadForm.meeting_date}
                  onChange={(e) => setUploadForm((f) => ({ ...f, meeting_date: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Summary</label>
              <Textarea
                placeholder="Brief summary of the call..."
                value={uploadForm.summary}
                onChange={(e) => setUploadForm((f) => ({ ...f, summary: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Issues Discussed</label>
              <Textarea
                placeholder="Key issues or topics covered..."
                value={uploadForm.issues_discussed}
                onChange={(e) => setUploadForm((f) => ({ ...f, issues_discussed: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Full Transcript</label>
              <Textarea
                placeholder="Paste the full transcript here..."
                value={uploadForm.transcript}
                onChange={(e) => setUploadForm((f) => ({ ...f, transcript: e.target.value }))}
                rows={6}
              />
            </div>
            <Button
              className="w-full"
              disabled={!uploadForm.meeting_topic.trim() || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate(uploadForm)}
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" /> Add Transcript</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post to GHL Dialog — shown after generation */}
      <Dialog open={!!ghlData} onOpenChange={() => setGhlData(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post to Social Media</DialogTitle>
            <DialogDescription>
              Your post is ready! Select accounts to publish.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {ghlData?.image_url && (
              <div className="rounded-lg overflow-hidden bg-muted aspect-square max-h-48 mx-auto">
                <img src={ghlData.image_url} alt="Generated" className="w-full h-full object-cover" />
              </div>
            )}
            {ghlData?.caption && (
              <div className="bg-muted p-3 rounded-lg max-h-32 overflow-y-auto">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ghlData.caption}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Select Accounts</label>
              {accountsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
                </div>
              ) : ghlAccounts?.length ? (
                <div className="space-y-2">
                  {ghlAccounts.map((acc: any) => (
                    <label key={acc.id || acc._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                      <Checkbox
                        checked={selectedAccounts.includes(acc.id || acc._id)}
                        onCheckedChange={() => toggleAccount(acc.id || acc._id)}
                      />
                      <div>
                        <p className="text-sm font-medium">{acc.name || acc.username || acc.pageName || "Account"}</p>
                        <p className="text-xs text-muted-foreground capitalize">{acc.platform || acc.type || "social"}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No accounts found. Connect accounts in GoHighLevel first.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Schedule (optional)</label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setGhlData(null)}>
                Skip
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedAccounts.length || postToGHLMutation.isPending}
                onClick={() => {
                  if (ghlData) {
                    postToGHLMutation.mutate({
                      caption: ghlData.caption,
                      image_url: ghlData.image_url,
                      account_ids: selectedAccounts,
                      schedule_date: scheduleDate || undefined,
                    });
                  }
                }}
              >
                {postToGHLMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Posting...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Post Now</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fine-tune Generate Dialog */}
      <Dialog open={!!fineTuneTranscript} onOpenChange={(o) => !o && setFineTuneTranscript(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fine-tune Post</DialogTitle>
            <DialogDescription>
              From: {fineTuneTranscript?.meeting_topic}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(fineTuneTranscript?.summary || fineTuneTranscript?.issues_discussed) && (
              <div className="bg-muted p-3 rounded-lg space-y-2 text-xs">
                {fineTuneTranscript?.summary && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Summary</p>
                    <p className="text-foreground line-clamp-3">{fineTuneTranscript.summary}</p>
                  </div>
                )}
                {fineTuneTranscript?.issues_discussed && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Key Issues</p>
                    <p className="text-foreground line-clamp-3">{fineTuneTranscript.issues_discussed}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Post Date *</label>
                <Input type="date" value={ftPostDate} onChange={(e) => setFtPostDate(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Aspect Ratio *</label>
                <Select value={ftAspectRatio} onValueChange={setFtAspectRatio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">Square (1:1)</SelectItem>
                    <SelectItem value="9:16">Story (9:16)</SelectItem>
                    <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                    <SelectItem value="4:5">Portrait (4:5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Post Type *</label>
              <RadioGroup value={ftPostType} onValueChange={setFtPostType} className="grid grid-cols-2 gap-2">
                {POST_TYPES.map((pt) => (
                  <Label
                    key={pt.value}
                    htmlFor={`ft-${pt.value}`}
                    className="flex items-start gap-2 p-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  >
                    <RadioGroupItem id={`ft-${pt.value}`} value={pt.value} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{pt.label}</p>
                      <p className="text-xs text-muted-foreground">{pt.desc}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Hook / Core Insight *</label>
              <Textarea
                rows={3}
                placeholder="What's the angle for THIS post? Write it in your own words."
                value={ftHook}
                onChange={(e) => setFtHook(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Context / Backstory</label>
              <Textarea
                rows={4}
                placeholder="Pre-filled from transcript — edit or trim as needed."
                value={ftContext}
                onChange={(e) => setFtContext(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">CTA Goal</label>
                <Select value={ftCtaGoal} onValueChange={setFtCtaGoal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CTA_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o === "auto" ? "Auto-pick" : o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Image Style</label>
                <Select value={ftImageStyle} onValueChange={setFtImageStyle}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STYLE_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>{o === "auto" ? "Auto" : o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!ftHook.trim() || fineTuneMutation.isPending}
              onClick={() => fineTuneMutation.mutate()}
            >
              {fineTuneMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating fine-tuned post...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate Fine-tuned Post</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportFathomDialog open={showFathomImport} onOpenChange={setShowFathomImport} />
    </div>
  );
};

export default ZoomPosts;
