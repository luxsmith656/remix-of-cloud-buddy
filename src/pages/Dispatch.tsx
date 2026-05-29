import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageMinus, Plus, Trash2 } from "lucide-react";
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

type Line = {
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
};

const emptyLine = (): Line => ({ product_id: "", batch_id: NO_BATCH, quantity: 1, unit_price: 0 });

const dispatchTypes = [
  { value: "sale", label: "Sale" },
  { value: "delivery", label: "Delivery" },
  { value: "transfer", label: "Transfer" },
  { value: "sample", label: "Sample" },
  { value: "return", label: "Return" },
  { value: "other", label: "Other" },
];

const Dispatch = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [dispatchType, setDispatchType] = useState("sale");
  const [destination, setDestination] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [dispatchedDate, setDispatchedDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const queryClient = useQueryClient();

  const resetForm = () => {
    setDispatchType("sale");
    setDestination("");
    setReferenceNumber("");
    setDispatchedDate(today());
    setNotes("");
    setLines([emptyLine()]);
  };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["product_dispatches"],
    queryFn: async () =>
      readWithOfflineCache("product_dispatches", async () => {
        const { data, error } = await supabase
          .from("product_dispatches")
          .select("*, products(name, variant), batches(batch_code, production_date, expiration_date)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      readWithOfflineCache("products", async () => {
        const { data, error } = await supabase.from("products").select("*").order("name");
        if (error) throw error;
        return data || [];
      }),
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () =>
      readWithOfflineCache("batches", async () => {
        const { data, error } = await supabase.from("batches").select("*").gt("quantity_produced", 0).order("expiration_date");
        if (error) throw error;
        return data || [];
      }),
  });

  const productsList = products as Product[];
  const batchesList = batches as Batch[];

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error("Add at least one product");
      lines.forEach((l, i) => {
        if (!l.product_id) throw new Error(`Row ${i + 1}: select a product`);
        if (l.quantity <= 0) throw new Error(`Row ${i + 1}: quantity must be greater than zero`);
        if (l.unit_price < 0) throw new Error(`Row ${i + 1}: unit price cannot be negative`);
        const product = productsList.find((p) => p.id === l.product_id);
        if (product && l.quantity > product.quantity) throw new Error(`Row ${i + 1}: not enough stock for ${product.name}`);
        if (l.batch_id !== NO_BATCH) {
          const batch = batchesList.find((b) => b.id === l.batch_id);
          if (batch && l.quantity > batch.quantity_produced) throw new Error(`Row ${i + 1}: not enough stock in selected batch`);
        }
      });

      let offline = false;
      for (const l of lines) {
        const payload = {
          product_id_value: l.product_id,
          quantity_value: l.quantity,
          batch_id_value: l.batch_id === NO_BATCH ? null : l.batch_id,
          dispatch_type_value: dispatchType,
          destination_value: destination || null,
          reference_number_value: referenceNumber || null,
          unit_price_value: l.unit_price || null,
          dispatched_date_value: dispatchedDate || null,
          notes_value: notes || null,
        };
        if (!isOnline()) {
          await queueSyncAction({ module: "Dispatch", actionType: "rpc", rpcName: "dispatch_product", payload });
          offline = true;
        } else {
          const { error } = await supabase.rpc("dispatch_product", payload as any);
          if (error) throw error;
        }
      }
      return { offline, count: lines.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product_dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_activity"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setModalOpen(false);
      resetForm();
      toast.success(
        result.offline
          ? `${result.count} dispatch(es) saved offline - Pending Sync`
          : `${result.count} product(s) dispatched and stock deducted`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Dispatch</h1>
          <p className="text-muted-foreground mt-1">Record one or many outgoing finished goods in a single dispatch session.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 sm:w-auto w-full">
          <Plus className="h-4 w-4" /> Dispatch Products
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

      <Dialog open={modalOpen} onOpenChange={(open) => { setModalOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Dispatch Products</DialogTitle></DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Type</Label>
              <Select value={dispatchType} onValueChange={setDispatchType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dispatchTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dispatch Date</Label>
              <Input type="date" value={dispatchedDate} onChange={(e) => setDispatchedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destination</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reference</Label>
              <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Products ({lines.length})</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])} className="gap-1">
                <Plus className="h-3 w-3" /> Add Product
              </Button>
            </div>
            {lines.map((line, idx) => {
              const productBatches = batchesList.filter((b) => b.product_id === line.product_id);
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product *</Label>
                      <Select value={line.product_id} onValueChange={(v) => updateLine(idx, { product_id: v, batch_id: NO_BATCH })}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {productsList.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name} {product.variant ? `(${product.variant})` : ""} - {product.quantity} available
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch</Label>
                      <Select value={line.batch_id} onValueChange={(v) => updateLine(idx, { batch_id: v })} disabled={!line.product_id}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_BATCH}>No specific batch</SelectItem>
                          {productBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              {batch.batch_code} - {batch.quantity_produced} units
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity *</Label>
                      <Input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value)) })} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Price</Label>
                      <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: Math.max(0, Number(e.target.value)) })} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <PackageMinus className="inline mr-2 h-4 w-4" />
            {lines.length} product(s) will be dispatched and stock deducted.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending} className="bg-primary text-primary-foreground">
              {dispatchMutation.isPending ? "Dispatching..." : `Dispatch ${lines.length} Item(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dispatch;
