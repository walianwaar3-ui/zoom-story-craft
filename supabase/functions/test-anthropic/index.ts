import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ connected: false, error: "ANTHROPIC_API_KEY not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (res.ok) {
      const data = await res.json();
      const model = data?.model || "claude-sonnet-4-5";
      return new Response(
        JSON.stringify({ connected: true, model, provider: "Anthropic" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errBody = await res.text();
    let reason = `HTTP ${res.status}`;
    if (res.status === 401) reason = "Invalid API key";
    else if (res.status === 429) reason = "Rate limited";
    else if (res.status === 529) reason = "Anthropic API overloaded";
    else if (res.status === 400) reason = "Bad request — check model name";

    return new Response(
      JSON.stringify({ connected: false, error: reason, detail: errBody.slice(0, 500) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    return new Response(
      JSON.stringify({
        connected: false,
        error: isTimeout ? "Connection timed out" : (e instanceof Error ? e.message : "Unknown error"),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
