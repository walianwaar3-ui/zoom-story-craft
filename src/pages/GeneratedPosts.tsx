import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Copy,
  Trash2,
  FileText,
  Loader2,
  Check,
  Send,
  Calendar,
  RefreshCw,
  Pencil,
  Save,
  ChevronDown,
  Sparkles,
  Search,
  Image as ImageIcon,
  Type,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

type GeneratedPost = {
  id: string;
  transcript_id: string | null;
  caption: string | null;
  image_url: string | null;
  image_prompt: string | null;
  aspect_ratio: string | null;
  status: string;
  created_at: string;
  regenerated_count?: number | null;
  last_diagnostic?: string | null;
};

const COMPLAINT_OPTIONS = [
  { id: "spelling", label: "Text has spelling errors" },
  { id: "cutoff", label: "Text cut off or too small" },
  { id: "icons", label: "Wrong icons/objects" },
  { id: "face", label: "Face looks off" },
  { id: "vague", label: "Overall vague or unclear" },
];

const SMART_IMAGE_LOADING_LABEL = "Analyzing image → Diagnosing issues → Regenerating with fixes...";
const CAPTION_LOADING_LABEL = "Rewriting caption with fresh angle...";
const IMAGE_POLL_ATTEMPTS = 120;
const IMAGE_POLL_INTERVAL_MS = 3_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractFunctionError = async (error: unknown) => {
  let serverMsg = "";
  const maybeError = error as { context?: unknown; message?: string };
  try {
    const ctx = maybeError.context as { json?: () => Promise<{ error?: string; message?: string }>; text?: () => Promise<string> } | undefined;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      serverMsg = body?.error || body?.message || "";
    } else if (ctx && typeof ctx.text === "function") {
      serverMsg = await ctx.text();
    }
  } catch {
    /* keep original error */
  }
  return serverMsg || maybeError.message || "Edge function error";
};

const GeneratedPosts = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regenMode, setRegenMode] = useState<"image" | "caption" | null>(null);
  const [smartRegenPost, setSmartRegenPost] = useState<GeneratedPost | null>(null);
  const [smartComplaints, setSmartComplaints] = useState<string[]>([]);
  const [smartFreeText, setSmartFreeText] = useState("");
  const [smartReferenceUrl, setSmartReferenceUrl] = useState<string | null>(null);
  const [smartReferenceUploading, setSmartReferenceUploading] = useState(false);
  const [captionRegenPost, setCaptionRegenPost] = useState<GeneratedPost | null>(null);
  const [captionNotes, setCaptionNotes] = useState("");
  const [postToGHL, setPostToGHL] = useState<GeneratedPost | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: posts, isLoading } = useQuery({
    queryKey: ["generated-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_content")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GeneratedPost[];
    },
  });

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
    enabled: !!postToGHL,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("generated_content").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      queryClient.invalidateQueries({ queryKey: ["posts-count"] });
      toast({ title: "Post deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const updateCaptionMutation = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase.from("generated_content").update({ caption }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      toast({ title: "Caption updated!" });
      setEditingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  // Quick (blind) regenerate — original behavior preserved
  const quickRegenerateMutation = useMutation({
    mutationFn: async (post: GeneratedPost) => {
      if (!post.transcript_id) throw new Error("No transcript linked to this post.");
      setRegeneratingId(post.id);
      const { data, error } = await supabase.functions.invoke("generate-zoom-post", {
        body: {
          transcript_id: post.transcript_id,
          aspect_ratio: post.aspect_ratio || "1:1",
        },
      });
      if (error) throw error;
      await supabase.from("generated_content").delete().eq("id", post.id);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Post Regenerated!", description: "A new version has been created." });
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      queryClient.invalidateQueries({ queryKey: ["posts-count"] });
      setRegeneratingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Regeneration Failed", description: error.message || "Something went wrong.", variant: "destructive" });
      setRegeneratingId(null);
    },
  });

  // Smart regenerate — analyzes image first, then regenerates IMAGE with fixes
  const smartRegenerateMutation = useMutation({
    mutationFn: async ({
      post,
      complaints,
      freeText,
      autoAnalyze,
      referenceImageUrl,
    }: {
      post: GeneratedPost;
      complaints: string[];
      freeText: string;
      autoAnalyze: boolean;
      referenceImageUrl?: string | null;
    }) => {
      setRegeneratingId(post.id);
      setRegenMode("image");
      const { data, error } = await supabase.functions.invoke("smart-regenerate-image", {
        body: {
          content_id: post.id,
          complaints,
          free_text: freeText,
          auto_analyze: autoAnalyze,
          reference_image_url: referenceImageUrl || null,
        },
      });
      if (error) {
        throw new Error(await extractFunctionError(error));
      }
      if (data?.error) throw new Error(data.error);

      if (data?.status === "processing" && data.status_url && data.response_url) {
        for (let attempt = 0; attempt < IMAGE_POLL_ATTEMPTS; attempt += 1) {
          await sleep(IMAGE_POLL_INTERVAL_MS);
          const { data: pollData, error: pollError } = await supabase.functions.invoke("smart-regenerate-image", {
            body: {
              action: "poll",
              content_id: post.id,
              status_url: data.status_url,
              response_url: data.response_url,
            },
          });

          if (pollError) throw new Error(await extractFunctionError(pollError));
          if (pollData?.error) throw new Error(pollData.error);
          if (pollData?.status === "completed") return pollData;
          await queryClient.invalidateQueries({ queryKey: ["generated-content"] });
        }

        return { success: true, status: "processing", background: true };
      }

      return data;
    },
    onSuccess: (data: any) => {
      if (data?.background) {
        toast({
          title: "Image is still processing",
          description: "It will appear on this post automatically when the image job finishes.",
        });
      } else {
      toast({
        title: "Image regenerated!",
        description: "New image saved. See 'What was fixed' below.",
      });
      }
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      setRegeneratingId(null);
      setRegenMode(null);
      setSmartRegenPost(null);
      setSmartComplaints([]);
      setSmartFreeText("");
      setSmartReferenceUrl(null);
    },
    onError: (error: any) => {
      toast({
        title: "Image Regeneration Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
      setRegeneratingId(null);
      setRegenMode(null);
    },
  });

  // Generate image for a text-only post (uses saved image_prompt)
  const generateImageMutation = useMutation({
    mutationFn: async (post: GeneratedPost) => {
      setRegeneratingId(post.id);
      setRegenMode("image");
      const { data, error } = await supabase.functions.invoke("generate-image-for-post", {
        body: { content_id: post.id },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (data?.error) throw new Error(data.error);

      if (data?.status === "processing" && data.status_url && data.response_url) {
        for (let attempt = 0; attempt < IMAGE_POLL_ATTEMPTS; attempt += 1) {
          await sleep(IMAGE_POLL_INTERVAL_MS);
          const { data: pollData, error: pollError } = await supabase.functions.invoke("generate-image-for-post", {
            body: {
              action: "poll",
              content_id: post.id,
              status_url: data.status_url,
              response_url: data.response_url,
            },
          });
          if (pollError) throw new Error(await extractFunctionError(pollError));
          if (pollData?.error) throw new Error(pollData.error);
          if (pollData?.status === "completed") return pollData;
        }
        return { success: true, status: "processing", background: true };
      }
      return data;
    },
    onSuccess: (data: any) => {
      toast(
        data?.background
          ? { title: "Image is still processing", description: "It will appear on this post automatically when the image job finishes." }
          : { title: "Image generated!", description: "Image added to your post." },
      );
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      setRegeneratingId(null);
      setRegenMode(null);
    },
    onError: (error: any) => {
      toast({
        title: "Image Generation Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
      setRegeneratingId(null);
      setRegenMode(null);
    },
  });

  // Caption-only regenerate — keeps image, rewrites caption
  const captionRegenerateMutation = useMutation({
    mutationFn: async ({ post, notes }: { post: GeneratedPost; notes: string }) => {
      setRegeneratingId(post.id);
      setRegenMode("caption");
      const { data, error } = await supabase.functions.invoke("regenerate-caption-only", {
        body: { content_id: post.id, notes },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Caption regenerated!",
        description: "Image kept, caption rewritten with a fresh angle.",
      });
      queryClient.invalidateQueries({ queryKey: ["generated-content"] });
      setRegeneratingId(null);
      setRegenMode(null);
      setCaptionRegenPost(null);
      setCaptionNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Caption Regeneration Failed",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
      setRegeneratingId(null);
      setRegenMode(null);
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
      setPostToGHL(null);
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

  const copyCaption = async (caption: string, id: string) => {
    await navigator.clipboard.writeText(caption);
    setCopiedId(id);
    toast({ title: "Caption copied to clipboard!" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const toggleComplaint = (id: string) => {
    setSmartComplaints((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow mb-3">Your library</p>
          <h1 className="page-title">Generated Posts</h1>
          <p className="page-subtitle">
            Review, refine, and publish — every post is ready to ship.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs font-medium shrink-0">
          {posts?.length || 0} {posts?.length === 1 ? "post" : "posts"}
        </Badge>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !posts?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Go to Zoom Transcripts and generate your first social post from a call recording.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {posts.map((post) => {
            const isThisRegenerating = regeneratingId === post.id;
            return (
              <Card key={post.id} className="overflow-hidden">
                {post.image_url && (
                  <div
                    className="aspect-square bg-muted relative group/image overflow-hidden cursor-zoom-in"
                    onClick={() => !isThisRegenerating && setPreviewImage(post.image_url)}
                    role="button"
                    tabIndex={0}
                    aria-label="Open full image preview"
                  >
                    <img
                      src={post.image_url}
                      alt="Generated post visual"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover/image:scale-110"
                    />
                    {/* Subtle hover overlay with hint — stays inside the frame so caption never doubles */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover/image:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between opacity-0 group-hover/image:opacity-100 transition-opacity duration-300 pointer-events-none">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 backdrop-blur-sm px-3 py-1 text-xs font-medium text-foreground shadow-lg">
                        <Search className="h-3 w-3" />
                        Click to view full image
                      </span>
                    </div>
                    {isThisRegenerating && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4 text-center z-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">
                          {regenMode === "caption" ? CAPTION_LOADING_LABEL : SMART_IMAGE_LOADING_LABEL}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={post.status === "complete" ? "default" : "secondary"}>
                        {post.status}
                      </Badge>
                      {post.aspect_ratio && (
                        <Badge variant="outline">{post.aspect_ratio}</Badge>
                      )}
                      {(post.regenerated_count || 0) > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Sparkles className="h-3 w-3" />
                          v{(post.regenerated_count || 0) + 1}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(post.created_at)}
                    </span>
                  </div>

                  {post.caption && editingId === post.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        className="min-h-[120px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => updateCaptionMutation.mutate({ id: post.id, caption: editCaption })}
                          disabled={updateCaptionMutation.isPending}
                        >
                          {updateCaptionMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : post.caption ? (
                    <div
                      className="bg-muted/50 rounded-lg p-4 cursor-pointer group relative"
                      onClick={() => { setEditingId(post.id); setEditCaption(post.caption!); }}
                    >
                      <Pencil className="h-4 w-4 absolute top-3 right-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {post.caption}
                      </p>
                    </div>
                  ) : null}

                  {post.last_diagnostic && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                          <Search className="h-3.5 w-3.5" />
                          🔍 What was fixed
                          <ChevronDown className="h-3.5 w-3.5 ml-auto" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-muted/40 border rounded-lg p-3 mt-1">
                          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-muted-foreground">
                            {post.last_diagnostic}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {post.caption && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyCaption(post.caption!, post.id)}
                      >
                        {copiedId === post.id ? (
                          <><Check className="h-4 w-4 mr-1" />Copied!</>
                        ) : (
                          <><Copy className="h-4 w-4 mr-1" />Copy</>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setPostToGHL(post);
                        setSelectedAccounts([]);
                        setScheduleDate("");
                      }}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Post to GHL
                    </Button>

                    {!post.image_url && post.image_prompt && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isThisRegenerating}
                        onClick={() => generateImageMutation.mutate(post)}
                      >
                        {isThisRegenerating ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generating...</>
                        ) : (
                          <><ImageIcon className="h-4 w-4 mr-1" />Generate Image</>
                        )}
                      </Button>
                    )}

                    {/* Split Smart Regenerate / Quick Regenerate */}
                    <div className="inline-flex">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-r-none border-r-0"
                        disabled={isThisRegenerating || !post.image_url}
                        onClick={() => {
                          setSmartRegenPost(post);
                          setSmartComplaints([]);
                          setSmartFreeText("");
                        }}
                      >
                        {isThisRegenerating ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Working...</>
                        ) : (
                          <><Sparkles className="h-4 w-4 mr-1" />Smart Regenerate</>
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-l-none px-2"
                            disabled={isThisRegenerating}
                            aria-label="Regenerate options"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSmartRegenPost(post);
                              setSmartComplaints([]);
                              setSmartFreeText("");
                            }}
                            disabled={!post.image_url}
                          >
                            <ImageIcon className="h-4 w-4 mr-2" />
                            Regenerate Image Only
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setCaptionRegenPost(post);
                              setCaptionNotes("");
                            }}
                          >
                            <Type className="h-4 w-4 mr-2" />
                            Regenerate Caption Only
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => quickRegenerateMutation.mutate(post)}
                            disabled={!post.transcript_id}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Quick Regenerate (both)
                            {!post.transcript_id && (
                              <span className="ml-2 text-xs text-muted-foreground">(no transcript)</span>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(post.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Smart Regenerate Dialog */}
      <Dialog
        open={!!smartRegenPost}
        onOpenChange={(open) => {
          if (!open && !smartRegenerateMutation.isPending) {
            setSmartRegenPost(null);
            setSmartComplaints([]);
            setSmartFreeText("");
            setSmartReferenceUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>What's wrong with this image?</DialogTitle>
            <DialogDescription>
              Tell us what's off and we'll diagnose & fix it. Or let it auto-analyze.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {COMPLAINT_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => toggleComplaint(opt.id)}
                >
                  <Checkbox
                    checked={smartComplaints.includes(opt.id)}
                    onCheckedChange={() => toggleComplaint(opt.id)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </div>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Anything else? (optional)</label>
              <Textarea
                value={smartFreeText}
                onChange={(e) => setSmartFreeText(e.target.value)}
                placeholder="e.g. The headline says 'Profitible' but should be 'Profitable'..."
                className="min-h-[80px] text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Reference image (optional)
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Upload an image you want the model to mimic — style, composition, or subject.
              </p>
              {smartReferenceUrl ? (
                <div className="flex items-center gap-3 p-2 rounded-lg border">
                  <img
                    src={smartReferenceUrl}
                    alt="Reference"
                    className="h-16 w-16 object-cover rounded"
                  />
                  <div className="flex-1 text-xs text-muted-foreground truncate">
                    Reference uploaded
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={smartRegenerateMutation.isPending}
                    onClick={() => setSmartReferenceUrl(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={smartReferenceUploading || smartRegenerateMutation.isPending}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setSmartReferenceUploading(true);
                      try {
                        const fileName = `reference_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
                        const { error: upErr } = await supabase.storage
                          .from("carolyn-photos")
                          .upload(fileName, file, { contentType: file.type });
                        if (upErr) throw upErr;
                        const { data: urlData } = supabase.storage
                          .from("carolyn-photos")
                          .getPublicUrl(fileName);
                        setSmartReferenceUrl(urlData.publicUrl);
                        toast({ title: "Reference image uploaded" });
                      } catch (err: any) {
                        toast({
                          title: "Upload failed",
                          description: err.message || "Could not upload image",
                          variant: "destructive",
                        });
                      } finally {
                        setSmartReferenceUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  {smartReferenceUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={smartRegenerateMutation.isPending || smartReferenceUploading}
                onClick={() => {
                  if (!smartRegenPost) return;
                  smartRegenerateMutation.mutate({
                    post: smartRegenPost,
                    complaints: [],
                    freeText: "",
                    autoAnalyze: true,
                    referenceImageUrl: smartReferenceUrl,
                  });
                }}
              >
                {smartRegenerateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                Auto-analyze instead
              </Button>
              <Button
                className="flex-1"
                disabled={smartRegenerateMutation.isPending || smartReferenceUploading}
                onClick={() => {
                  if (!smartRegenPost) return;
                  smartRegenerateMutation.mutate({
                    post: smartRegenPost,
                    complaints: smartComplaints,
                    freeText: smartFreeText,
                    autoAnalyze: false,
                    referenceImageUrl: smartReferenceUrl,
                  });
                }}
              >
                {smartRegenerateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Working...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Regenerate with notes</>
                )}
              </Button>
            </div>

            {smartRegenerateMutation.isPending && (
              <p className="text-xs text-center text-muted-foreground">
                {SMART_IMAGE_LOADING_LABEL}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Caption-Only Regenerate Dialog */}
      <Dialog
        open={!!captionRegenPost}
        onOpenChange={(open) => {
          if (!open && !captionRegenerateMutation.isPending) {
            setCaptionRegenPost(null);
            setCaptionNotes("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Caption Only</DialogTitle>
            <DialogDescription>
              Keep the existing image, rewrite the caption with a fresh angle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                What's wrong with the caption? (optional)
              </label>
              <Textarea
                value={captionNotes}
                onChange={(e) => setCaptionNotes(e.target.value)}
                placeholder="e.g. Hook is weak, too long, CTA unclear, tone is off..."
                className="min-h-[100px] text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to auto-rewrite with a fresh hook & structure.
              </p>
            </div>

            <Button
              className="w-full"
              disabled={captionRegenerateMutation.isPending}
              onClick={() => {
                if (!captionRegenPost) return;
                captionRegenerateMutation.mutate({
                  post: captionRegenPost,
                  notes: captionNotes,
                });
              }}
            >
              {captionRegenerateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rewriting caption...</>
              ) : (
                <><Type className="h-4 w-4 mr-2" />Regenerate Caption</>
              )}
            </Button>

            {captionRegenerateMutation.isPending && (
              <p className="text-xs text-center text-muted-foreground">
                {CAPTION_LOADING_LABEL}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!postToGHL} onOpenChange={() => setPostToGHL(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post to GoHighLevel</DialogTitle>
            <DialogDescription>
              Select social accounts and optionally schedule the post.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {postToGHL?.caption && (
              <div className="bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                <p className="text-sm whitespace-pre-wrap">{postToGHL.caption.slice(0, 300)}...</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Select Social Accounts</label>
              {accountsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading accounts...
                </div>
              ) : !ghlAccounts?.length ? (
                <p className="text-sm text-muted-foreground">
                  No social accounts found. Connect accounts in GoHighLevel first.
                </p>
              ) : (
                <div className="space-y-2">
                  {ghlAccounts.map((account: any) => (
                    <div
                      key={account.id || account._id}
                      className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleAccount(account.id || account._id)}
                    >
                      <Checkbox
                        checked={selectedAccounts.includes(account.id || account._id)}
                        onCheckedChange={() => toggleAccount(account.id || account._id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {account.name || account.pageName || account.username || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {account.platform || account.type || "Social"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Schedule (optional)
              </label>
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                placeholder="Leave empty to save as draft"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to save as draft in GHL
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                if (postToGHL?.caption) {
                  postToGHLMutation.mutate({
                    caption: postToGHL.caption,
                    image_url: postToGHL.image_url,
                    account_ids: selectedAccounts,
                    schedule_date: scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
                  });
                }
              }}
              disabled={postToGHLMutation.isPending || !selectedAccounts.length}
            >
              {postToGHLMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Posting...</>
              ) : (
                <><Send className="h-4 w-4 mr-2" />{scheduleDate ? "Schedule Post" : "Save as Draft in GHL"}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-image preview lightbox — clean, no caption overlap */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-5xl p-2 sm:p-3 bg-background border-border">
          <DialogHeader className="sr-only">
            <DialogTitle>Full image preview</DialogTitle>
            <DialogDescription>Press Escape or click outside to close.</DialogDescription>
          </DialogHeader>
          {previewImage && (
            <div className="relative w-full max-h-[85vh] flex items-center justify-center bg-muted/30 rounded-md overflow-hidden">
              <img
                src={previewImage}
                alt="Full generated post visual"
                className="max-w-full max-h-[85vh] w-auto h-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeneratedPosts;
