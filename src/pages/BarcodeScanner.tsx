import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, Search, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { normalizeBarcodeToken } from "@/lib/barcode";
import { cacheBatch, getCachedBatch } from "@/lib/offlineCache";

type ScanStatus = "ready" | "scanning" | "found" | "not-found" | "expired" | "near-expiry" | "defective" | "no-camera-permission";

const statusLabels: Record<ScanStatus, string> = {
  ready: "Ready to scan",
  scanning: "Scanning",
  found: "Found",
  "not-found": "Not found",
  expired: "Expired",
  "near-expiry": "Near expiry",
  defective: "Defective",
  "no-camera-permission": "No camera permission",
};

const getBatchStatus = (batch: any): ScanStatus => {
  if (!batch) return "not-found";
  if (batch.defect_quantity > 0) return "defective";
  if (!batch.expiration_date) return "found";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${batch.expiration_date}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= 14) return "near-expiry";
  return "found";
};

const BarcodeScanner = () => {
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState<ScanStatus>("ready");
  const [batch, setBatch] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  const lookupMutation = useMutation({
    mutationFn: async (code: string) => {
      const normalized = normalizeBarcodeToken(code);
      if (!normalized) throw new Error("Enter or scan a barcode");
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const cached = await getCachedBatch(normalized);
        return { found: (cached?.batch as any) ?? null, movementRows: [], offline: true, cachedAt: cached?.cachedAt ?? null };
      }
      try {
        const { data, error } = await supabase.rpc("find_batch_by_barcode", { barcode_value_value: normalized });
        if (error) throw error;
        const found = data?.[0] || null;
        if (found) await cacheBatch(normalized, found as any);
        const { data: movementRows } = await supabase
          .from("stock_movements")
          .select("*")
          .or(`batch_code.eq.${normalized},remarks.ilike.%${normalized}%`)
          .order("created_at", { ascending: false })
          .limit(8);
        return { found, movementRows: movementRows || [], offline: false, cachedAt: null };
      } catch (err) {
        const cached = await getCachedBatch(normalized);
        if (cached) return { found: cached.batch as any, movementRows: [], offline: true, cachedAt: cached.cachedAt };
        throw err;
      }
    },
    onSuccess: ({ found, movementRows, offline, cachedAt }) => {
      setBatch(found);
      setMovements(movementRows);
      setFromCache(Boolean(offline));
      setCachedAt(cachedAt ?? null);
      setStatus(found ? getBatchStatus(found) : "not-found");
      if (!found) toast.error("No batch found for that barcode");
      else if (offline) toast.message("Showing cached batch (offline)");
    },
    onError: (error) => {
      setStatus("not-found");
      toast.error(error.message);
    },
  });

  const stopCamera = () => {
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    setStatus(batch ? getBatchStatus(batch) : "ready");
  };

  const startCamera = async () => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      toast.error("Camera requires HTTPS. Open the app on its published URL.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser does not expose a camera. Use manual search or a USB scanner.");
      return;
    }
    try {
      if (!readerRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        readerRef.current = new BrowserMultiFormatReader(hints);
      }
      // iOS Safari needs the video element to be in the DOM and ready before play.
      const video = videoRef.current!;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: { facingMode: { ideal: "environment" } }, audio: false };

      setStatus("scanning");
      const controls = await readerRef.current.decodeFromConstraints(constraints, video, (result, err, ctrl) => {
        if (result) {
          try { ctrl.stop(); } catch { /* noop */ }
          controlsRef.current = null;
          const value = result.getText();
          setManualCode(value);
          lookupMutation.mutate(value);
        }
      });
      controlsRef.current = controls;

      // Refresh device list after permission was granted (labels become available).
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(list);
      } catch { /* noop */ }
    } catch (err: any) {
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setStatus("no-camera-permission");
        toast.error("Camera permission denied. Allow camera access in browser settings.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("No suitable camera found on this device.");
        setStatus("ready");
      } else {
        toast.error(err?.message || "Could not start the camera.");
        setStatus("ready");
      }
    }
  };

  useEffect(() => () => {
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Barcode Scanner</h1>
        <p className="text-muted-foreground mt-1">Scan an internal batch token to fetch batch details from Cloud Buddy.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="aspect-video rounded-md border bg-muted overflow-hidden">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            </div>
            <Badge variant="outline">{statusLabels[status]}</Badge>
            <div className="flex gap-2">
              <Button onClick={startCamera} disabled={status === "scanning"} className="gap-2 bg-primary text-primary-foreground"><Camera className="h-4 w-4" /> Scan Camera</Button>
              <Button onClick={stopCamera} variant="outline" disabled={status !== "scanning"} className="gap-2"><StopCircle className="h-4 w-4" /> Stop</Button>
            </div>
            {devices.length > 1 && (
              <select
                value={deviceId ?? ""}
                onChange={(e) => setDeviceId(e.target.value || undefined)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto (rear camera)</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2">
              <Input
                autoFocus
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") lookupMutation.mutate(manualCode); }}
                placeholder="Scan or type batch barcode"
              />
              <Button onClick={() => lookupMutation.mutate(manualCode)} variant="outline" className="gap-2"><Search className="h-4 w-4" /> Search</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tip: USB and Bluetooth scanners work too — just focus the input and scan.
              {fromCache && cachedAt && <> Last synced {new Date(cachedAt).toLocaleString()}.</>}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            {!batch ? (
              <div className="p-8 text-center text-muted-foreground">No batch selected. Scan or search a batch barcode.</div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Batch / Lot</p>
                    <h2 className="font-heading text-2xl font-bold">{batch.batch_code}</h2>
                  </div>
                  <Badge variant={status === "expired" || status === "defective" ? "destructive" : "outline"}>{statusLabels[status]}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Info label="Product" value={batch.product_name} />
                  <Info label="Category" value={batch.category} />
                  <Info label="Variant" value={batch.variant || "-"} />
                  <Info label="Price / SRP" value={batch.price ? batch.price.toLocaleString(undefined, { style: "currency", currency: "PHP" }) : "-"} />
                  <Info label="Manufactured" value={batch.manufactured_date} />
                  <Info label="Expiration" value={batch.expiration_date} />
                  <Info label="Shelf Life" value={batch.shelf_life ? `${batch.shelf_life} days` : "-"} />
                  <Info label="Status" value={batch.status} />
                  <Info label="Produced" value={String(batch.quantity_produced)} />
                  <Info label="Remaining" value={String(batch.remaining_quantity)} />
                  <Info label="Defects" value={String(batch.defect_quantity)} />
                  <Info label="Token" value={batch.barcode_token} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recent Stock Movements</p>
                  {movements.length === 0 ? <p className="text-sm text-muted-foreground">No movements found for this batch token.</p> : (
                    <div className="space-y-2">
                      {movements.map((movement) => (
                        <div key={movement.id} className="flex justify-between gap-3 rounded-md border p-3 text-sm">
                          <span>{movement.type} {movement.quantity} - {movement.remarks || "-"}</span>
                          <span className="text-muted-foreground">{new Date(movement.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{value}</p>
    </div>
  );
}

export default BarcodeScanner;
