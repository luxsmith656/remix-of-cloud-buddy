import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { readWithOfflineCache } from "@/lib/offlineStore";

const actionColors: Record<string, string> = {
  CREATE: "bg-success/10 text-success",
  UPDATE: "bg-info/10 text-info",
  DELETE: "bg-destructive/10 text-destructive",
  ADJUSTMENT: "bg-warning/10 text-warning",
};

const AuditLogs = () => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      return readWithOfflineCache("audit_logs", async () => {
        const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">Complete history of all system actions.</p>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> : logs.length === 0 ? (
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
                {logs.map(l => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-sm text-foreground">{l.user_name || "System"}</td>
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
