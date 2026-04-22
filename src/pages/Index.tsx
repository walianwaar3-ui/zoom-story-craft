import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Video, FileText, Sparkles, TrendingUp, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

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
      href: "/zoom-posts",
    },
    {
      title: "Ready to Generate",
      value: newTranscripts ?? 0,
      icon: Sparkles,
      description: "New transcripts waiting",
      href: "/zoom-posts",
      accent: true,
    },
    {
      title: "Posts Generated",
      value: posts ?? 0,
      icon: FileText,
      description: "Social posts created",
      href: "/generated",
    },
    {
      title: "Pipeline Status",
      value: "Active",
      icon: TrendingUp,
      description: "Post → Comment → DM → Workshop",
      href: "/generate-post",
    },
  ];

  const steps = [
    {
      n: "01",
      title: "Capture the call",
      body: "Zoom recordings flow in automatically via webhook the moment a call ends.",
    },
    {
      n: "02",
      title: "Generate with intent",
      body: "Pick a transcript, choose your angle, and ship a caption + image in one click.",
    },
    {
      n: "03",
      title: "Publish & convert",
      body: "Push to GoHighLevel. Watch the pipeline: Post → Comment → DM → Workshop.",
    },
  ];

  return (
    <div className="space-y-10">
      <header className="page-header">
        <div>
          <p className="eyebrow mb-3">Workspace overview</p>
          <h1 className="page-title">Welcome back.</h1>
          <p className="page-subtitle">
            Turn the conversations you're already having into authority-building social posts —
            without rewriting a single line.
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} to={stat.href} className="group">
            <Card
              className={`card-elevated h-full transition-all duration-200 group-hover:-translate-y-0.5 ${
                stat.accent ? "ring-1 ring-primary/20 bg-accent/40" : ""
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      stat.accent ? "bg-gradient-brand text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <stat.icon className="h-4 w-4" strokeWidth={2.25} />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                  {stat.title}
                </p>
                <div className="font-display text-4xl text-foreground leading-none">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-2">{stat.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="eyebrow mb-2">The flow</p>
            <h2 className="font-display text-2xl text-foreground">How it works</h2>
          </div>
          <p className="text-xs text-muted-foreground hidden sm:block">Three steps. Zero friction.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.n} className="card-elevated">
              <CardContent className="p-6">
                <div className="font-display text-3xl text-primary mb-4 leading-none">{step.n}</div>
                <h3 className="font-semibold text-foreground mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Index;
