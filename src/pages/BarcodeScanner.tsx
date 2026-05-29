import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Flashlight, RefreshCw, Search, StopCircle } from "lucide-react";
import { toast } from "sonner";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { normalizeBarcodeToken } from "@/lib/barcode";
import { cacheBatch, cacheBatches, getCachedBatch, getMeta } from "@/lib/offlineCache";

type ScanStatus = "ready" | "requesting-camera" | "scanning" | "checking" | "found" | "not-found" | "unreadable" | "expired" | "near-expiry" | "defective" | "no-camera-permission" | "database-error";

const statusLabels: Record<ScanStatus, string> = {
  ready: "Ready to scan",
  "requesting-camera": "Allow camera access when prompted",
  scanning: "Scanning... hold barcode inside the box",
  checking: "Barcode detected, checking batch...",
  found: "Batch found",
  "not-found": "Barcode scanned but no matching batch found",
  unreadable: "Too blurry or unreadable, try better lighting or move closer",
  expired: "Expired",
  "near-expiry": "Near expiry",
  defective: "Defective",
  "no-camera-permission": "Camera permission needed",
  "database-error": "Barcode read, but database lookup failed",
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

const mapBatchForCache = (batch: any) => {
  const defects = Array.isArray(batch.defects) ? batch.defects : [];
  return {
    batch_id: batch.id,
    batch_code: batch.batch_code,
    barcode_token: batch.barcode_token,
    product_id: batch.product_id,
    product_name: batch.products?.name || "Unknown product",
    category: batch.products?.category || "-",
    variant: batch.products?.variant || null,
    manufactured_date: batch.manufactured_date || batch.production_date,
    expiration_date: batch.expiration_date,
    shelf_life: batch.products?.shelf_life ?? null,
    price: batch.price ?? batch.products?.unit_price ?? 0,
    quantity_produced: batch.quantity_planned,
    remaining_quantity: batch.quantity_produced,
    status: batch.status,
    defect_quantity: defects.reduce((sum: number, defect: any) => sum + Number(defect.quantity || 0), 0),
  };
};

const BarcodeScanner = () => {
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState<ScanStatus>("ready");
  const [batch, setBatch] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ value: string; at: number } | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const syncQuery = useQuery({
    queryKey: ["barcode-offline-sync"],
    enabled: typeof navigator === "undefined" ? false : navigator.onLine,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("*, products(name, category, variant, shelf_life, unit_price), defects(quantity)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data || []).flatMap((batch: any) => {
        const cachedBatch = mapBatchForCache(batch);
        const tokens = [batch.batch_code, batch.barcode_token, batch.barcode_value]
          .map((token) => normalizeBarcodeToken(token || ""))
          .filter(Boolean);
        return Array.from(new Set(tokens)).map((token) => ({ token, batch: cachedBatch }));
      });

      await cacheBatches(rows);
      const syncedAt = Date.now();
      setLastSync(syncedAt);
      return { count: data?.length || 0, syncedAt };
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async (code: string) => {
      const normalized = normalizeBarcodeToken(code);
      if (!normalized) throw new Error("Enter or scan a barcode");
      setStatus("checking");
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
      if (!found) toast.error("Barcode scanned, but no matching batch exists");
      else if (offline) toast.message("Showing cached batch (offline)");
    },
    onError: (error) => {
      setStatus("database-error");
      toast.error(error.message);
    },
  });

  const stopActiveStream = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const stopCamera = () => {
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
    stopActiveStream();
    setTorchOn(false);
    setTorchSupported(false);
    setStatus(batch ? getBatchStatus(batch) : "ready");
  };

  const updateTorchSupport = () => {
    const stream = cameraStreamRef.current ?? (videoRef.current?.srcObject as MediaStream | null);
    const track = stream?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
    setTorchSupported(Boolean(capabilities?.torch));
  };

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((value) => !value);
    } catch {
      toast.error("Flashlight is not available on this camera.");
      setTorchSupported(false);
    }
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
      // Explicitly request camera permission inside the user-gesture handler
      // so the browser shows the permission prompt (some PWAs/iframes silently
      // report "denied" if getUserMedia is wrapped too deep in a library call).
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
          audio: false,
        });
        // Release the probe stream; zxing will re-acquire with full constraints.
        probe.getTracks().forEach((t) => t.stop());
      } catch (permErr: any) {
        throw permErr;
      }

      if (!readerRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        readerRef.current = new BrowserMultiFormatReader(hints);
      }
      // iOS Safari needs the video element to be in the DOM and ready before play.
      const video = videoRef.current!;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      const constraints: MediaStreamConstraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }, audio: false }
        : { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }, audio: false };

      setStatus("scanning");
      scanTimeoutRef.current = window.setTimeout(() => {
        if (status !== "checking" && controlsRef.current) setStatus("unreadable");
      }, 10_000);

      const controls = await readerRef.current.decodeFromConstraints(constraints, video, (result, err, ctrl) => {
        if (result) {
          try { ctrl.stop(); } catch { /* noop */ }
          controlsRef.current = null;
          if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
          const value = normalizeBarcodeToken(result.getText());
          const previous = lastScannedRef.current;
          if (previous?.value === value && Date.now() - previous.at < 2500) return;
          lastScannedRef.current = { value, at: Date.now() };
          setManualCode(value);
          lookupMutation.mutate(value);
        } else if (err && status === "unreadable") {
          setStatus("scanning");
        }
      });
      controlsRef.current = controls;
      window.setTimeout(updateTorchSupport, 350);

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
    if (scanTimeoutRef.current) window.clearTimeout(scanTimeoutRef.current);
    try { controlsRef.current?.stop(); } catch { /* noop */ }
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    getMeta<number>("batches:lastSync").then((value) => {
      if (value) setLastSync(value);
    });
  }, []);

  useEffect(() => {
    const syncOnReconnect = () => {
      void syncQuery.refetch();
    };
    window.addEventListener("online", syncOnReconnect);
    return () => window.removeEventListener("online", syncOnReconnect);
  }, [syncQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Barcode Scanner</h1>
        <p className="text-muted-foreground mt-1">Scan an internal batch token to fetch batch details from Elline's Food Product.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="relative aspect-video rounded-md border bg-white overflow-hidden">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-[78%] rounded-md border-4 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.22)]" />
              </div>
            </div>
            <Badge variant={status === "not-found" || status === "unreadable" || status === "database-error" || status === "no-camera-permission" ? "destructive" : "outline"}>
              {statusLabels[status]}
            </Badge>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startCamera} disabled={status === "scanning"} className="gap-2 bg-primary text-primary-foreground"><Camera className="h-4 w-4" /> Scan Camera</Button>
              <Button onClick={stopCamera} variant="outline" disabled={status !== "scanning"} className="gap-2"><StopCircle className="h-4 w-4" /> Stop</Button>
              <Button onClick={toggleTorch} variant="outline" disabled={!torchSupported} className="gap-2"><Flashlight className="h-4 w-4" /> {torchOn ? "Torch Off" : "Torch"}</Button>
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
              Tip: USB and Bluetooth scanners work too - just focus the input and scan.
              {fromCache && cachedAt && <> Last synced {new Date(cachedAt).toLocaleString()}.</>}
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <span>
                Offline barcode cache:{" "}
                {syncQuery.isFetching ? "syncing..." : lastSync ? `synced ${new Date(lastSync).toLocaleString()}` : "not synced yet"}
              </span>
              <Button size="sm" variant="outline" className="ml-auto h-7 gap-1" onClick={() => syncQuery.refetch()} disabled={syncQuery.isFetching}>
                <RefreshCw className="h-3.5 w-3.5" /> Sync
              </Button>
            </div>
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
