import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type ProductDispatch = Tables<"product_dispatches">;
type IngredientReceipt = Tables<"ingredient_receipts">;

const activityStyles: Record<string, string> = {
  RECEIPT: "bg-success/10 text-success",
  DISPATCH: "bg-destructive/10 text-destructive",
  PRODUCTION: "bg-info/10 text-info",
  DEFECT: "bg-warning/10 text-warning",
  ADJUSTMENT: "bg-accent text-accent-foreground",
};

const InventoryActivity = () => {
  const [search, setSearch] = useState("");

  const { data: activity = [], isLoading } = useQuery({
    queryKey: ["inventory_activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ["product_dispatches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_dispatches").select("id,total_value");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ["ingredient_receipts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ingredient_receipts").select("id,total_cost");
      if (error) throw error;
      return data || [];
    },
  });

  const profilesByUserId = useMemo(
    () => new Map(profiles.map((profile: Profile) => [profile.user_id, profile])),
    [profiles],
  );

  const getUserLabel = (entry: any) => {
    const profile = entry.user_id ? profilesByUserId.get(entry.user_id) : undefined;
    return profile?.full_name || profile?.username || entry.user_id || "System";
  };

  const getEntryAmount = (entry: any) => {
    if (entry.reference_table === "product_dispatches") {
      return dispatches.find((dispatch: ProductDispatch) => dispatch.id === entry.reference_id)?.total_value;
    }
    if (entry.reference_table === "ingredient_receipts") {
      return receipts.find((receipt: IngredientReceipt) => receipt.id === entry.reference_id)?.total_cost;
    }
    return undefined;
  };

  const filtered = activity.filter((entry) => {
    const normalizedSearch = search.toLowerCase();
    const userLabel = getUserLabel(entry).toLowerCase();
    return (
      entry.item_name.toLowerCase().includes(normalizedSearch) ||
      entry.activity_type.toLowerCase().includes(normalizedSearch) ||
      (entry.details || "").toLowerCase().includes(normalizedSearch) ||
      userLabel.includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Inventory Activity</h1>
          <p className="text-muted-foreground mt-1">A searchable operational timeline for receipts, dispatches, stock changes, and production events.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search activity..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10 h-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading activity...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No matching inventory activity.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Activity", "User", "Item", "Type", "Quantity", "Details", "Reference", "Date"].map((header) => (
                    <th key={header} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const amount = getEntryAmount(entry);
                  return (
                    <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${activityStyles[entry.activity_type] || "bg-muted text-muted-foreground"}`}>
                          <Activity className="h-3.5 w-3.5" /> {entry.activity_type}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground">{getUserLabel(entry)}</td>
                      <td className="p-4 text-sm font-medium text-foreground">{entry.item_name}</td>
                      <td className="p-4 text-sm text-muted-foreground capitalize">{entry.item_type}</td>
                      <td className="p-4 text-sm font-medium text-foreground">{entry.quantity && entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{entry.details || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{entry.reference_table ? `${entry.reference_table.replace("_", " ")} #${entry.reference_id?.slice(0, 8)}` : "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryActivity;
