import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";
import { isOnline, queueSyncAction, readWithOfflineCache } from "@/lib/offlineStore";

type Ingredient = Tables<"ingredients">;
type Supplier = Tables<"suppliers">;

const NO_SUPPLIER = "none";
const today = () => new Date().toISOString().slice(0, 10);

type Line = {
  ingredient_id: string;
  supplier_id: string;
  quantity: number;
  unit_cost: number;
  lot_number: string;
  expiration_date: string;
};

const emptyLine = (): Line => ({
  ingredient_id: "",
  supplier_id: NO_SUPPLIER,
  quantity: 1,
  unit_cost: 0,
  lot_number: "",
  expiration_date: "",
});

const Receiving = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const resetForm = () => {
    setLines([emptyLine()]);
    setInvoiceNumber("");
    setReceivedDate(today());
    setNotes("");
  };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["ingredient_receipts"],
    queryFn: async () =>
      readWithOfflineCache("ingredient_receipts", async () => {
        const { data, error } = await supabase
          .from("ingredient_receipts")
          .select("*, ingredients(name, unit), suppliers(name)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }),
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () =>
      readWithOfflineCache("ingredients", async () => {
        const { data, error } = await supabase.from("ingredients").select("*").order("name");
        if (error) throw error;
        return data || [];
      }),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () =>
      readWithOfflineCache("suppliers", async () => {
        const { data, error } = await supabase.from("suppliers").select("*").order("name");
        if (error) throw error;
        return data || [];
      }),
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one ingredient");
      lines.forEach((l, i) => {
        if (!l.ingredient_id) throw new Error(`Row ${i + 1}: select an ingredient`);
        if (l.quantity <= 0) throw new Error(`Row ${i + 1}: quantity must be greater than zero`);
        if (l.unit_cost < 0) throw new Error(`Row ${i + 1}: unit cost cannot be negative`);
      });

      let offline = false;
      for (const l of lines) {
        const payload = {
          ingredient_id_value: l.ingredient_id,
          quantity_value: l.quantity,
          supplier_id_value: l.supplier_id === NO_SUPPLIER ? null : l.supplier_id,
          unit_cost_value: l.unit_cost || null,
          lot_number_value: l.lot_number || null,
          invoice_number_value: invoiceNumber || null,
          received_date_value: receivedDate || null,
          expiration_date_value: l.expiration_date || null,
          notes_value: notes || null,
        };
        if (!isOnline()) {
          await queueSyncAction({ module: "Receiving", actionType: "rpc", rpcName: "receive_ingredient", payload });
          offline = true;
        } else {
          const { error } = await supabase.rpc("receive_ingredient", payload as any);
          if (error) throw error;
        }
      }
      return { offline, count: lines.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ingredient_receipts"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_activity"] });
      setModalOpen(false);
      resetForm();
      toast.success(
        result.offline
          ? `${result.count} receipt(s) saved offline - Pending Sync`
          : `${result.count} ingredient(s) received and stock updated`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Receiving</h1>
          <p className="text-muted-foreground mt-1">Record one or many incoming ingredients in a single receiving session.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 sm:w-auto w-full">
          <Plus className="h-4 w-4" /> Receive Ingredients
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading receipts...</div>
          ) : receipts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No ingredient receipts yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Ingredient", "Qty", "Supplier", "Lot", "Invoice", "Received", "Expiry"].map((header) => (
                    <th key={header} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt: any) => (
                  <tr key={receipt.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-sm font-medium text-foreground">{receipt.ingredients?.name || "Unknown"}</td>
                    <td className="p-4 text-sm text-foreground">{receipt.quantity} {receipt.ingredients?.unit || ""}</td>
                    <td className="p-4 text-sm text-muted-foreground">{receipt.suppliers?.name || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{receipt.lot_number || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{receipt.invoice_number || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(receipt.received_date).toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-muted-foreground">{receipt.expiration_date ? new Date(receipt.expiration_date).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Receive Ingredients</DialogTitle></DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Received Date</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Ingredients ({lines.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])} className="gap-1">
                <Plus className="h-3 w-3" /> Add Ingredient
              </Button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="rounded-md border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Row {idx + 1}</span>
                  {lines.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Ingredient *</Label>
                    <Select value={line.ingredient_id} onValueChange={(v) => updateLine(idx, { ingredient_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                      <SelectContent>
                        {(ingredients as Ingredient[]).map((ing) => (
                          <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity *</Label>
                    <Input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: Math.max(0, Number(e.target.value)) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier</Label>
                    <Select value={line.supplier_id} onValueChange={(v) => updateLine(idx, { supplier_id: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SUPPLIER}>Use ingredient supplier</SelectItem>
                        {(suppliers as Supplier[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lot Number</Label>
                    <Input value={line.lot_number} onChange={(e) => updateLine(idx, { lot_number: e.target.value })} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                    <Input type="date" value={line.expiration_date} onChange={(e) => updateLine(idx, { expiration_date: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <PackagePlus className="inline mr-2 h-4 w-4" />
            {lines.length} ingredient(s) will be received and stock updated.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending} className="bg-primary text-primary-foreground">
              {receiveMutation.isPending ? "Receiving..." : `Receive ${lines.length} Item(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Receiving;
