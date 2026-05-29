import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Ingredients = lazy(() => import("./pages/Ingredients"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Recipes = lazy(() => import("./pages/Recipes"));
const BatchProduction = lazy(() => import("./pages/BatchProduction"));
const Receiving = lazy(() => import("./pages/Receiving"));
const Dispatch = lazy(() => import("./pages/Dispatch"));
const Defects = lazy(() => import("./pages/Defects"));
const StockMovements = lazy(() => import("./pages/StockMovements"));
const InventoryAdjustments = lazy(() => import("./pages/InventoryAdjustments"));
const InventoryActivity = lazy(() => import("./pages/InventoryActivity"));
const BarcodeScanner = lazy(() => import("./pages/BarcodeScanner"));
const BarcodePrinting = lazy(() => import("./pages/BarcodePrinting"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Reports = lazy(() => import("./pages/Reports"));
const RoleManagement = lazy(() => import("./pages/RoleManagement"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">Loading...</p></div>;
}

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/products" element={<ProtectedRoute><Products /></ProtectedRoute>} />
        <Route path="/ingredients" element={<ProtectedRoute><Ingredients /></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="/recipes" element={<ProtectedRoute><Recipes /></ProtectedRoute>} />
        <Route path="/batches" element={<ProtectedRoute><BatchProduction /></ProtectedRoute>} />
        <Route path="/receiving" element={<ProtectedRoute><Receiving /></ProtectedRoute>} />
        <Route path="/dispatch" element={<ProtectedRoute><Dispatch /></ProtectedRoute>} />
        <Route path="/defects" element={<ProtectedRoute><Defects /></ProtectedRoute>} />
        <Route path="/stock-movements" element={<ProtectedRoute><StockMovements /></ProtectedRoute>} />
        <Route path="/adjustments" element={<ProtectedRoute><InventoryAdjustments /></ProtectedRoute>} />
        <Route path="/activity" element={<ProtectedRoute><InventoryActivity /></ProtectedRoute>} />
        <Route path="/barcode-scanner" element={<ProtectedRoute><BarcodeScanner /></ProtectedRoute>} />
        <Route path="/barcode-printing" element={<ProtectedRoute><BarcodePrinting /></ProtectedRoute>} />
        <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute adminOnly><RoleManagement /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
