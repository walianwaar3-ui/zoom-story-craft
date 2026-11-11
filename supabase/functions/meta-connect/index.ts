import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH = "https://graph.facebook.com/v21.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Never send the access token to the browser — only these fields.
function toStatus(row: any) {
  if (!row) return { connected: false };
  return {
    connected: !row.last_check_error,
    ad_account_id: row.ad_account_id,
    ad_account_name: row.ad_account_name,
    business_name: row.business_name,
    page_name: row.page_name,
    currency: row.currency,
    connected_at: row.connected_at,
    last_checked_at: row.last_checked_at,
    error: row.last_check_error,
  };
}

async function fetchGraph(path: string, token: string) {
  const url = `${GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Meta API error (HTTP ${res.status})`;
    const code = data?.error?.code;
    const subcode = data?.error?.error_subcode;
    let hint = "";
    if (code === 100 && subcode === 1885183) {
      hint =
        " Your Meta app is still in Development mode — switch it to Live in App Review, or add this ad account's business as a tester, before it can create ad creatives.";
    }
    throw new Error(`${message}${hint}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    const supabase = admin();

    if (action === "status") {
      const { data } = await supabase
        .from("meta_connections")
        .select("*")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return json(toStatus(data));
    }

    if (action === "disconnect") {
      await supabase.from("meta_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return json({ connected: false });
    }

    if (action === "connect") {
      const accessToken = (body.access_token || "").trim();
      const adAccountId = (body.ad_account_id || "").trim().replace(/^act_/, "");

      if (!accessToken || !adAccountId) {
        return json({ error: "access_token and ad_account_id are required" }, 400);
      }

      const account = await fetchGraph(
        `/act_${adAccountId}?fields=name,account_status,currency,business_name`,
        accessToken,
      );

      let pageId: string | null = null;
      let pageName: string | null = null;
      try {
        const pages = await fetchGraph(`/me/accounts?fields=id,name&limit=1`, accessToken);
        const first = pages?.data?.[0];
        if (first) {
          pageId = first.id;
          pageName = first.name;
        }
      } catch {
        // No managed Page is fine — the assistant can still create traffic/awareness ads
        // that don't require a linked Page, it just narrows what it can do.
      }

      // Single-row table: clear any previous connection before inserting the new one.
      await supabase.from("meta_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { data: row, error } = await supabase
        .from("meta_connections")
        .insert({
          access_token: accessToken,
          ad_account_id: adAccountId,
          ad_account_name: account.name,
          business_name: account.business_name || null,
          page_id: pageId,
          page_name: pageName,
          currency: account.currency,
          last_check_error: null,
        })
        .select()
        .single();

      if (error) throw error;
      return json(toStatus(row));
    }

    if (action === "check") {
      const { data: row } = await supabase
        .from("meta_connections")
        .select("*")
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ connected: false });

      try {
        const account = await fetchGraph(
          `/act_${row.ad_account_id}?fields=name,currency,business_name`,
          row.access_token,
        );
        const { data: updated } = await supabase
          .from("meta_connections")
          .update({
            ad_account_name: account.name,
            business_name: account.business_name || null,
            currency: account.currency,
            last_checked_at: new Date().toISOString(),
            last_check_error: null,
          })
          .eq("id", row.id)
          .select()
          .single();
        return json(toStatus(updated));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Connection check failed";
        const { data: updated } = await supabase
          .from("meta_connections")
          .update({ last_checked_at: new Date().toISOString(), last_check_error: message })
          .eq("id", row.id)
          .select()
          .single();
        return json(toStatus(updated));
      }
    }

    return json({ error: "Invalid action. Use action: 'status', 'connect', 'check', or 'disconnect'" }, 400);
  } catch (e) {
    console.error("meta-connect error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
