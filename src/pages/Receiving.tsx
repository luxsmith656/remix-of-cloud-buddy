import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus } from "lucide-react";
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

type Ingredient = Tables<"ingredients">;
type Supplier = Tables<"suppliers">;

const NO_SUPPLIER = "none";
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  ingredient_id: "",
  supplier_id: NO_SUPPLIER,
  quantity: 1,
  unit_cost: 0,
  lot_number: "",
  invoice_number: "",
  received_date: today(),
  expiration_date: "",
  notes: "",
};

const Receiving = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["ingredient_receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredient_receipts")
        .select("*, ingredients(name, unit), suppliers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ingredients").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedIngredient = useMemo(
    () => (ingredients as Ingredient[]).find((ingredient) => ingredient.id === form.ingredient_id),
    [form.ingredient_id, ingredients],
  );

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!form.ingredient_id) throw new Error("Select an ingredient");
      if (form.quantity <= 0) throw new Error("Quantity must be greater than zero");
      if (form.unit_cost < 0) throw new Error("Unit cost cannot be negative");

      const { error } = await supabase.rpc("receive_ingredient", {
        ingredient_id_value: form.ingredient_id,
        quantity_value: form.quantity,
        supplier_id_value: form.supplier_id === NO_SUPPLIER ? undefined : form.supplier_id,
        unit_cost_value: form.unit_cost || undefined,
        lot_number_value: form.lot_number || undefined,
        invoice_number_value: form.invoice_number || undefined,
        received_date_value: form.received_date || undefined,
        expiration_date_value: form.expiration_date || undefined,
        notes_value: form.notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingredient_receipts"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_activity"] });
      setModalOpen(false);
      setForm(emptyForm);
      toast.success("Ingredient received and stock updated");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Receiving</h1>
          <p className="text-muted-foreground mt-1">Record incoming ingredients with supplier, lot, invoice, expiry, and cost details.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 sm:w-auto w-full">
          <Plus className="h-4 w-4" /> Receive Ingredient
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
                  {["Ingredient", "Qty", "Supplier", "Lot", "Invoice", "Unit Cost", "Total", "Received", "Expiry"].map((header) => (
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
                    <td className="p-4 text-sm text-muted-foreground">{receipt.unit_cost ? receipt.unit_cost.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{receipt.total_cost ? receipt.total_cost.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(receipt.received_date).toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-muted-foreground">{receipt.expiration_date ? new Date(receipt.expiration_date).toLocaleDateString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">Receive Ingredient</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Ingredient *</Label>
              <Select value={form.ingredient_id} onValueChange={(value) => setForm({ ...form, ingredient_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                <SelectContent>
                  {(ingredients as Ingredient[]).map((ingredient) => (
                    <SelectItem key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Math.max(0, Number(event.target.value)) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Cost</Label>
              <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setForm({ ...form, unit_cost: Math.max(0, Number(event.target.value)) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(value) => setForm({ ...form, supplier_id: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>Use ingredient supplier</SelectItem>
                  {(suppliers as Supplier[]).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Received Date</Label>
              <Input type="date" value={form.received_date} onChange={(event) => setForm({ ...form, received_date: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Lot Number</Label>
              <Input value={form.lot_number} onChange={(event) => setForm({ ...form, lot_number: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Number</Label>
              <Input value={form.invoice_number} onChange={(event) => setForm({ ...form, invoice_number: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
              <Input type="date" value={form.expiration_date} onChange={(event) => setForm({ ...form, expiration_date: event.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <PackagePlus className="inline mr-2 h-4 w-4" />
            {selectedIngredient ? `${selectedIngredient.name} stock will increase immediately after save.` : "Select an ingredient to receive stock."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending} className="bg-primary text-primary-foreground">
              {receiveMutation.isPending ? "Receiving..." : "Receive Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Receiving;
