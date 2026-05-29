import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { readWithOfflineCache } from "@/lib/offlineStore";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

const actionColors: Record<string, string> = {
  CREATE: "bg-success/10 text-success",
  UPDATE: "bg-info/10 text-info",
  DELETE: "bg-destructive/10 text-destructive",
  ADJUSTMENT: "bg-warning/10 text-warning",
};

const AuditLogs = () => {
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      return readWithOfflineCache("audit_logs", async () => {
        const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      return readWithOfflineCache("profiles", async () => {
        const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const profilesByUserId = useMemo(
    () => new Map(profiles.map((profile: Profile) => [profile.user_id, profile])),
    [profiles],
  );

  const getUserLabel = (log: any) => {
    if (log.user_name) return log.user_name;
    const profile = log.user_id ? profilesByUserId.get(log.user_id) : undefined;
    return profile?.full_name || profile?.username || "System";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Finance Logs</h1>
        <p className="text-muted-foreground mt-1">Complete history of all system actions and financial events.</p>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {logsLoading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No audit logs yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["User", "Action", "Module", "Details", "Timestamp"].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l: any) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-sm text-foreground">{getUserLabel(l)}</td>
                    <td className="p-4"><span className={`text-xs font-medium px-2 py-1 rounded-full ${actionColors[l.action] || ""}`}>{l.action}</span></td>
                    <td className="p-4 text-sm text-muted-foreground">{l.module}</td>
                    <td className="p-4 text-sm text-muted-foreground max-w-xs truncate">
                      {l.details}
                      {(l as any).sync_status && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">{(l as any).sync_status}</span>}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLogs;
