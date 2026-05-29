import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { isOnline, queueSyncAction, readWithOfflineCache } from "@/lib/offlineStore";

const defectReasons = ["Broken Packaging", "Spoiled Material", "Machine Error", "Contamination", "Label Defect", "Other"];

type Line = { batchId: string; quantity: number; reason: string };
const emptyLine = (): Line => ({ batchId: "", quantity: 1, reason: "" });

const Defects = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: defects = [], isLoading } = useQuery({
    queryKey: ["defects"],
    queryFn: async () => {
      return readWithOfflineCache("defects", async () => {
        const { data, error } = await supabase.from("defects").select("*, batches(*, products(*))").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      return readWithOfflineCache("batches", async () => {
        const { data, error } = await supabase.from("batches").select("*, products(name, variant)");
        if (error) throw error;
        return data || [];
      });
    },
  });

  const batchMap = useMemo(() => {
    const m = new Map<string, any>();
    batches.forEach((b: any) => m.set(b.id, b));
    return m;
  }, [batches]);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one defect entry");
      for (const [i, l] of lines.entries()) {
        if (!l.batchId) throw new Error(`Line ${i + 1}: select a batch`);
        if (l.quantity < 1) throw new Error(`Line ${i + 1}: quantity must be at least 1`);
        const b = batchMap.get(l.batchId);
        if (b && l.quantity > b.quantity_produced) throw new Error(`Line ${i + 1}: exceeds remaining batch stock`);
      }
      let offlineCount = 0;
      for (const l of lines) {
        const payload = { batch_id_value: l.batchId, quantity_value: l.quantity, reason_value: l.reason || undefined };
        if (!isOnline()) {
          await queueSyncAction({ module: "Defects", actionType: "rpc", rpcName: "log_defect", payload, userId: user?.id });
          offlineCount++;
          continue;
        }
        const { error } = await supabase.rpc("log_defect", payload);
        if (error) throw error;
      }
      return { offlineCount, total: lines.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["defects"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      setModalOpen(false);
      setLines([emptyLine()]);
      logAuditAction("CREATE", "Defects", `Logged ${result.total} defect entr${result.total === 1 ? "y" : "ies"}`, user?.id);
      toast.success(result.offlineCount ? `${result.total} defect(s) saved offline - Pending Sync` : `${result.total} defect(s) logged`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Defects & Wastage</h1>
          <p className="text-muted-foreground mt-1">Track defective items and production wastage.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Log Defects</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading...</div> : defects.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No defects recorded.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Product", "Batch Barcode", "Qty Defective", "Reason", "Date"].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {defects.map((d: any) => (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-sm text-foreground">{d.batches?.products?.name || "-"}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{d.batches?.batch_code || d.batch_id.slice(0, 8)}</td>
                    <td className="p-4 text-sm text-destructive font-medium">{d.quantity}</td>
                    <td className="p-4 text-sm text-muted-foreground">{d.reason || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Log Defects</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {lines.map((line, i) => {
              const sel = batchMap.get(line.batchId);
              return (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Entry {i + 1}</span>
                    {lines.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)} className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch *</Label>
                    <Select value={line.batchId} onValueChange={v => updateLine(i, { batchId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                      <SelectContent>
                        {batches.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.products?.name || "Unknown"} - {b.batch_code || b.id.slice(0, 8)} ({b.quantity_produced} remaining)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Qty Defective *</Label>
                      <Input type="number" min="1" max={sel?.quantity_produced ?? undefined} value={line.quantity}
                        onChange={e => updateLine(i, { quantity: Math.max(1, Number(e.target.value)) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
                      <Select value={line.reason} onValueChange={v => updateLine(i, { reason: v })}>
                        <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>
                          {defectReasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="outline" onClick={addLine} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Add Another Defect
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-primary text-primary-foreground">
              {createMutation.isPending ? "Saving..." : `Log ${lines.length} Defect${lines.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Defects;
