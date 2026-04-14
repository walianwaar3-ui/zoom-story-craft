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
import { Sparkles, Video, Calendar, User, Loader2, Eye, Send, Trash2, Plus, Download } from "lucide-react";
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

const ZoomPosts = () => {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [viewTranscript, setViewTranscript] = useState<Transcript | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [showFathomImport, setShowFathomImport] = useState(false);
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
      customPrompt,
      aspectRatio,
    }: {
      transcriptId: string;
      customPrompt: string;
      aspectRatio: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-zoom-post", {
        body: {
          transcript_id: transcriptId,
          custom_prompt: customPrompt || undefined,
          aspect_ratio: aspectRatio,
        },
      });
      if (error) throw error;
      return data as GeneratedResult;
    },
    onSuccess: (data) => {
      toast({
        title: "Post Generated!",
        description: "Your social post has been created. You can now post it to GHL.",
      });
      setSelectedTranscript(null);
      setCustomPrompt("");
      queryClient.invalidateQueries({ queryKey: ["zoom-transcripts"] });
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      queryClient.invalidateQueries({ queryKey: ["posts-count"] });
      queryClient.invalidateQueries({ queryKey: ["new-transcripts-count"] });
      // Open GHL posting popup
      setGhlData(data);
      setSelectedAccounts([]);
      setScheduleDate("");
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Something went wrong. Try again.",
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Zoom Transcripts
          </h2>
          <p className="text-muted-foreground mt-1">
            Review your call transcripts and generate social posts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            {transcripts?.length || 0} transcripts
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setShowFathomImport(true)}>
            <Download className="h-4 w-4 mr-1" />
            Import from Fathom
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Upload Transcript
          </Button>
        </div>
      </div>

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
                      setCustomPrompt("");
                      setAspectRatio("1:1");
                    }}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Generate Post
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Social Post</DialogTitle>
            <DialogDescription>
              From: {selectedTranscript?.meeting_topic}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTranscript?.summary && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">{selectedTranscript.summary}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Custom Prompt (optional)
              </label>
              <Textarea
                placeholder="Override the default prompt... e.g., 'Focus on the pricing objection we discussed'"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
              />
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
                    customPrompt,
                    aspectRatio,
                  });
                }
              }}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating... (this may take a minute)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Post
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
      <ImportFathomDialog open={showFathomImport} onOpenChange={setShowFathomImport} />
    </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ZoomPosts;
