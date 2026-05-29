import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, AlertTriangle, Clock, ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { buildWeeklyMovementTrend, computeProductStatus } from "@/lib/inventory";

const Dashboard = () => {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => { const { data } = await supabase.from("products").select("*"); return data || []; },
  });
  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => { const { data } = await supabase.from("ingredients").select("*"); return data || []; },
  });
  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => { const { data } = await supabase.from("alerts").select("*").eq("resolved", false).order("created_at", { ascending: false }); return data || []; },
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("stock_movements")
        .select("*")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const productStatuses = products.map(p => computeProductStatus(p.quantity, p.min_stock, p.expiration_date));
  const lowStockCount = ingredients.filter(i => i.current_stock <= i.min_stock).length + productStatuses.filter(status => status === "low-stock" || status === "out-of-stock").length;
  const expiringCount = productStatuses.filter(status => status === "expiring").length;
  const totalStock = products.reduce((sum, p) => sum + p.quantity, 0);
  const chartData = useMemo(() => buildWeeklyMovementTrend(movements), [movements]);
  const recentMovements = movements.slice(0, 5);

  const statCards = [
    { title: "TOTAL PRODUCTS", value: products.length.toLocaleString(), sub: "", icon: Package },
    { title: "AVAILABLE STOCK", value: totalStock.toLocaleString(), sub: "", highlight: true },
    { title: "LOW STOCK ITEMS", value: String(lowStockCount), sub: lowStockCount > 0 ? "Requires attention" : "All good", icon: AlertTriangle },
    { title: "EXPIRING SOON", value: String(expiringCount), sub: "Within 7 days", icon: Clock },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Real-time Elline's Food Product inventory status.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <Card key={i} className={card.highlight ? "bg-secondary border-secondary" : "bg-card"}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</p>
              <p className="text-3xl font-bold font-heading text-foreground mt-2">{card.value}</p>
              {card.sub && <p className="text-sm text-muted-foreground mt-1">{card.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Stock Movement Trend</CardTitle>
            <p className="text-sm text-muted-foreground">Inflow vs Outflow analysis (weekly)</p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="stockIn" stroke="hsl(var(--primary))" strokeWidth={2} name="Stock In" dot={false} />
                  <Line type="monotone" dataKey="stockOut" stroke="hsl(var(--secondary))" strokeWidth={2} name="Stock Out" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="font-heading text-lg">Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : recentMovements.map((m) => (
              <div key={m.id} className="flex items-start gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.type === "IN" ? "bg-success/10 text-success" : m.type === "OUT" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                }`}>
                  {m.type === "IN" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{m.item_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.remarks}</p>
                  <p className="text-[10px] uppercase text-muted-foreground mt-1">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg ${a.urgent ? "bg-destructive/5 border border-destructive/20" : "bg-warning/5 border border-warning/20"}`}>
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${a.urgent ? "text-destructive" : "text-warning"}`} />
                  <p className="text-sm text-foreground flex-1">{a.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
