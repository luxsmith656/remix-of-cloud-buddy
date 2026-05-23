import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Pencil, Trash2, Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCompressedImage, ACCEPT_ATTR } from "@/lib/imageUpload";

type Product = Tables<"products">;

const statusStyles: Record<string, string> = {
  "in-stock": "bg-success/10 text-success border-success/20",
  "low-stock": "bg-warning/10 text-warning border-warning/20",
  "expiring": "bg-destructive/10 text-destructive border-destructive/20",
  "out-of-stock": "bg-muted text-muted-foreground border-border",
};

const statusLabels: Record<string, string> = {
  "in-stock": "IN STOCK",
  "low-stock": "LOW STOCK",
  "expiring": "EXPIRING",
  "out-of-stock": "OUT OF STOCK",
};

type ProductStatus = "in-stock" | "low-stock" | "expiring" | "out-of-stock";
const emptyForm = { name: "", category: "Produce", variant: "", shelf_life: 365, quantity: 0, min_stock: 10, status: "in-stock" as ProductStatus, expiration_date: "", image_url: "" };

const Products = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  const [hoveredBatch, setHoveredBatch] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadCompressedImage(file, "products");
      setForm(prev => ({ ...prev, image_url: imageUrl }));
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Error uploading image");
    } finally {
      setUploadingImage(false);
    }
  };

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (p: TablesInsert<"products"> & { id?: string }) => {
      if (p.id) {
        const { error } = await supabase.from("products").update(p).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(p);
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setModalOpen(false);
      setEditingProduct(null);
      setForm(emptyForm);
      const action = variables.id ? "UPDATE" : "CREATE";
      const details = variables.id
        ? `Updated product: ${variables.name}`
        : `Created product: ${variables.name}`;
      logAuditAction(action, "Products", details, user?.id);
      toast.success(editingProduct ? "Product updated" : "Product added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDeleteConfirm(null);
      const deletedProduct = products.find(p => p.id === deletedId);
      logAuditAction("DELETE", "Products", `Deleted product: ${deletedProduct?.name || 'Unknown'}`, user?.id);
      toast.success("Product deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name, category: p.category, variant: p.variant || "", shelf_life: p.shelf_life || 365,
      quantity: p.quantity, min_stock: p.min_stock, status: p.status, expiration_date: p.expiration_date || "",
      image_url: p.image_url || "",
    });
    setModalOpen(true);
  };

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    const payload: any = {
      name: form.name.trim(), category: form.category, variant: form.variant || null,
      shelf_life: form.shelf_life, quantity: form.quantity, min_stock: form.min_stock,
      status: form.status, expiration_date: form.expiration_date || null,
      image_url: form.image_url || null,
    };
    if (editingProduct) payload.id = editingProduct.id;
    upsertMutation.mutate(payload);
  };

  const categories = [...new Set(products.map(p => p.category))];
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "all" || p.category === category;
    return matchSearch && matchCat;
  });

  const stats = [
    { label: "TOTAL PRODUCTS", value: products.length.toLocaleString(), sub: "" },
    { label: "OUT OF STOCK", value: String(products.filter(p => p.status === "out-of-stock").length), sub: "Critical", subColor: "text-destructive" },
    { label: "EXPIRING SOON", value: String(products.filter(p => p.status === "expiring").length), sub: "< 7 Days" },
    { label: "STOCK HEALTH", value: products.length ? `${((products.filter(p => p.status === "in-stock").length / products.length) * 100).toFixed(1)}%` : "N/A", sub: "" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Product Ledger</h1>
          <p className="text-muted-foreground mt-1">Real-time oversight of artisanal inventory, stock health, and harvest timelines.</p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> Add New Product</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className={`p-4 rounded-lg border ${i === 3 ? "bg-accent border-accent" : "bg-card border-border"}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-heading text-foreground">{s.value}</span>
              {s.sub && <span className={`text-xs font-medium ${s.subColor || "text-muted-foreground"}`}>{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Category:</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>
        <span className="text-sm text-muted-foreground ml-auto">Showing {filtered.length} of {products.length}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading products...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No products found. Add your first product!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product Name</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Batch</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiration Date</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const productBatches = batches.filter((b: any) => b.product_id === p.id) || [];
                    const hoveredBatchKey = hoveredBatch && hoveredBatch.startsWith(p.id) ? hoveredBatch : null;
                    const hoveredBatchId = hoveredBatchKey ? hoveredBatchKey.replace(`${p.id}-`, '') : null;
                    const displayBatch = hoveredBatchId ? productBatches.find((b: any) => b.id === hoveredBatchId) : null;
                    const displayQuantity = displayBatch ? displayBatch.quantity_produced : p.quantity;
                    const displayExpiration = displayBatch ? displayBatch.expiration_date : p.expiration_date;
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-4">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="w-12 h-12 object-cover rounded border" />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center">
                              <Upload className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-medium text-foreground">{p.name} {p.variant ? `(${p.variant})` : ""}</p>
                        </td>
                        <td className="p-4">
                          {productBatches && productBatches.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {productBatches.map((b: any, idx: number) => {
                                const batchKey = `${p.id}-${b.id}`;
                                return (
                                  <button
                                    key={b.id}
                                    onMouseEnter={() => setHoveredBatch(batchKey)}
                                    onMouseLeave={() => setHoveredBatch(null)}
                                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                      hoveredBatch === batchKey
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                    }`}
                                  >
                                    Batch #{idx + 1}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No batches</span>
                          )}
                        </td>
                        <td className="p-4"><Badge variant="outline" className="text-xs font-normal">{p.category}</Badge></td>
                        <td className="p-4 text-sm font-medium text-foreground">{displayQuantity} Units</td>
                        <td className="p-4 text-sm text-muted-foreground">{displayExpiration ? new Date(displayExpiration).toLocaleDateString() : "-"}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusStyles[p.status]}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusLabels[p.status]}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteConfirm(p.id)} className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Produce" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Variant</Label>
                <Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} placeholder="250ml, 500ml, 1L" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Shelf Life (days)</Label>
                <Input type="number" value={form.shelf_life} onChange={(e) => setForm({ ...form, shelf_life: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity</Label>
                <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Min Stock</Label>
                <Input type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-stock">In Stock</SelectItem>
                    <SelectItem value="low-stock">Low Stock</SelectItem>
                    <SelectItem value="expiring">Expiring</SelectItem>
                    <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date</Label>
                <Input type="date" value={form.expiration_date} onChange={(e) => setForm({ ...form, expiration_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product Image</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept={ACCEPT_ATTR}
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  className="flex-1"
                />
                {uploadingImage && <span className="text-sm text-muted-foreground">Uploading...</span>}
              </div>
              {form.image_url && (
                <div className="mt-2">
                  <img src={form.image_url} alt="Product preview" className="w-20 h-20 object-cover rounded border" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} className="bg-primary text-primary-foreground">
                {upsertMutation.isPending ? "Saving..." : editingProduct ? "Update" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Delete Product?</DialogTitle></DialogHeader>
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

export default Products;
