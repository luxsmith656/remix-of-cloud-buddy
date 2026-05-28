import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, ArrowRight, Factory } from "lucide-react";
import { generateBatchCode, normalizeBarcodeToken } from "@/lib/barcode";

const batchStatusStyles: Record<string, string> = {
  planned: "bg-info/10 text-info border-info/20",
  "in-progress": "bg-warning/10 text-warning border-warning/20",
  completed: "bg-success/10 text-success border-success/20",
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};

const BatchProduction = () => {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [productionDate, setProductionDate] = useState(dateKey(new Date()));
  const [expirationDate, setExpirationDate] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [ingredientCheck, setIngredientCheck] = useState<{ name: string; required: number; available: number; unit: string; sufficient: boolean }[]>([]);
  const queryClient = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes-with-ingredients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*, recipe_ingredients(*, ingredients(*))");
      if (error) throw error;
      return data;
    },
  });

  const getProduct = (id: string) => products.find((product) => product.id === id);
  const selectedProductRow = getProduct(selectedProduct);

  const resetWizard = () => {
    setStep(1);
    setSelectedProduct("");
    setQuantity(100);
    setProductionDate(dateKey(new Date()));
    setExpirationDate("");
    setBatchCode("");
    setIngredientCheck([]);
  };

  const updateProductSelection = (productId: string) => {
    setSelectedProduct(productId);
    const product = products.find((item) => item.id === productId);
    const nextProductionDate = productionDate || dateKey(new Date());
    setExpirationDate(product?.shelf_life ? addDays(nextProductionDate, product.shelf_life) : "");
    setBatchCode(product ? generateBatchCode(product.name, new Date(`${nextProductionDate}T00:00:00`)) : "");
  };

  const updateProductionDate = (nextProductionDate: string) => {
    setProductionDate(nextProductionDate);
    if (selectedProductRow?.shelf_life) setExpirationDate(addDays(nextProductionDate, selectedProductRow.shelf_life));
    if (selectedProductRow && !batchCode.trim()) {
      setBatchCode(generateBatchCode(selectedProductRow.name, new Date(`${nextProductionDate}T00:00:00`)));
    }
  };

  const runPreFlightCheck = () => {
    const normalizedCode = normalizeBarcodeToken(batchCode);

    if (!selectedProduct) { toast.error("Select a product"); return; }
    if (!expirationDate) { toast.error("Expiration date is required"); return; }
    if (new Date(expirationDate) <= new Date(productionDate)) { toast.error("Expiration date must be after production date"); return; }
    if (normalizedCode && batches.some((batch: any) => [batch.batch_code, batch.barcode_token, batch.barcode_value].includes(normalizedCode))) {
      toast.error("Batch barcode already exists");
      return;
    }

    const recipe = recipes.find((recipeItem: any) => recipeItem.product_id === selectedProduct);
    if (!recipe || !(recipe as any).recipe_ingredients?.length) {
      toast.error("No recipe found for this product. Please create a recipe first.");
      return;
    }

    const checks = (recipe as any).recipe_ingredients.map((recipeIngredient: any) => {
      const ingredient = recipeIngredient.ingredients;
      const required = recipeIngredient.quantity * quantity;
      return {
        name: ingredient?.name || "Unknown",
        required,
        available: ingredient?.current_stock || 0,
        unit: ingredient?.unit || "",
        sufficient: (ingredient?.current_stock || 0) >= required,
      };
    });
    setIngredientCheck(checks);
    setStep(2);
  };

  const allSufficient = ingredientCheck.every((ingredient) => ingredient.sufficient);

  const createBatchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error("Select a product");
      if (!expirationDate) throw new Error("Expiration date is required");
      const { error } = await supabase.rpc("produce_batch", {
        product_id_value: selectedProduct,
        quantity_value: quantity,
        production_date_value: productionDate,
        expiration_date_value: expirationDate,
        batch_code_value: batchCode.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["ingredients"] });
      queryClient.invalidateQueries({ queryKey: ["stock_movements"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_activity"] });
      setWizardOpen(false);
      resetWizard();
      toast.success("Batch created successfully. Ingredients deducted and product stock updated.");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Batch Production</h1>
          <p className="text-muted-foreground mt-1">Create separate production batches with unique internal barcodes and editable expiration dates.</p>
        </div>
        <Button onClick={() => { resetWizard(); setWizardOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
          <Factory className="h-4 w-4" /> Start New Batch
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : batches.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No batches yet. Start your first production batch!</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Batch Barcode", "Product", "Planned", "Remaining", "Manufactured", "Expiration", "Status"].map((header) => (
                    <th key={header} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch: any) => {
                  const product = getProduct(batch.product_id);
                  return (
                    <tr key={batch.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-sm font-medium text-foreground">{batch.batch_code || batch.id.slice(0, 8)}</td>
                      <td className="p-4 text-sm text-foreground">{product?.name || "Unknown"} {product?.variant ? `(${product.variant})` : ""}</td>
                      <td className="p-4 text-sm text-foreground">{batch.quantity_planned}</td>
                      <td className="p-4 text-sm text-foreground">{batch.quantity_produced}</td>
                      <td className="p-4 text-sm text-muted-foreground">{batch.manufactured_date || batch.production_date}</td>
                      <td className="p-4 text-sm text-muted-foreground">{batch.expiration_date || "-"}</td>
                      <td className="p-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${batchStatusStyles[batch.status]}`}>
                          {batch.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {step === 1 ? "Step 1: Production Request" : step === 2 ? "Step 2: Pre-Flight Check" : "Step 3: Confirm Production"}
            </DialogTitle>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3].map((wizardStep) => (
                <div key={wizardStep} className={`h-1.5 flex-1 rounded-full ${wizardStep <= step ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Select Product</Label>
                <Select value={selectedProduct} onValueChange={updateProductSelection}>
                  <SelectTrigger><SelectValue placeholder="Choose a product..." /></SelectTrigger>
                  <SelectContent>
                    {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} {product.variant ? `(${product.variant})` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Quantity to Produce</Label>
                <Input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Production Date</Label>
                  <Input type="date" value={productionDate} onChange={(event) => updateProductionDate(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Expiration Date *</Label>
                  <Input type="date" required value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Batch Barcode / Lot Code</Label>
                <Input value={batchCode} onChange={(event) => setBatchCode(event.target.value.toUpperCase())} placeholder="Auto-generated if left blank" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWizardOpen(false)}>Cancel</Button>
                <Button onClick={runPreFlightCheck} disabled={!selectedProduct} className="bg-primary text-primary-foreground gap-2">
                  Check Ingredients <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Producing <strong>{quantity}</strong> units of <strong>{selectedProductRow?.name}</strong> as batch <strong>{batchCode || "auto-generated"}</strong>
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {ingredientCheck.map((ingredient, index) => (
                  <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${ingredient.sufficient ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"}`}>
                    <div className="flex items-center gap-2">
                      {ingredient.sufficient ? <CheckCircle className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                      <span className="text-sm font-medium text-foreground">{ingredient.name}</span>
                    </div>
                    <div className="text-right text-sm">
                      <span className={ingredient.sufficient ? "text-success" : "text-destructive"}>
                        Need: {ingredient.required.toFixed(2)} {ingredient.unit}
                      </span>
                      <span className="text-muted-foreground ml-2">/ Have: {ingredient.available} {ingredient.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              {!allSufficient && (
                <p className="text-sm text-destructive font-medium">Insufficient ingredients. Reduce quantity or restock.</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!allSufficient} className="bg-primary text-primary-foreground gap-2">
                  Confirm <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Card className="bg-accent/50 border-accent">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm"><strong>Product:</strong> {selectedProductRow?.name}</p>
                  <p className="text-sm"><strong>Batch Barcode:</strong> {batchCode || "Auto-generated"}</p>
                  <p className="text-sm"><strong>Manufactured:</strong> {productionDate}</p>
                  <p className="text-sm"><strong>Expiration:</strong> {expirationDate}</p>
                  <p className="text-sm"><strong>Quantity:</strong> {quantity} units</p>
                  <p className="text-sm"><strong>Ingredients to deduct:</strong> {ingredientCheck.length} items</p>
                  <p className="text-xs text-muted-foreground mt-2">This transaction creates a separate batch, deducts ingredients, and adds finished product stock atomically.</p>
                </CardContent>
              </Card>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => createBatchMutation.mutate()} disabled={createBatchMutation.isPending} className="bg-primary text-primary-foreground gap-2">
                  {createBatchMutation.isPending ? "Processing..." : "Start Production"} <Factory className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BatchProduction;
