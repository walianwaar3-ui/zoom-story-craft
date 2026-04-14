import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FATHOM_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "FATHOM_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    const fathomHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // ACTION: list — list meetings from Fathom with optional search/pagination
    if (action === "list") {
      const { cursor, search } = body;
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      // Fathom doesn't have a search param, so we fetch and filter client-side
      // Include summary for preview
      params.set("include_summary", "true");

      const url = `${FATHOM_API_BASE}/meetings?${params.toString()}`;
      console.log("Fetching Fathom meetings:", url);

      const resp = await fetch(url, { headers: fathomHeaders });
      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Fathom API error:", resp.status, errText);
        return new Response(JSON.stringify({ error: `Fathom API error: ${resp.status}` }), {
          status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      let items = data.items || [];

      // Client-side search filter on title
      if (search) {
        const q = search.toLowerCase();
        items = items.filter((m: any) =>
          (m.title || "").toLowerCase().includes(q) ||
          (m.meeting_title || "").toLowerCase().includes(q)
        );
      }

      return new Response(JSON.stringify({
        items: items.map((m: any) => ({
          recording_id: m.recording_id,
          title: m.title || m.meeting_title || "Untitled",
          meeting_title: m.meeting_title,
          created_at: m.created_at,
          scheduled_start_time: m.scheduled_start_time,
          share_url: m.share_url,
          calendar_invitees: m.calendar_invitees || [],
          recorded_by: m.recorded_by,
          summary_preview: m.default_summary?.markdown_formatted?.slice(0, 200) || null,
        })),
        next_cursor: data.next_cursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: import — fetch full transcript + summary and insert into zoom_transcripts
    if (action === "import") {
      const { recording_id, title, scheduled_start_time, calendar_invitees, share_url } = body;

      if (!recording_id) {
        return new Response(JSON.stringify({ error: "recording_id is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch transcript and summary in parallel
      const [transcriptResp, summaryResp] = await Promise.all([
        fetch(`${FATHOM_API_BASE}/recordings/${recording_id}/transcript`, { headers: fathomHeaders }),
        fetch(`${FATHOM_API_BASE}/recordings/${recording_id}/summary`, { headers: fathomHeaders }),
      ]);

      let transcript = "";
      if (transcriptResp.ok) {
        const tData = await transcriptResp.json();
        // tData is an array of {speaker: {name}, text, timestamp}
        if (Array.isArray(tData)) {
          transcript = tData.map((seg: any) => {
            const speaker = seg.speaker?.name || seg.speaker || "Speaker";
            return `${speaker}: ${seg.text || ""}`;
          }).join("\n");
        } else if (typeof tData === "string") {
          transcript = tData;
        } else {
          transcript = JSON.stringify(tData);
        }
      } else {
        console.warn("Failed to fetch transcript:", transcriptResp.status);
      }

      let summary = "";
      if (summaryResp.ok) {
        const sData = await summaryResp.json();
        summary = sData?.markdown_formatted || sData?.text || "";
      } else {
        console.warn("Failed to fetch summary:", summaryResp.status);
      }

      // Extract client name from invitees
      const invitees = calendar_invitees || [];
      const recordedByEmail = body.recorded_by?.email || "";
      const externalInvitee = invitees.find((inv: any) => inv.email !== recordedByEmail && inv.is_external);
      const client_name = externalInvitee?.name || invitees[0]?.name || "";

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: inserted, error } = await supabaseAdmin
        .from("zoom_transcripts")
        .insert({
          meeting_topic: title || "Untitled Meeting",
          meeting_date: scheduled_start_time || new Date().toISOString(),
          summary: summary || null,
          transcript: transcript || null,
          client_name: client_name || null,
          status: "new",
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, id: inserted.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use 'list' or 'import'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
