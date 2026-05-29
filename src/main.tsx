// Elline's Food Product - Inventory Management System
import { createRoot } from "react-dom/client";
import "./index.css";
import { hasSupabaseConfig } from "./integrations/supabase/config";
import { initPwa } from "./lib/pwa";

const root = createRoot(document.getElementById("root")!);

// Recover from stale chunk references after a new deploy. When a previously
// cached index.html references a JS chunk that no longer exists, the dynamic
// import rejects with "error loading dynamically imported module". Force a
// one-time hard reload so the browser fetches the fresh index.html + chunks.
if (typeof window !== "undefined") {
  const reloadOnce = () => {
    const key = "elline-chunk-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  };
  const isChunkError = (msg: unknown) =>
    typeof msg === "string" &&
    (msg.includes("dynamically imported module") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed"));
  window.addEventListener("error", (e) => {
    if (isChunkError(e.message)) reloadOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    if (isChunkError(reason?.message ?? String(reason))) reloadOnce();
  });
}

if (!hasSupabaseConfig) {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration Required</p>
        <h1 className="font-heading text-2xl font-bold mt-2">Supabase environment variables are missing</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the deployment environment, then redeploy Elline's Food Product.
        </p>
      </div>
    </div>,
  );
} else {
  import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
    initPwa();
  });
}
