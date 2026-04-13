import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, FileText, Sparkles, TrendingUp } from "lucide-react";

const Index = () => {
  const { data: transcripts } = useQuery({
    queryKey: ["transcripts-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("zoom_transcripts")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["posts-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("generated_content")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: newTranscripts } = useQuery({
    queryKey: ["new-transcripts-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("zoom_transcripts")
        .select("*", { count: "exact", head: true })
        .eq("status", "new");
      return count || 0;
    },
  });

  const stats = [
    {
      title: "Total Transcripts",
      value: transcripts ?? 0,
      icon: Video,
      description: "Zoom calls received",
    },
    {
      title: "Ready to Generate",
      value: newTranscripts ?? 0,
      icon: Sparkles,
      description: "New transcripts waiting",
    },
    {
      title: "Posts Generated",
      value: posts ?? 0,
      icon: FileText,
      description: "Social posts created",
    },
    {
      title: "Conversion Pipeline",
      value: "Active",
      icon: TrendingUp,
      description: "Post → Comment → DM → Workshop",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </h2>
        <p className="text-muted-foreground mt-1">
          Turn your Zoom call recordings into authority-building social posts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="text-lg font-bold">1</span>
              </div>
              <h3 className="font-semibold">Zapier Sends Transcript</h3>
              <p className="text-sm text-muted-foreground">
                Your Zoom recordings are automatically sent via Zapier webhook when a call ends.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="text-lg font-bold">2</span>
              </div>
              <h3 className="font-semibold">Review & Generate</h3>
              <p className="text-sm text-muted-foreground">
                Browse transcripts, add custom prompts, and generate caption + image posts.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <span className="text-lg font-bold">3</span>
              </div>
              <h3 className="font-semibold">Post & Convert</h3>
              <p className="text-sm text-muted-foreground">
                Copy your post to Facebook. Watch the pipeline: Post → Comment → DM → Workshop.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
