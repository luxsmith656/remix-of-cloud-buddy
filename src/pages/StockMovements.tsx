import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, ArrowUp, RefreshCw, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Enums } from "@/integrations/supabase/types";
import { isOnline, queueSyncAction, readWithOfflineCache } from "@/lib/offlineStore";

const typeIcons = { IN: ArrowDown, OUT: ArrowUp, ADJUSTMENT: RefreshCw };
const typeStyles = { IN: "text-success", OUT: "text-destructive", ADJUSTMENT: "text-warning" };

type Line = {
  item_type: Enums<"movement_item_type">;
  item_id: string;
  qty: number;
};

const emptyLine = (): Line => ({ item_type: "ingredient", item_id: "", qty: 1 });

const StockMovements = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [moveType, setMoveType] = useState<Enums<"movement_type">>("IN");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const queryClient = useQueryClient();

  const resetForm = () => { setLines([emptyLine()]); setRemarks(""); setMoveType("IN"); };
  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () =>
      readWithOfflineCache("stock_movements", async () => {
        const { data, error } = await supabase.from("stock_movements").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }),
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => readWithOfflineCache("ingredients", async () => { const { data } = await supabase.from("ingredients").select("*"); return data || []; }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => readWithOfflineCache("products", async () => { const { data } = await supabase.from("products").select("*"); return data || []; }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one item");
      if (!remarks.trim()) throw new Error("Reason is required");
      lines.forEach((l, i) => {
        if (!l.item_id) throw new Error(`Row ${i + 1}: select an item`);
        if (l.qty <= 0) throw new Error(`Row ${i + 1}: quantity must be positive`);
      });

      let offline = false;
      for (const l of lines) {
        const actualQty = moveType === "OUT" ? -l.qty : l.qty;
        const payload = {
          item_type_value: l.item_type,
          item_id_value: l.item_id,
          quantity_value: actualQty,
          reason_value: remarks || `${moveType} adjustment request`,
        };
        if (!isOnline()) {
          await queueSyncAction({ module: "Stock Movements", actionType: "rpc", rpcName: "request_inventory_adjustment", payload });
          offline = true;
        } else {
          const { error } = await supabase.rpc("request_inventory_adjustment", payload);
          if (error) throw error;
        }
      }
      return { offline, count: lines.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_adjustment_requests"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
      resetForm();
      toast.success(result.offline ? `${result.count} adjustment(s) saved offline - Pending Sync` : `${result.count} adjustment request(s) submitted`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Stock Movements</h1>
          <p className="text-muted-foreground mt-1">Complete ledger of all inventory transactions.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Request Adjustments</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> : movements.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No stock movements recorded.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Type", "Item", "Batch Barcode", "Category", "Quantity", "Date", "Remarks"].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const Icon = typeIcons[m.type];
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <span className={`flex items-center gap-1.5 text-sm font-medium ${typeStyles[m.type]}`}>
                          <Icon className="h-4 w-4" /> {m.type}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground">{m.item_name}</td>
                      <td className="p-4 text-sm text-muted-foreground">{(m as any).batch_code || "-"}</td>
                      <td className="p-4"><span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">{m.item_type}</span></td>
                      <td className="p-4 text-sm font-medium text-foreground">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(m.created_at).toLocaleString()}</td>
                      <td className="p-4 text-sm text-muted-foreground">{m.remarks || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Request Stock Adjustments</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Movement Type</Label>
              <Select value={moveType} onValueChange={(v: any) => setMoveType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Stock In</SelectItem>
                  <SelectItem value="OUT">Stock Out</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Items ({lines.length})</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])} className="gap-1">
                  <Plus className="h-3 w-3" /> Add Item
                </Button>
              </div>
              {lines.map((line, idx) => {
                const items = line.item_type === "ingredient" ? ingredients : products;
                return (
                  <div key={idx} className="rounded-md border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Row {idx + 1}</span>
                      {lines.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item Type</Label>
                        <Select value={line.item_type} onValueChange={(v: any) => updateLine(idx, { item_type: v, item_id: "" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ingredient">Ingredient</SelectItem>
                            <SelectItem value="product">Product</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity *</Label>
                        <Input type="number" min="1" value={line.qty} onChange={(e) => updateLine(idx, { qty: Math.max(1, Number(e.target.value)) })} />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Item *</Label>
                        <Select value={line.item_id} onValueChange={(v) => updateLine(idx, { item_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason * (applies to all items)</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Explain why this stock change is needed..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-primary text-primary-foreground">
              {createMutation.isPending ? "Saving..." : `Submit ${lines.length} Request(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockMovements;
