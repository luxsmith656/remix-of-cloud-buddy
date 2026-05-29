import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { isOnline, markCachedRowDeleted, queueSyncAction, readWithOfflineCache, upsertCachedRow } from "@/lib/offlineStore";

type Ingredient = Tables<"ingredients">;
type Supplier = Tables<"suppliers">;

const NO_SUPPLIER = "none";
const emptyForm = { name: "", unit: "kg", current_stock: 0, min_stock: 0, unit_cost: 0, supplier_id: NO_SUPPLIER, expiration_date: "" };

const Ingredients = () => {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: ingredients = [], isLoading } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      return readWithOfflineCache("ingredients", async () => {
        const { data, error } = await supabase.from("ingredients").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      return readWithOfflineCache("suppliers", async () => {
        const { data, error } = await supabase.from("suppliers").select("*");
        if (error) throw error;
        return data || [];
      });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (p: any) => {
      if (!isOnline()) {
        const offlineRow = { ...p, id: p.id || `local-${crypto.randomUUID()}`, sync_status: "Pending Sync" };
        await upsertCachedRow("ingredients", offlineRow, true);
        await queueSyncAction({
          module: "Ingredients",
          actionType: "table-upsert",
          table: "ingredients",
          payload: offlineRow,
          localId: offlineRow.id,
          userId: user?.id,
          expectedUpdatedAt: editing?.updated_at ?? null,
        });
        return { offline: true };
      }
      if (p.id) {
        const { error } = await supabase.from("ingredients").update(p).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ingredients").insert(p);
        if (error) throw error;
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      const action = variables.id ? "UPDATE" : "CREATE";
      const details = variables.id
        ? `Updated ingredient: ${variables.name}`
        : `Created ingredient: ${variables.name}`;
      logAuditAction(action, "Ingredients", details, user?.id);
      toast.success((result as any)?.offline ? "Ingredient saved offline - Pending Sync" : editing ? "Ingredient updated" : "Ingredient added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isOnline()) {
        await markCachedRowDeleted("ingredients", id);
        await queueSyncAction({
          module: "Ingredients",
          actionType: "table-delete",
          table: "ingredients",
          payload: { id },
          localId: id,
          userId: user?.id,
        });
        return { offline: true };
      }
      const [{ data: recipeLinks, error: recipeError }, { data: receipts, error: receiptsError }] = await Promise.all([
        supabase.from("recipe_ingredients").select("id").eq("ingredient_id", id).limit(1),
        supabase.from("ingredient_receipts").select("id").eq("ingredient_id", id).limit(1),
      ]);
      if (recipeError || receiptsError) throw recipeError || receiptsError;
      if (recipeLinks?.length || receipts?.length) {
        throw new Error("This ingredient is used by recipes or receiving history. Keep it for traceability instead of deleting it.");
      }
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (result, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      setDeleteConfirm(null);
      const deletedIngredient = ingredients.find(i => i.id === deletedId);
      logAuditAction("DELETE", "Ingredients", `Deleted ingredient: ${deletedIngredient?.name || 'Unknown'}`, user?.id);
      toast.success((result as any)?.offline ? "Ingredient delete saved offline - Pending Sync" : "Ingredient deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (i: Ingredient) => {
    setEditing(i);
    setForm({ name: i.name, unit: i.unit, current_stock: i.current_stock, min_stock: i.min_stock, unit_cost: i.unit_cost, supplier_id: i.supplier_id || NO_SUPPLIER, expiration_date: i.expiration_date || "" });
    setModalOpen(true);
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = {
      name: form.name.trim(), unit: form.unit, current_stock: form.current_stock,
      min_stock: form.min_stock, unit_cost: form.unit_cost, supplier_id: form.supplier_id === NO_SUPPLIER ? null : form.supplier_id,
      expiration_date: form.expiration_date || null,
    };
    if (editing) payload.id = editing.id;
    upsertMutation.mutate(payload);
  };

  const filtered = ingredients.filter(i => {
    const normalizedSearch = search.toLowerCase();
    return i.name.toLowerCase().includes(normalizedSearch);
  });
  const getSupplier = (id: string | null) => suppliers.find(s => s.id === id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Ingredients</h1>
          <p className="text-muted-foreground mt-1">Manage raw materials and packaging supplies.</p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Add Ingredient</Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search ingredients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No ingredients found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Name", "Unit", "Current Stock", "Min Stock", "Supplier", "Expiration", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => {
                  const isLow = i.current_stock <= i.min_stock;
                  const supplier = getSupplier(i.supplier_id);
                  return (
                    <tr key={i.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${isLow ? "bg-destructive/5" : ""}`}>
                      <td className="p-4 text-sm font-medium text-foreground">
                        {i.name}
                        {(i as any).sync_status && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">{(i as any).sync_status}</span>}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{i.unit}</td>
                      <td className="p-4 text-sm font-medium text-foreground">{i.current_stock}</td>
                      <td className="p-4 text-sm text-muted-foreground">{i.min_stock}</td>
                      <td className="p-4 text-sm text-muted-foreground">{supplier?.name || "-"}</td>
                      <td className="p-4 text-sm text-muted-foreground">{i.expiration_date || "-"}</td>
                      <td className="p-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${isLow ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                          {isLow ? "LOW" : "OK"}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(i)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDeleteConfirm(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["kg", "liters", "pcs", "grams", "ml"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Current Stock</Label>
                <Input type="number" min="0" value={form.current_stock} onChange={(e) => setForm({ ...form, current_stock: Math.max(0, Number(e.target.value)) })} />
              </div>
                <div className="hidden space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Unit Cost</Label>
                  <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Math.max(0, Number(e.target.value)) })} />
                </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Min Stock</Label>
                <Input type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supplier</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>None</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                <Input type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} className="bg-primary text-primary-foreground">
                {upsertMutation.isPending ? "Saving..." : editing ? "Update" : "Add Ingredient"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Delete Ingredient?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Ingredients;
