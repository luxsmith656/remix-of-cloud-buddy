import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageMinus, Plus } from "lucide-react";
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

type Product = Tables<"products">;
type Batch = Tables<"batches">;

const NO_BATCH = "none";
const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  product_id: "",
  batch_id: NO_BATCH,
  dispatch_type: "sale",
  destination: "",
  reference_number: "",
  quantity: 1,
  unit_price: 0,
  dispatched_date: today(),
  notes: "",
};

const dispatchTypes = [
  { value: "sale", label: "Sale" },
  { value: "delivery", label: "Delivery" },
  { value: "transfer", label: "Transfer" },
  { value: "sample", label: "Sample" },
  { value: "return", label: "Return" },
  { value: "other", label: "Other" },
];

const isMissingAlertFunctionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("create_inventory_alert") && message.includes("does not exist");
};

const Dispatch = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const queryClient = useQueryClient();

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["product_dispatches"],
    queryFn: async () => {
      return readWithOfflineCache("product_dispatches", async () => {
        const { data, error } = await supabase
          .from("product_dispatches")
          .select("*, products(name, variant), batches(batch_code, production_date, expiration_date)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      return readWithOfflineCache("products", async () => {
        const { data, error } = await supabase.from("products").select("*").order("name");
        if (error) throw error;
        return data || [];
      });
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      return readWithOfflineCache("batches", async () => {
        const { data, error } = await supabase.from("batches").select("*").gt("quantity_produced", 0).order("expiration_date");
        if (error) throw error;
        return data || [];
      });
    },
  });

  const selectedProduct = useMemo(
    () => (products as Product[]).find((product) => product.id === form.product_id),
    [form.product_id, products],
  );

  const productBatches = useMemo(
    () => (batches as Batch[]).filter((batch) => batch.product_id === form.product_id),
    [batches, form.product_id],
  );

  const selectedBatch = useMemo(
    () => productBatches.find((batch) => batch.id === form.batch_id),
    [form.batch_id, productBatches],
  );

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      if (!form.product_id) throw new Error("Select a product");
      if (form.quantity <= 0) throw new Error("Quantity must be greater than zero");
      if (form.unit_price < 0) throw new Error("Unit price cannot be negative");
      if (selectedProduct && form.quantity > selectedProduct.quantity) throw new Error("Not enough product stock");
      if (selectedBatch && form.quantity > selectedBatch.quantity_produced) {
        throw new Error("Not enough stock in the selected batch");
      }

      const payload = {
        product_id_value: form.product_id,
        quantity_value: form.quantity,
        batch_id_value: form.batch_id === NO_BATCH ? undefined : form.batch_id,
        dispatch_type_value: form.dispatch_type,
        destination_value: form.destination || null,
        reference_number_value: form.reference_number || null,
        unit_price_value: form.unit_price || null,
        dispatched_date_value: form.dispatched_date || null,
        notes_value: form.notes || null,
      };
      if (!isOnline()) {
        await queueSyncAction({ module: "Dispatch", actionType: "rpc", rpcName: "dispatch_product", payload });
        return { offline: true };
      }
      const { error } = await supabase.rpc("dispatch_product", payload as any);
      if (!error) return;
      if (!isMissingAlertFunctionError(error)) throw error;

      const nextProductQuantity = (selectedProduct?.quantity ?? 0) - form.quantity;
      const batchCode = selectedBatch?.batch_code ?? null;

      if (selectedBatch) {
        const { error: batchError } = await supabase
          .from("batches")
          .update({ quantity_produced: selectedBatch.quantity_produced - form.quantity } as any)
          .eq("id", selectedBatch.id);
        if (batchError) throw batchError;
      }

      const { data: dispatch, error: dispatchError } = await supabase
        .from("product_dispatches")
        .insert({
          product_id: form.product_id,
          batch_id: form.batch_id === NO_BATCH ? null : form.batch_id,
          dispatch_type: form.dispatch_type,
          destination: form.destination.trim() || null,
          reference_number: form.reference_number.trim() || null,
          quantity: form.quantity,
          unit_price: form.unit_price || null,
          dispatched_date: form.dispatched_date || today(),
          notes: form.notes.trim() || null,
        } as any)
        .select("id")
        .single();
      if (dispatchError) throw dispatchError;

      const { error: productError } = await supabase
        .from("products")
        .update({
          quantity: nextProductQuantity,
          unit_price: form.unit_price || selectedProduct?.unit_price || 0,
        } as any)
        .eq("id", form.product_id);
      if (productError) throw productError;

      const remarks = `Dispatched product${batchCode ? ` / batch ${batchCode}` : ""}${form.reference_number.trim() ? ` / ref ${form.reference_number.trim()}` : ""}${form.destination.trim() ? ` / to ${form.destination.trim()}` : ""}`;

      const { error: movementError } = await supabase.from("stock_movements").insert({
        type: "OUT",
        item_type: "product",
        item_id: form.product_id,
        item_name: selectedProduct?.name || "Product",
        quantity: -form.quantity,
        remarks,
        batch_id: form.batch_id === NO_BATCH ? null : form.batch_id,
        batch_code: batchCode,
      } as any);
      if (movementError) throw movementError;

      const { error: activityError } = await supabase.from("inventory_activity").insert({
        item_type: "product",
        item_id: form.product_id,
        item_name: selectedProduct?.name || "Product",
        activity_type: "DISPATCH",
        quantity: -form.quantity,
        reference_table: "product_dispatches",
        reference_id: dispatch?.id,
        details: `Dispatched ${form.quantity} units${batchCode ? ` from batch ${batchCode}` : ""}`,
      } as any);
      if (activityError) throw activityError;

      if (selectedProduct && nextProductQuantity <= selectedProduct.min_stock) {
        const message = `${selectedProduct.name} is at or below minimum stock after dispatch.`;
        const { data: existingAlert, error: existingAlertError } = await supabase
          .from("alerts")
          .select("id")
          .eq("resolved", false)
          .eq("message", message)
          .eq("item_name", selectedProduct.name)
          .maybeSingle();
        if (existingAlertError) throw existingAlertError;
        if (!existingAlert) {
          const { error: alertError } = await supabase.from("alerts").insert({
            type: nextProductQuantity <= 0 ? "critical" : "low-stock",
            message,
            item_name: selectedProduct.name,
            urgent: nextProductQuantity <= 0,
            resolved: false,
          } as any);
          if (alertError) throw alertError;
        }
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        action: "DISPATCH",
        module: "Product Dispatch",
        details: `Dispatched ${form.quantity} units of ${selectedProduct?.name || "Product"}${batchCode ? ` from batch ${batchCode}` : ""}`,
      } as any);
      if (auditError) throw auditError;

      return { fallback: true };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product_dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_activity"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setModalOpen(false);
      setForm(emptyForm);
      toast.success((result as any)?.offline ? "Dispatch saved offline - Pending Sync" : "Product dispatched and stock deducted");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Dispatch</h1>
          <p className="text-muted-foreground mt-1">Record outgoing finished goods for sales, deliveries, transfers, samples, and returns.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 sm:w-auto w-full">
          <Plus className="h-4 w-4" /> Dispatch Product
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading dispatches...</div>
          ) : dispatches.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No product dispatches yet.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Product", "Qty", "Type", "Destination", "Reference", "Unit Price", "Total", "Dispatched", "Batch Barcode"].map((header) => (
                    <th key={header} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dispatches.map((dispatch: any) => (
                  <tr key={dispatch.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-sm font-medium text-foreground">
                      {dispatch.products?.name || "Unknown"} {dispatch.products?.variant ? `(${dispatch.products.variant})` : ""}
                    </td>
                    <td className="p-4 text-sm text-foreground">{dispatch.quantity}</td>
                    <td className="p-4 text-sm text-muted-foreground capitalize">{dispatch.dispatch_type}</td>
                    <td className="p-4 text-sm text-muted-foreground">{dispatch.destination || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{dispatch.reference_number || "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{dispatch.unit_price ? dispatch.unit_price.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"}</td>
                    <td className="p-4 text-sm font-medium text-foreground">{dispatch.total_value ? dispatch.total_value.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(dispatch.dispatched_date).toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-muted-foreground">{dispatch.batches?.batch_code || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading">Dispatch Product</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product *</Label>
              <Select value={form.product_id} onValueChange={(value) => setForm({ ...form, product_id: value, batch_id: NO_BATCH })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {(products as Product[]).map((product) => (
                    <SelectItem key={product.id} value={product.id}>{product.name} {product.variant ? `(${product.variant})` : ""} - {product.quantity} available</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch</Label>
              <Select value={form.batch_id} onValueChange={(value) => setForm({ ...form, batch_id: value })} disabled={!form.product_id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BATCH}>No specific batch</SelectItem>
                  {productBatches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.batch_code} - {batch.quantity_produced} units{batch.expiration_date ? `, exp ${batch.expiration_date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Type</Label>
              <Select value={form.dispatch_type} onValueChange={(value) => setForm({ ...form, dispatch_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dispatchTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity *</Label>
              <Input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Math.max(1, Number(event.target.value)) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Price</Label>
              <Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(event) => setForm({ ...form, unit_price: Math.max(0, Number(event.target.value)) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destination</Label>
              <Input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference</Label>
              <Input value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Date</Label>
              <Input type="date" value={form.dispatched_date} onChange={(event) => setForm({ ...form, dispatched_date: event.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <PackageMinus className="inline mr-2 h-4 w-4" />
            {selectedProduct ? `${selectedProduct.name} has ${selectedProduct.quantity} units available.` : "Select a product to dispatch stock."}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending} className="bg-primary text-primary-foreground">
              {dispatchMutation.isPending ? "Dispatching..." : "Dispatch Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dispatch;
