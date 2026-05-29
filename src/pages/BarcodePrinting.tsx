import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { code128SvgDataUri, qrCodeDataUri } from "@/lib/barcode";

const ALL = "all";

const BarcodePrinting = () => {
  const [productId, setProductId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [copies, setCopies] = useState(1);
  const [columns, setColumns] = useState(2);
  const [labelSize, setLabelSize] = useState("large");
  const [showProduct, setShowProduct] = useState(true);
  const [showExpiry, setShowExpiry] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showManufactured, setShowManufactured] = useState(true);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["batches-for-printing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*, products(name, category, variant, shelf_life, unit_price)").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filteredBatches = useMemo(() => {
    return batches.filter((batch: any) => {
      if (productId !== ALL && batch.product_id !== productId) return false;
      if (status !== ALL && batch.status !== status) return false;
      const manufactured = batch.manufactured_date || batch.production_date;
      if (dateFrom && manufactured < dateFrom) return false;
      if (dateTo && manufactured > dateTo) return false;
      return true;
    });
  }, [batches, dateFrom, dateTo, productId, status]);

  const labels = filteredBatches.flatMap((batch: any) => Array.from({ length: copies }, (_, copyIndex) => ({ ...batch, printKey: `${batch.id}-${copyIndex}` })));
  const labelClass = labelSize === "large" ? "min-h-[210px]" : labelSize === "medium" ? "min-h-[168px]" : "min-h-[130px]";
  const barcodeHeight = labelSize === "large" ? 96 : labelSize === "medium" ? 78 : 62;

  return (
    <div className="space-y-6 animate-fade-in barcode-print-page">
      <style>{`
        @media print {
          body { margin: 0; }
          .barcode-print-controls, [data-sidebar], aside, nav, header, .toaster, .sonner-toast { display: none !important; }
          .barcode-print-page { padding: 0 !important; }
          .barcode-print-sheet { box-shadow: none !important; border: 0 !important; }
          .barcode-label { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 7mm; }
        }
      `}</style>
      <div className="barcode-print-controls flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Barcode Printing</h1>
          <p className="text-muted-foreground mt-1">Print high-contrast Code 128 and QR batch labels for easier scanning.</p>
        </div>
        <Button onClick={() => window.print()} className="bg-primary text-primary-foreground gap-2"><Printer className="h-4 w-4" /> Print Labels</Button>
      </div>

      <Card className="barcode-print-controls">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All products</SelectItem>
                {products.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Label Size</Label>
            <Select value={labelSize} onValueChange={setLabelSize}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="small">Small</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Columns</Label>
            <Input type="number" min="1" max="5" value={columns} onChange={(event) => setColumns(Math.min(5, Math.max(1, Number(event.target.value))))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Copies</Label>
            <Input type="number" min="1" max="50" value={copies} onChange={(event) => setCopies(Math.min(50, Math.max(1, Number(event.target.value))))} />
          </div>
          <div className="flex flex-wrap gap-4 md:col-span-4">
            <Toggle label="Product" checked={showProduct} onChange={setShowProduct} />
            <Toggle label="Expiry" checked={showExpiry} onChange={setShowExpiry} />
            <Toggle label="Price" checked={showPrice} onChange={setShowPrice} />
            <Toggle label="Manufactured" checked={showManufactured} onChange={setShowManufactured} />
          </div>
        </CardContent>
      </Card>

      <Card className="barcode-print-sheet">
        <CardContent className="p-3">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading batches...</div>
          ) : labels.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No labels match the current filters.</div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {labels.map((batch: any) => (
                <div key={batch.printKey} className={`barcode-label rounded border-2 border-black bg-white p-3 text-center text-black ${labelClass}`}>
                  {showProduct && <p className="truncate text-sm font-bold text-black">{batch.products?.name || "Product"} {batch.products?.variant ? `(${batch.products.variant})` : ""}</p>}
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="rounded bg-white px-3 py-2">
                      <img
                        src={code128SvgDataUri(batch.barcode_token || batch.batch_code, barcodeHeight)}
                        alt={batch.batch_code}
                        className="mx-auto w-full max-w-[360px]"
                        style={{ height: barcodeHeight }}
                      />
                    </div>
                    <QrCode token={batch.barcode_token || batch.batch_code} />
                  </div>
                  <p className="mt-2 text-base font-black tracking-wide text-black break-all">{batch.batch_code}</p>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 text-[11px] font-semibold text-black">
                    {showManufactured && <span>MFG {batch.manufactured_date || batch.production_date}</span>}
                    {showExpiry && <span>EXP {batch.expiration_date || "-"}</span>}
                    {showPrice && <span className="col-span-2">SRP {batch.price ? batch.price.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      {label}
    </label>
  );
}

function QrCode({ token }: { token: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let mounted = true;
    qrCodeDataUri(token).then((dataUri) => {
      if (mounted) setSrc(dataUri);
    });
    return () => { mounted = false; };
  }, [token]);

  if (!src) return <div className="h-24 w-24 bg-white" aria-hidden="true" />;
  return <img src={src} alt={`QR ${token}`} className="h-24 w-24 bg-white" />;
}

export default BarcodePrinting;
