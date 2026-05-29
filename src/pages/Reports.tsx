import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart3, Download, Package, Leaf, AlertTriangle, FileText, PackagePlus, PackageMinus } from "lucide-react";
import { toast } from "sonner";
import { escapeHtml, isWithinDateRange, rowsToCsv, type ReportRow } from "@/lib/reports";
import { computeProductStatus } from "@/lib/inventory";

const downloadCSV = (rows: ReportRow[], filename: string) => {
  if (!rows.length) { toast.error("No data to export"); return; }
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
};

const downloadPDF = (title: string, rows: ReportRow[]) => {
  if (!rows.length) { toast.error("No data to export"); return; }
  const headers = Object.keys(rows[0]);

  const printWindow = window.open("", "_blank");
  if (!printWindow) { toast.error("Please allow popups to download PDF"); return; }
  printWindow.document.write(`
    <html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      .date { color: #888; font-size: 12px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f5f0e8; text-align: left; padding: 8px; border: 1px solid #ddd; font-weight: 600; }
      td { padding: 8px; border: 1px solid #ddd; }
      tr:nth-child(even) { background: #faf8f5; }
      @media print { body { padding: 20px; } }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p class="date">Generated: ${escapeHtml(new Date().toLocaleString())}</p>
    <table>
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${escapeHtml(r[h] ?? "-")}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
    </body></html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
  toast.success(`${title} PDF opened for printing`);
};

const Reports = () => {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => { const { data } = await supabase.from("products").select("*"); return data || []; },
  });
  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => { const { data } = await supabase.from("ingredients").select("*"); return data || []; },
  });
  const { data: batches = [] } = useQuery({
    queryKey: ["batches"],
    queryFn: async () => { const { data } = await supabase.from("batches").select("*, products(name, variant)").order("created_at", { ascending: false }); return data || []; },
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => { const { data } = await supabase.from("stock_movements").select("*").order("created_at", { ascending: false }); return data || []; },
  });
  const { data: defects = [] } = useQuery({
    queryKey: ["defects"],
    queryFn: async () => { const { data } = await supabase.from("defects").select("*, batches(*, products(name))").order("created_at", { ascending: false }); return data || []; },
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ["ingredient_receipts"],
    queryFn: async () => { const { data } = await supabase.from("ingredient_receipts").select("*, ingredients(name, unit), suppliers(name)").order("created_at", { ascending: false }); return data || []; },
  });
  const { data: dispatches = [] } = useQuery({
    queryKey: ["product_dispatches"],
    queryFn: async () => { const { data } = await supabase.from("product_dispatches").select("*, products(name, variant), batches(batch_code)").order("created_at", { ascending: false }); return data || []; },
  });

  const filterByDate = <T extends { created_at?: string | null; production_date?: string | null; received_date?: string | null; dispatched_date?: string | null }>(items: T[]) => {
    if (!dateFrom && !dateTo) return items;
    return items.filter(i => isWithinDateRange(i.created_at || i.production_date || i.received_date || i.dispatched_date, dateFrom, dateTo));
  };

  const generateInventory = (format: "csv" | "pdf") => {
    const rows = [
      ...products.map(p => ({ Type: "Product", Name: p.name, Barcode: p.barcode || "-", Variant: p.variant || "-", Stock: p.quantity, "Min Stock": p.min_stock, Unit: "units", Status: computeProductStatus(p.quantity, p.min_stock, p.expiration_date), Expiration: p.expiration_date || "-" })),
      ...ingredients.map(i => ({ Type: "Ingredient", Name: i.name, Variant: "-", Stock: i.current_stock, "Min Stock": i.min_stock, Unit: i.unit, Status: i.current_stock <= i.min_stock ? "low-stock" : "ok", Expiration: i.expiration_date || "-" })),
    ];
    if (format === "csv") downloadCSV(rows, "inventory_summary.csv");
    else downloadPDF("Inventory Summary Report", rows);
  };

  const generateBatchReport = (format: "csv" | "pdf") => {
    const filtered = filterByDate(batches);
      const rows = filtered.map((b: any) => ({
      "Batch Barcode": b.batch_code || b.id.slice(0, 8), Product: b.products?.name || "-", Variant: b.products?.variant || "-",
      Planned: b.quantity_planned, Remaining: b.quantity_produced, Status: b.status,
      "Manufactured Date": b.manufactured_date || b.production_date, "Expiration Date": b.expiration_date || "-",
    }));
    if (format === "csv") downloadCSV(rows, "batch_production.csv");
    else downloadPDF("Batch Production Report", rows);
  };

  const generateIngredientUsage = (format: "csv" | "pdf") => {
    const filtered = filterByDate(movements).filter((m: any) => m.item_type === "ingredient" && m.type === "OUT");
    const usage: Record<string, number> = {};
    filtered.forEach((m: any) => { usage[m.item_name] = (usage[m.item_name] || 0) + Math.abs(m.quantity); });
    const rows = Object.entries(usage).map(([name, qty]) => ({ Ingredient: name, "Total Used": qty }));
    if (!rows.length) { toast.error("No ingredient usage data for this period"); return; }
    if (format === "csv") downloadCSV(rows, "ingredient_usage.csv");
    else downloadPDF("Ingredient Usage Report", rows);
  };

  const generateDefectReport = (format: "csv" | "pdf") => {
    const filtered = filterByDate(defects);
    const rows = filtered.map((d: any) => ({
      Product: d.batches?.products?.name || "-", "Batch Barcode": d.batches?.batch_code || d.batch_id.slice(0, 8),
      "Qty Defective": d.quantity, Reason: d.reason || "-", Date: new Date(d.created_at).toLocaleDateString(),
    }));
    if (format === "csv") downloadCSV(rows, "defect_wastage.csv");
    else downloadPDF("Defect/Wastage Report", rows);
  };

  const generateReceivingReport = (format: "csv" | "pdf") => {
    const filtered = filterByDate(receipts);
      const rows = filtered.map((receipt: any) => ({
      Ingredient: receipt.ingredients?.name || "-",
      Quantity: receipt.quantity,
      Unit: receipt.ingredients?.unit || "-",
      Supplier: receipt.suppliers?.name || "-",
      Lot: receipt.lot_number || "-",
      Invoice: receipt.invoice_number || "-",
      Received: receipt.received_date,
      Expiration: receipt.expiration_date || "-",
    }));
    if (format === "csv") downloadCSV(rows, "ingredient_receiving.csv");
    else downloadPDF("Ingredient Receiving Report", rows);
  };

  const generateDispatchReport = (format: "csv" | "pdf") => {
    const filtered = filterByDate(dispatches);
      const rows = filtered.map((dispatch: any) => ({
      Product: `${dispatch.products?.name || "-"}${dispatch.products?.variant ? ` (${dispatch.products.variant})` : ""}`,
      "Batch Barcode": dispatch.batches?.batch_code || "-",
      Quantity: dispatch.quantity,
      Type: dispatch.dispatch_type,
      Destination: dispatch.destination || "-",
      Reference: dispatch.reference_number || "-",
      Dispatched: dispatch.dispatched_date,
    }));
    if (format === "csv") downloadCSV(rows, "product_dispatches.csv");
    else downloadPDF("Product Dispatch Report", rows);
  };

  const reportTypes = [
    { title: "Inventory Summary", desc: "Current stock levels for all products and ingredients", icon: Package, gen: generateInventory },
    { title: "Batch Production Report", desc: "Production history with quantities and dates", icon: BarChart3, gen: generateBatchReport },
    { title: "Ingredient Receiving Report", desc: "Inbound stock receipts with supplier, lot, invoice, and cost", icon: PackagePlus, gen: generateReceivingReport },
    { title: "Product Dispatch Report", desc: "Outbound finished goods with destination, reference, and sales value", icon: PackageMinus, gen: generateDispatchReport },
    { title: "Ingredient Usage Report", desc: "Raw material consumption over time", icon: Leaf, gen: generateIngredientUsage },
    { title: "Defect/Wastage Report", desc: "Analysis of defective items and waste trends", icon: AlertTriangle, gen: generateDefectReport },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground mt-1">Generate and export operational reports.</p>
      </div>

      <div className="flex items-end gap-4 flex-wrap">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-44 h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-44 h-9" />
        </div>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map((r, i) => (
          <Card key={i} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <r.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{r.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{r.desc}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => r.gen("csv")}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => r.gen("pdf")}>
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Reports;
