import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyPendingUpdate, subscribePwa, type PwaStatus } from "@/lib/pwa";
import { getPendingSyncCount, processSyncQueue, subscribeOfflineSync, syncCoreTables } from "@/lib/offlineStore";
import { toast } from "sonner";

export function PwaStatusBar() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [status, setStatus] = useState<PwaStatus>("idle");
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refreshPending = () => { void getPendingSyncCount().then(setPendingSync); };
    const goOnline = () => {
      setOnline(true);
      setSyncing(true);
      processSyncQueue()
        .then(({ synced, failed }) => {
          if (synced) toast.success(`${synced} offline change${synced === 1 ? "" : "s"} synced`);
          if (failed) toast.error(`${failed} offline change${failed === 1 ? "" : "s"} need review`);
        })
        .finally(() => {
          void syncCoreTables();
          setSyncing(false);
          refreshPending();
        });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const unsub = subscribePwa(setStatus);
    const unsubOffline = subscribeOfflineSync(refreshPending);
    refreshPending();
    if (navigator.onLine) void processSyncQueue().finally(() => {
      refreshPending();
      void syncCoreTables();
    });
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      unsub();
      unsubOffline();
    };
  }, []);

  if (online && status !== "updated" && pendingSync === 0 && !syncing) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/60 px-4 py-2 text-xs">
      {!online && (
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-warning" />
          <span className="font-medium text-foreground">Offline mode</span>
          <span className="text-muted-foreground">Showing last-synced data. Offline changes are saved as Pending Sync.</span>
        </div>
      )}
      {(pendingSync > 0 || syncing) && (
        <div className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 text-primary ${syncing ? "animate-spin" : ""}`} />
          <span className="font-medium text-foreground">{syncing ? "Syncing" : `${pendingSync} Pending Sync`}</span>
          <Button size="sm" variant="outline" onClick={() => void processSyncQueue().finally(() => getPendingSyncCount().then(setPendingSync))} disabled={!online || syncing}>
            Sync Now
          </Button>
        </div>
      )}
      {status === "updated" && (
        <div className="flex items-center gap-2 ml-auto">
          <RefreshCw className="h-4 w-4 text-primary" />
          <span className="text-foreground">A new version of Elline's Food Product is available.</span>
          <Button size="sm" variant="outline" onClick={() => applyPendingUpdate()}>Reload</Button>
        </div>
      )}
    </div>
  );
}
