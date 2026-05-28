import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";

const defectReasons = ["Broken Packaging", "Spoiled Material", "Machine Error", "Contamination", "Label Defect", "Other"];

const Defects = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: defects = [], isLoading } = useQuery({
    queryKey: ["defects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("defects").select("*, batches(*, products(*))").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*, products(name, variant)");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedBatch = useMemo(
    () => batches.find((batch: any) => batch.id === batchId),
    [batchId, batches],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error("Select a batch");
      if (quantity < 1) throw new Error("Quantity must be at least 1");
      if (selectedBatch && quantity > selectedBatch.quantity_produced) {
        throw new Error("Defect quantity cannot exceed remaining batch stock");
      }
      const { error } = await supabase.rpc("log_defect", {
        batch_id_value: batchId,
        quantity_value: quantity,
        reason_value: reason || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["defects"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      setModalOpen(false);
      setBatchId(""); setQuantity(1); setReason("");
      logAuditAction("CREATE", "Defects", `Logged defect: ${quantity} units for batch ${batchId}`, user?.id);
      toast.success("Defect logged successfully");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Defects & Wastage</h1>
          <p className="text-muted-foreground mt-1">Track defective items and production wastage.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Log Defect</Button>
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

      {/* Log Defect Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Log Defect</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch *</Label>
              <Select value={batchId} onValueChange={setBatchId}>
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
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Qty Defective *</Label>
              <Input type="number" min="1" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {defectReasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-primary text-primary-foreground">
              {createMutation.isPending ? "Saving..." : "Log Defect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Defects;
