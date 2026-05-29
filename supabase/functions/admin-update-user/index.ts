import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin.from("user_roles")
      .select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Admin role required" }, 403);

    const body = await req.json();
    const targetUserId: string = body.target_user_id;
    const username: string | undefined = body.username;
    const full_name: string | undefined = body.full_name;
    const password: string | undefined = body.password;

    if (!targetUserId) return json({ error: "target_user_id required" }, 400);

    if (typeof password === "string" && password.length > 0) {
      if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { password });
      if (error) return json({ error: error.message }, 400);
    }

    const profilePatch: Record<string, unknown> = {};
    if (typeof username === "string") profilePatch.username = username.trim() || null;
    if (typeof full_name === "string") profilePatch.full_name = full_name.trim() || null;
    if (Object.keys(profilePatch).length) {
      const { error } = await admin.from("profiles").update(profilePatch).eq("user_id", targetUserId);
      if (error) return json({ error: error.message }, 400);
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      user_name: user.email,
      action: "UPDATE",
      module: "Role Management",
      details: `Updated staff ${targetUserId}${password ? " (password reset)" : ""}`,
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
