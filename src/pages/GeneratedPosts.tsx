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
import { Copy, Trash2, FileText, Loader2, Check, Send, Calendar, RefreshCw, Pencil, Save } from "lucide-react";
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
};

type GHLAccount = {
  id: string;
  name: string;
  platform: string;
  avatar?: string;
};

const GeneratedPosts = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [postToGHL, setPostToGHL] = useState<GeneratedPost | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
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

  const regenerateMutation = useMutation({
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
      // Delete old post after successful regeneration
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Generated Posts
          </h2>
          <p className="text-muted-foreground mt-1">
            Your AI-generated social media posts ready to publish.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {posts?.length || 0} posts
        </Badge>
      </div>

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
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden">
              {post.image_url && (
                <div className="aspect-square bg-muted relative overflow-hidden">
                  <img
                    src={post.image_url}
                    alt="Generated post visual"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={post.status === "complete" ? "default" : "secondary"}>
                      {post.status}
                    </Badge>
                    {post.aspect_ratio && (
                      <Badge variant="outline">{post.aspect_ratio}</Badge>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerateMutation.mutate(post)}
                    disabled={regeneratingId === post.id || !post.transcript_id}
                  >
                    {regeneratingId === post.id ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Regenerating...</>
                    ) : (
                      <><RefreshCw className="h-4 w-4 mr-1" />Regenerate</>
                    )}
                  </Button>
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
          ))}
        </div>
      )}

      {/* Post to GHL Dialog */}
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
    </div>
  );
};

export default GeneratedPosts;
