import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, Send, Upload, X, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type GeneratedResult = {
  success: boolean;
  content_id: string;
  caption: string;
  image_url: string | null;
  warning?: string | null;
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

const GeneratePost = () => {
  const { toast } = useToast();

  // Manual mode state
  const [postDate, setPostDate] = useState(todayISO());
  const [postType, setPostType] = useState("evergreen");
  const [hook, setHook] = useState("");
  const [context, setContext] = useState("");
  const [ctaGoal, setCtaGoal] = useState("auto");
  const [imageStyle, setImageStyle] = useState("auto");
  const [aspectRatio, setAspectRatio] = useState("1:1");

  // Raw mode state
  const [rawCaption, setRawCaption] = useState("");
  const [rawImagePrompt, setRawImagePrompt] = useState("");
  const [rawAspectRatio, setRawAspectRatio] = useState("1:1");
  const [rawReferenceUrl, setRawReferenceUrl] = useState<string | null>(null);
  const [rawReferenceUploading, setRawReferenceUploading] = useState(false);

  const [ghlData, setGhlData] = useState<GeneratedResult | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-manual-post", {
        body: {
          post_date: postDate,
          post_type: postType,
          hook,
          context,
          cta_goal: ctaGoal,
          image_style: imageStyle,
          aspect_ratio: aspectRatio,
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
          title: "Caption ready — image generating",
          description: data?.warning || "Image is being generated in the background.",
        });
      }
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

  const rawGenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-raw-post", {
        body: {
          caption: rawCaption,
          image_prompt: rawImagePrompt,
          aspect_ratio: rawAspectRatio,
          reference_image_url: rawReferenceUrl,
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
      toast({
        title: "Raw post saved",
        description: data?.warning || "Caption saved. Image generating in background.",
      });
      setGhlData(data);
      setSelectedAccounts([]);
      setScheduleDate("");
      // Reset raw fields
      setRawCaption("");
      setRawImagePrompt("");
      setRawReferenceUrl(null);
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const uploadRawReference = async (file: File) => {
    setRawReferenceUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `raw-refs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("carolyn-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("carolyn-photos").getPublicUrl(path);
      setRawReferenceUrl(pub.publicUrl);
      toast({ title: "Reference image uploaded" });
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e.message || "Could not upload reference image.",
        variant: "destructive",
      });
    } finally {
      setRawReferenceUploading(false);
    }
  };

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

  const postToGHLMutation = useMutation({
    mutationFn: async () => {
      if (!ghlData) return null;
      const { data, error } = await supabase.functions.invoke("ghl-social", {
        body: {
          action: "post",
          caption: ghlData.caption,
          image_url: ghlData.image_url,
          account_ids: selectedAccounts,
          schedule_date: scheduleDate || undefined,
        },
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

  const toggleAccount = (id: string) =>
    setSelectedAccounts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const canSubmit = !!postDate && !!postType && hook.trim().length > 0 && !generateMutation.isPending;
  const canSubmitRaw = rawCaption.trim().length > 0 && !rawGenerateMutation.isPending && !rawReferenceUploading;

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow mb-3">Manual mode</p>
          <h1 className="page-title">Generate Post</h1>
          <p className="page-subtitle">
            No transcript? No problem. Drop in an idea and we'll handle the rest — or go raw and post your own caption + image idea.
          </p>
        </div>
      </header>

      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="manual">
            <Sparkles className="h-4 w-4 mr-2" /> Manual Post
          </TabsTrigger>
          <TabsTrigger value="raw">
            <Zap className="h-4 w-4 mr-2" /> Raw Post
          </TabsTrigger>
        </TabsList>

        {/* ============ MANUAL TAB ============ */}
        <TabsContent value="manual" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>New Manual Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Post Date *</label>
                  <Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Aspect Ratio *</label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
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
                <RadioGroup value={postType} onValueChange={setPostType} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {POST_TYPES.map((pt) => (
                    <Label
                      key={pt.value}
                      htmlFor={`pt-${pt.value}`}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    >
                      <RadioGroupItem id={`pt-${pt.value}`} value={pt.value} className="mt-0.5" />
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
                  placeholder="What happened or what's the main point? Just dump it raw."
                  value={hook}
                  onChange={(e) => setHook(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Context / Backstory</label>
                <Textarea
                  rows={4}
                  placeholder="Any details, client situation, moment, realization? (Optional — we'll infer if empty)"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">CTA Goal</label>
                  <Select value={ctaGoal} onValueChange={setCtaGoal}>
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
                  <Select value={imageStyle} onValueChange={setImageStyle}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STYLE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o === "auto" ? "Auto" : o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" onClick={() => generateMutation.mutate()} disabled={!canSubmit}>
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Formatting input → Generating caption → Generating image...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Post
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ RAW TAB ============ */}
        <TabsContent value="raw" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Raw Post</CardTitle>
              <p className="text-sm text-muted-foreground">
                Skip the AI copywriter. Drop your own caption and exact image idea — we'll generate the image and save it as a post. Great for training the image side to match your taste.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Caption *</label>
                <Textarea
                  rows={6}
                  placeholder="Paste or write your final caption exactly as you want it posted."
                  value={rawCaption}
                  onChange={(e) => setRawCaption(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Image Idea / Prompt</label>
                <Textarea
                  rows={4}
                  placeholder="Describe the image you want — composition, style, mood, text overlay, lighting. Be as raw or specific as you like. Leave blank to skip image generation."
                  value={rawImagePrompt}
                  onChange={(e) => setRawImagePrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Tip: this prompt goes straight to the image model — no AI rewriting. Iterate freely to train your visual style.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Aspect Ratio *</label>
                <Select value={rawAspectRatio} onValueChange={setRawAspectRatio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1:1">Square (1:1)</SelectItem>
                    <SelectItem value="9:16">Story (9:16)</SelectItem>
                    <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                    <SelectItem value="4:5">Portrait (4:5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Reference Image (optional)</label>
                {rawReferenceUrl ? (
                  <div className="flex items-center gap-3 p-2 rounded-lg border">
                    <img
                      src={rawReferenceUrl}
                      alt="Reference"
                      className="h-16 w-16 rounded object-cover"
                    />
                    <p className="text-xs text-muted-foreground flex-1 truncate">
                      Reference uploaded — image model will mimic style/composition.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setRawReferenceUrl(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer hover:bg-muted/50">
                    {rawReferenceUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span className="text-sm">Upload reference image (optional)</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadRawReference(f);
                        e.target.value = "";
                      }}
                      disabled={rawReferenceUploading}
                    />
                  </label>
                )}
              </div>

              <Button className="w-full" onClick={() => rawGenerateMutation.mutate()} disabled={!canSubmitRaw}>
                {rawGenerateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving caption → Submitting image to queue...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Raw Post
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* GHL post dialog — same shape as Zoom flow */}
      <Dialog open={!!ghlData} onOpenChange={() => setGhlData(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post to Social Media</DialogTitle>
            <DialogDescription>
              {ghlData?.image_url
                ? "Your post is ready! Select accounts to publish."
                : "Caption saved. Image is generating in the background — you can post the caption now or wait for the image on the Generated Posts page."}
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
              <Input type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setGhlData(null)}>Skip</Button>
              <Button
                className="flex-1"
                disabled={!selectedAccounts.length || postToGHLMutation.isPending}
                onClick={() => postToGHLMutation.mutate()}
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
    </div>
  );
};

export default GeneratePost;
