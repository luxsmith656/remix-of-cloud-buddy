import { ReactNode, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, User, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { PwaStatusBar } from "@/components/PwaStatusBar";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts-unresolved"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    refetchInterval: 30000,
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alerts").update({ resolved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts-unresolved"] });
      queryClient.invalidateQueries({ queryKey: ["alerts-all"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const urgentCount = alerts.filter(a => a.urgent).length;
  const totalCount = alerts.length;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <PwaStatusBar />
          <header className="h-16 flex items-center justify-between border-b border-border px-4 bg-card shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground" />
            </div>
            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="relative text-muted-foreground hover:text-foreground transition-colors">
                    <Bell className="h-5 w-5" />
                    {totalCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                        {totalCount > 9 ? "9+" : totalCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <h4 className="font-heading font-semibold text-sm">Notifications</h4>
                    {urgentCount > 0 && (
                      <span className="text-xs font-medium text-destructive">{urgentCount} urgent</span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">No new notifications</p>
                    ) : (
                      alerts.map(a => (
                        <div key={a.id} className={`p-3 border-b border-border last:border-0 flex items-start gap-2 ${a.urgent ? "bg-destructive/5" : ""}`}>
                          <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${a.urgent ? "bg-destructive" : "bg-warning"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground leading-snug">{a.message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                a.type === "critical" ? "bg-destructive/10 text-destructive" :
                                a.type === "low-stock" ? "bg-warning/10 text-warning" :
                                "bg-info/10 text-info"
                              }`}>{a.type}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => resolveMutation.mutate(a.id)}
                            className="text-muted-foreground hover:text-success transition-colors shrink-0"
                            title="Mark as resolved"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  {alerts.length > 0 && (
                    <div className="p-2 border-t border-border">
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/alerts")}>
                        View all alerts
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground hidden sm:block">{user?.user_metadata?.username || user?.email || "Admin"}</span>
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
