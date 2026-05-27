// Cloud Buddy — Inventory Management System
import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

if (!hasSupabaseConfig) {
  root.render(
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration Required</p>
        <h1 className="font-heading text-2xl font-bold mt-2">Supabase environment variables are missing</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the deployment environment, then redeploy Cloud Buddy.
        </p>
      </div>
    </div>,
  );
} else {
  import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
}
