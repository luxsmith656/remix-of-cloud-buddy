import { supabase } from "@/integrations/supabase/client";
import { isOnline, queueSyncAction, upsertCachedRow } from "@/lib/offlineStore";

export const logAuditAction = async (
  action: string,
  module: string,
  details?: string,
  userId?: string
) => {
  try {
    const { data: authUser } = await supabase.auth.getUser();
    const userName = authUser.user?.email || authUser.user?.user_metadata?.username || null;
    const payload = {
      id: isOnline() ? crypto.randomUUID() : `local-${crypto.randomUUID()}`,
      action,
      module,
      details: details ? `${details}${isOnline() ? "" : " (created offline)"}` : isOnline() ? null : "Created offline",
      user_id: userId,
      user_name: userName,
      created_at: new Date().toISOString(),
    };

    if (!isOnline()) {
      await upsertCachedRow("audit_logs", { ...payload, sync_status: "Pending Sync" }, true);
      await queueSyncAction({
        module: "Audit Logs",
        actionType: "table-upsert",
        table: "audit_logs",
        payload,
        localId: payload.id,
        userId,
      });
      return;
    }

    const { error } = await supabase.from("audit_logs").insert(payload);

    if (error) {
      console.error("Failed to log audit action:", error);
    }
  } catch (error) {
    console.error("Audit logging error:", error);
  }
};
