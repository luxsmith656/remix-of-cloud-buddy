import {
  LayoutDashboard, Package, Leaf, Truck, BookOpen,
  Factory, AlertTriangle, ArrowLeftRight, Bell, BarChart3,
  ClipboardList, LogOut, ShieldAlert, ClipboardCheck, UserCog,
  PackagePlus, PackageMinus, History, ScanBarcode, Barcode,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ellineLogo from "@/assets/elline-logo.png";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Ingredients", url: "/ingredients", icon: Leaf },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Recipes", url: "/recipes", icon: BookOpen },
  { title: "Batch Production", url: "/batches", icon: Factory },
  { title: "Receiving", url: "/receiving", icon: PackagePlus },
  { title: "Dispatch", url: "/dispatch", icon: PackageMinus },
  { title: "Defects", url: "/defects", icon: ShieldAlert },
  { title: "Stock In/Out", url: "/stock-movements", icon: ArrowLeftRight },
  { title: "Adjustments", url: "/adjustments", icon: ClipboardCheck },
  { title: "Barcode Scanner", url: "/barcode-scanner", icon: ScanBarcode },
  { title: "Barcode Printing", url: "/barcode-printing", icon: Barcode },
  { title: "Activity", url: "/activity", icon: History },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Finance Logs", url: "/audit-logs", icon: ClipboardList },
  { title: "Roles", url: "/roles", icon: UserCog },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { logout, isAdmin } = useAuth();
  const visibleNavItems = navItems.filter((item) => item.url !== "/roles" || isAdmin);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <img src={ellineLogo} alt="Elline's Food Product" width={40} height={40} />
        {!collapsed && (
          <div>
            <p className="font-heading font-bold text-sm text-foreground leading-tight">Elline's Food Product</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Inventory System</p>
          </div>
        )}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50 rounded-lg px-3 py-2.5 flex items-center gap-3 text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <button
          onClick={logout}
          className="flex items-center gap-3 text-sm text-muted-foreground hover:text-destructive transition-colors w-full px-3 py-2"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
