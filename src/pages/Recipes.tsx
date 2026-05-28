import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, X, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAuditAction } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCompressedImage, ACCEPT_ATTR } from "@/lib/imageUpload";
import type { Json } from "@/integrations/supabase/types";

interface RecipeIngredientForm { ingredient_id: string; quantity: number; }

const Recipes = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientForm[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [recipeImage, setRecipeImage] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadCompressedImage(file, "recipes");
      setRecipeImage(imageUrl);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Error uploading image");
    } finally {
      setUploadingImage(false);
    }
  };

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ["recipes-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, products(*), recipe_ingredients(*, ingredients(*))");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => { const { data } = await supabase.from("products").select("*"); return data || []; },
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => { const { data } = await supabase.from("ingredients").select("*"); return data || []; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (!recipeIngredients.length) throw new Error("Add at least one ingredient");
      if (recipeIngredients.some((ingredient) => !ingredient.ingredient_id || ingredient.quantity <= 0)) {
        throw new Error("Each ingredient needs a selected item and a quantity greater than zero");
      }
      const ingredientIds = recipeIngredients.map((ingredient) => ingredient.ingredient_id);
      if (new Set(ingredientIds).size !== ingredientIds.length) {
        throw new Error("Each ingredient can only appear once in a recipe");
      }
      const ingredientsPayload = recipeIngredients.map(({ ingredient_id, quantity }) => ({ ingredient_id, quantity })) as unknown as Json;
      const { error } = await supabase.rpc("save_recipe", {
        recipe_id_value: editingId,
        product_id_value: selectedProduct,
        name_value: recipeName.trim() || null,
        image_url_value: recipeImage || null,
        ingredients_value: ingredientsPayload,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, __, context) => {
      queryClient.invalidateQueries({ queryKey: ["recipes-full"] });
      closeModal();
      const action = editingId ? "UPDATE" : "CREATE";
      const details = editingId
        ? `Updated recipe: ${recipeName || 'Unnamed'}`
        : `Created recipe: ${recipeName || 'Unnamed'}`;
      logAuditAction(action, "Recipes", details, user?.id);
      toast.success(editingId ? "Recipe updated" : "Recipe created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_recipe", { recipe_id_value: id });
      if (error) throw error;
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["recipes-full"] });
      setDeleteConfirm(null);
      const deletedRecipe = recipes.find(r => r.id === deletedId);
      logAuditAction("DELETE", "Recipes", `Deleted recipe: ${deletedRecipe?.name || 'Unnamed'}`, user?.id);
      toast.success("Recipe deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setRecipeName(r.name || "");
    setSelectedProduct(r.product_id);
    setRecipeImage(r.image_url || "");
    setRecipeIngredients(r.recipe_ingredients?.map((ri: any) => ({ ingredient_id: ri.ingredient_id, quantity: ri.quantity })) || []);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setRecipeName("");
    setSelectedProduct("");
    setRecipeImage("");
    setRecipeIngredients([]);
  };

  const addIngredientRow = () => setRecipeIngredients([...recipeIngredients, { ingredient_id: "", quantity: 0 }]);
  const removeIngredientRow = (idx: number) => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx));
  const updateIngredientRow = (idx: number, field: string, value: any) => {
    const updated = [...recipeIngredients];
    (updated[idx] as any)[field] = value;
    setRecipeIngredients(updated);
  };

  const getIngName = (id: string) => ingredients.find(i => i.id === id)?.name || "Unknown";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Recipes & Formulations</h1>
          <p className="text-muted-foreground mt-1">Define how products are made with precise ingredient quantities.</p>
        </div>
        <Button onClick={() => { closeModal(); setModalOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"><Plus className="h-4 w-4" /> New Recipe</Button>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading...</p> : recipes.length === 0 ? (
        <p className="text-muted-foreground">No recipes yet. Create your first recipe!</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {recipes.map((r: any) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-4">
                    {r.image_url ? (
                      <img src={r.image_url} alt={r.name || "Recipe"} className="w-16 h-16 object-cover rounded border" />
                    ) : (
                      <div className="w-16 h-16 bg-muted rounded border flex items-center justify-center">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="font-heading text-xl">{r.products?.name || "Unknown"}</CardTitle>
                      <p className="text-sm text-muted-foreground">{r.products?.variant || "Standard"} - {r.name || "Default Recipe"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.products?.category}</Badge>
                    <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleteConfirm(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ingredients per unit</p>
                <div className="space-y-2">
                  {r.recipe_ingredients?.map((ri: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                      <span className="text-sm text-foreground">{ri.ingredients?.name}</span>
                      <span className="text-sm font-medium text-muted-foreground">{ri.quantity} {ri.ingredients?.unit}</span>
                    </div>
                  ))}
                  {(!r.recipe_ingredients || r.recipe_ingredients.length === 0) && (
                    <p className="text-sm text-muted-foreground">No ingredients defined yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Recipe Modal */}
      <Dialog open={modalOpen} onOpenChange={v => !v && closeModal()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingId ? "Edit Recipe" : "New Recipe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product *</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} {p.variant ? `(${p.variant})` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Recipe Name</Label>
                <Input value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="e.g. Standard Recipe" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Ingredients</Label>
                <Button type="button" variant="outline" size="sm" onClick={addIngredientRow} className="gap-1 text-xs"><Plus className="h-3 w-3" /> Add</Button>
              </div>
              <div className="space-y-2">
                {recipeIngredients.map((ri, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={ri.ingredient_id} onValueChange={v => updateIngredientRow(idx, "ingredient_id", v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Select ingredient" /></SelectTrigger>
                      <SelectContent>{ingredients.map(ing => <SelectItem key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" value={ri.quantity} onChange={e => updateIngredientRow(idx, "quantity", Number(e.target.value))} className="w-24" placeholder="Qty" />
                    <button type="button" onClick={() => removeIngredientRow(idx)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {recipeIngredients.length === 0 && <p className="text-sm text-muted-foreground">No ingredients added. Click "Add" above.</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Recipe Image</Label>
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
              {recipeImage && (
                <div className="mt-2">
                  <img src={recipeImage} alt="Recipe preview" className="w-20 h-20 object-cover rounded border" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-primary text-primary-foreground">
              {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create Recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Delete Recipe?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will remove the recipe and all its ingredient mappings.</p>
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

export default Recipes;
