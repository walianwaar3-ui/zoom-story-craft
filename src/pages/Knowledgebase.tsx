import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { BookOpen, Plus, Pencil, Trash2, Loader2, Search, Upload, ImageIcon, Lock, Unlock } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type KBEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  "Overlay Images",
  "Caption Prompt",
  "Image Prompt",
  "Brand Guidelines",
  "Voice & Tone",
  "Campaign Strategy",
  "General",
];

const HIDDEN_CATEGORIES: string[] = [];

const categoryColors: Record<string, string> = {
  "Overlay Images": "bg-sky-500/10 text-sky-500 border-sky-500/20",
  "Caption Prompt": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "Image Prompt": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "Brand Guidelines": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "Voice & Tone": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "Campaign Strategy": "bg-rose-500/10 text-rose-500 border-rose-500/20",
  General: "bg-muted text-muted-foreground",
};

const Knowledgebase = () => {
  const [editEntry, setEditEntry] = useState<KBEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [form, setForm] = useState({ category: "General", title: "", content: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["knowledgebase"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledgebase")
        .select("*")
        .order("category")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as KBEntry[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (entry: { id?: string; category: string; title: string; content: string; image_url?: string }) => {
      if (entry.id) {
        const { error } = await supabase
          .from("knowledgebase")
          .update({
            category: entry.category,
            title: entry.title,
            content: entry.content,
            image_url: entry.image_url || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("knowledgebase")
          .insert({
            category: entry.category,
            title: entry.title,
            content: entry.content,
            image_url: entry.image_url || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgebase"] });
      toast({ title: editEntry ? "Entry updated" : "Entry added" });
      setEditEntry(null);
      setIsAdding(false);
      setForm({ category: "General", title: "", content: "", image_url: "" });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledgebase").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledgebase"] });
      toast({ title: "Entry deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message || "Something went wrong.", variant: "destructive" });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileName = `overlay_${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

    const { error: uploadError } = await supabase.storage
      .from("carolyn-photos")
      .upload(fileName, file, { contentType: file.type });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("carolyn-photos").getPublicUrl(fileName);
    setForm({ ...form, image_url: urlData.publicUrl });
    setUploading(false);
    toast({ title: "Image uploaded" });
  };

  const filtered = entries?.filter((e) => {
    if (HIDDEN_CATEGORIES.includes(e.category)) return false;
    const matchesSearch =
      !search ||
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase());
    const matchesCat = filterCat === "all" || e.category === filterCat;
    return matchesSearch && matchesCat;
  });

  const openEdit = (entry: KBEntry) => {
    setEditEntry(entry);
    setIsLocked(true);
    setForm({ category: entry.category, title: entry.title, content: entry.content, image_url: entry.image_url || "" });
  };

  const openAdd = () => {
    setEditEntry(null);
    setIsLocked(false);
    setForm({ category: "General", title: "", content: "", image_url: "" });
    setIsAdding(true);
  };

  const isImageCategory = form.category === "Overlay Images";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Knowledgebase
          </h2>
          <p className="text-muted-foreground mt-1">
            Brand guidelines, prompts, overlay images, and content strategy rules.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Entry
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search knowledgebase..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !filtered?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No entries yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Add your brand guidelines, prompt templates, and content strategy rules.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Image grid for Overlay Images */}
          {(filterCat === "all" || filterCat === "Overlay Images") && filtered.some((e) => e.category === "Overlay Images") && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Overlay Images</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {filtered
                  .filter((e) => e.category === "Overlay Images" && e.image_url)
                  .map((entry) => (
                    <div key={entry.id} className="group relative rounded-lg overflow-hidden border bg-muted aspect-square">
                      <img
                        src={entry.image_url!}
                        alt={entry.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-end justify-center opacity-0 group-hover:opacity-100">
                        <div className="p-2 flex gap-1 w-full justify-center">
                          <Button variant="secondary" size="sm" onClick={() => openEdit(entry)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMutation.mutate(entry.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 group-hover:opacity-0 transition-opacity">
                        <p className="text-xs text-white truncate">{entry.title}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Regular entries (non-image) */}
          <div className="grid gap-4">
            {filtered
              .filter((e) => e.category !== "Overlay Images")
              .map((entry) => (
                <Card key={entry.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={categoryColors[entry.category] || ""}>
                            {entry.category}
                          </Badge>
                          <CardTitle className="text-base">{entry.title}</CardTitle>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Updated {new Date(entry.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed text-muted-foreground max-h-60 overflow-y-auto">
                      {entry.content}
                    </pre>
                  </CardContent>
                </Card>
              ))}
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isAdding || !!editEntry} onOpenChange={() => { setIsAdding(false); setEditEntry(null); setIsLocked(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{editEntry ? "Edit Entry" : "Add Entry"}</DialogTitle>
                <DialogDescription>
                  {editEntry
                    ? isLocked
                      ? "This entry is locked. Unlock to make changes."
                      : "Update this knowledgebase entry."
                    : "Add a new entry to your knowledgebase."}
                </DialogDescription>
              </div>
              {editEntry && (
                <Button
                  variant={isLocked ? "outline" : "secondary"}
                  size="sm"
                  onClick={() => setIsLocked(!isLocked)}
                  className="shrink-0 ml-4"
                >
                  {isLocked ? (
                    <><Lock className="h-4 w-4 mr-1.5" />Unlock to Edit</>
                  ) : (
                    <><Unlock className="h-4 w-4 mr-1.5" />Editing</>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })} disabled={isLocked && !!editEntry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Title</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Entry title"
                  disabled={isLocked && !!editEntry}
                />
              </div>
            </div>

            {/* Image upload for Overlay Images category */}
            {isImageCategory && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Image</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isLocked && !!editEntry}
                />
                {form.image_url ? (
                  <div className="relative rounded-lg overflow-hidden border bg-muted">
                    <img src={form.image_url} alt="Preview" className="w-full max-h-64 object-contain" />
                    {!(isLocked && !!editEntry) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center ${isLocked && !!editEntry ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary/50 hover:bg-muted/50"} transition-colors`}
                    onClick={() => !(isLocked && !!editEntry) && fileInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload an overlay image</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {isImageCategory ? "Description" : "Content"}
              </label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder={isImageCategory ? "Describe this image..." : "Enter guidelines, prompts, or rules..."}
                rows={isImageCategory ? 3 : 14}
                disabled={isLocked && !!editEntry}
              />
            </div>
            {!(isLocked && !!editEntry) && (
              <Button
                className="w-full"
                disabled={!form.title || (!isImageCategory && !form.content) || (isImageCategory && !form.image_url) || saveMutation.isPending}
                onClick={() => {
                  saveMutation.mutate({
                    id: editEntry?.id,
                    category: form.category,
                    title: form.title,
                    content: form.content || form.title,
                    image_url: form.image_url || undefined,
                  });
                  setIsLocked(true);
                }}
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  editEntry ? "Update Entry" : "Add Entry"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Knowledgebase;
