import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Pencil, Trash2, Mail, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { isOnline, markCachedRowDeleted, queueSyncAction, readWithOfflineCache, upsertCachedRow } from "@/lib/offlineStore";

type Supplier = Tables<"suppliers">;
const emptyForm = { name: "", contact: "", email: "", address: "" };

const Suppliers = () => {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      return readWithOfflineCache("suppliers", async () => {
        const { data, error } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (p: any) => {
      if (!isOnline()) {
        const offlineRow = { ...p, id: p.id || `local-${crypto.randomUUID()}`, sync_status: "Pending Sync" };
        await upsertCachedRow("suppliers", offlineRow, true);
        await queueSyncAction({
          module: "Suppliers",
          actionType: "table-upsert",
          table: "suppliers",
          payload: offlineRow,
          localId: offlineRow.id,
          userId: user?.id,
          expectedUpdatedAt: editing?.updated_at ?? null,
        });
        return { offline: true };
      }
      if (p.id) {
        const { error } = await supabase.from("suppliers").update(p).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(p);
        if (error) throw error;
      }
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setModalOpen(false); setEditing(null); setForm(emptyForm);
      const action = variables.id ? "UPDATE" : "CREATE";
      const details = variables.id
        ? `Updated supplier: ${variables.name}`
        : `Created supplier: ${variables.name}`;
      logAuditAction(action, "Suppliers", details, user?.id);
      toast.success((result as any)?.offline ? "Supplier saved offline - Pending Sync" : editing ? "Supplier updated" : "Supplier added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!isOnline()) {
        await markCachedRowDeleted("suppliers", id);
        await queueSyncAction({
          module: "Suppliers",
          actionType: "table-delete",
          table: "suppliers",
          payload: { id },
          localId: id,
          userId: user?.id,
        });
        return { offline: true };
      }
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (result, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDeleteConfirm(null);
      const deletedSupplier = suppliers.find(s => s.id === deletedId);
      logAuditAction("DELETE", "Suppliers", `Deleted supplier: ${deletedSupplier?.name || 'Unknown'}`, user?.id);
      toast.success((result as any)?.offline ? "Supplier delete saved offline - Pending Sync" : "Supplier deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact: s.contact || "", email: s.email || "", address: s.address || "" });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = { name: form.name.trim(), contact: form.contact || null, email: form.email || null, address: form.address || null };
    if (editing) payload.id = editing.id;
    upsertMutation.mutate(payload);
  };

  const filtered = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage supplier contacts and information.</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Add Supplier</Button>
      </div>
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading...</p> : filtered.length === 0 ? <p className="text-muted-foreground">No suppliers found.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <p className="font-medium text-foreground">{s.name}</p>
                  {(s as any).sync_status && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">{(s as any).sync_status}</span>}
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(s)} className="text-muted-foreground hover:text-foreground p-1"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteConfirm(s.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {s.contact && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {s.contact}</p>}
                  {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {s.email}</p>}
                  {s.address && <p className="text-xs">{s.address}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} className="bg-primary text-primary-foreground">{upsertMutation.isPending ? "Saving..." : editing ? "Update" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Delete Supplier?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}>{deleteMutation.isPending ? "Deleting..." : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
