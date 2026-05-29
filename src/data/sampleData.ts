// Sample data for Elline's Food Product.

export interface Product {
  id: string;
  name: string;
  category: string;
  variant: string;
  shelfLife: number;
  quantity: number;
  status: "in-stock" | "low-stock" | "expiring" | "out-of-stock";
  expirationDate: string;
  createdAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  supplierId: string;
  expirationDate: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  email: string;
  address: string;
}

export interface Recipe {
  id: string;
  productId: string;
  ingredients: { ingredientId: string; quantity: number }[];
}

export interface Batch {
  id: string;
  batchCode: string;
  productId: string;
  quantityPlanned: number;
  quantityProduced: number;
  productionDate: string;
  expirationDate: string;
  status: "planned" | "in-progress" | "completed";
}

export interface StockMovement {
  id: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  itemType: "ingredient" | "product";
  itemId: string;
  itemName: string;
  quantity: number;
  date: string;
  remarks: string;
  user: string;
}

export interface Alert {
  id: string;
  type: "low-stock" | "expiring" | "critical";
  message: string;
  itemName: string;
  date: string;
  urgent: boolean;
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  timestamp: string;
  details: string;
}

export const products: Product[] = [
  { id: "P001", name: "Banana Ketchup", category: "Condiments", variant: "1L", shelfLife: 210, quantity: 310, status: "in-stock", expirationDate: "2026-10-12", createdAt: "2025-01-15" },
  { id: "P002", name: "Soy Sauce", category: "Condiments", variant: "1L", shelfLife: 240, quantity: 12, status: "expiring", expirationDate: "2026-04-05", createdAt: "2024-06-20" },
  { id: "P003", name: "Vinegar", category: "Condiments", variant: "1L", shelfLife: 240, quantity: 120, status: "low-stock", expirationDate: "2026-07-21", createdAt: "2024-11-03" },
  { id: "P004", name: "Sweet Sauce", category: "Condiments", variant: "500ml", shelfLife: 210, quantity: 450, status: "in-stock", expirationDate: "2026-12-15", createdAt: "2025-03-10" },
  { id: "P005", name: "Fish Sauce", category: "Condiments", variant: "750ml", shelfLife: 240, quantity: 85, status: "in-stock", expirationDate: "2026-11-20", createdAt: "2025-01-10" },
  { id: "P006", name: "Tomato Sauce (Estimated Placeholder)", category: "Condiments", variant: "500ml", shelfLife: 210, quantity: 0, status: "out-of-stock", expirationDate: "2026-08-30", createdAt: "2025-02-28" },
  { id: "P007", name: "Hot Sauce (Estimated Placeholder)", category: "Condiments", variant: "350ml", shelfLife: 210, quantity: 220, status: "in-stock", expirationDate: "2026-09-14", createdAt: "2025-04-01" },
  { id: "P008", name: "Oyster Sauce (Estimated Placeholder)", category: "Condiments", variant: "500ml", shelfLife: 240, quantity: 5, status: "low-stock", expirationDate: "2026-05-18", createdAt: "2025-03-22" },
  { id: "P009", name: "Spaghetti Sauce (Estimated Placeholder)", category: "Condiments", variant: "500ml", shelfLife: 210, quantity: 60, status: "in-stock", expirationDate: "2026-09-30", createdAt: "2025-04-03" },
];

export const ingredients: Ingredient[] = [
  { id: "I001", name: "Water", unit: "liters", currentStock: 1000, minStock: 200, supplierId: "S001", expirationDate: "N/A" },
  { id: "I002", name: "Sugar", unit: "kg", currentStock: 200, minStock: 50, supplierId: "S002", expirationDate: "2027-01-20" },
  { id: "I003", name: "Iodized Salt", unit: "kg", currentStock: 180, minStock: 30, supplierId: "S002", expirationDate: "2028-03-10" },
  { id: "I004", name: "Garlic", unit: "kg", currentStock: 40, minStock: 10, supplierId: "S003", expirationDate: "2026-09-01" },
  { id: "I005", name: "Cane Vinegar", unit: "liters", currentStock: 500, minStock: 100, supplierId: "S001", expirationDate: "2027-05-15" },
  { id: "I006", name: "Spices", unit: "kg", currentStock: 40, minStock: 15, supplierId: "S003", expirationDate: "2026-12-01" },
  { id: "I007", name: "Hydrolyzed Soybean Protein", unit: "kg", currentStock: 300, minStock: 80, supplierId: "S004", expirationDate: "2027-02-28" },
  { id: "I008", name: "Fish Extract", unit: "liters", currentStock: 120, minStock: 25, supplierId: "S004", expirationDate: "2026-12-30" },
  { id: "I009", name: "Modified Starch", unit: "kg", currentStock: 120, minStock: 25, supplierId: "S002", expirationDate: "2027-02-01" },
  { id: "I010", name: "Sodium Benzoate", unit: "kg", currentStock: 20, minStock: 5, supplierId: "S003", expirationDate: "2028-01-01" },
  { id: "I011", name: "Caramel as Color", unit: "liters", currentStock: 35, minStock: 8, supplierId: "S003", expirationDate: "2027-04-15" },
  { id: "I012", name: "Banana", unit: "kg", currentStock: 150, minStock: 40, supplierId: "S001", expirationDate: "2026-06-15" },
  { id: "I013", name: "Tomato Base (Estimated Placeholder)", unit: "kg", currentStock: 75, minStock: 20, supplierId: "S001", expirationDate: "2026-06-15" },
  { id: "I014", name: "Caramel Color", unit: "liters", currentStock: 35, minStock: 8, supplierId: "S003", expirationDate: "2027-04-15" },
  { id: "I015", name: "Caramel as Colorant", unit: "liters", currentStock: 35, minStock: 8, supplierId: "S003", expirationDate: "2027-04-15" },
];

export const suppliers: Supplier[] = [
  { id: "S001", name: "Fresh Farms Co.", contact: "+63 917 123 4567", email: "orders@freshfarms.ph", address: "Lot 5 Industrial Park, Bulacan" },
  { id: "S002", name: "Manila Sugar Mills", contact: "+63 918 234 5678", email: "supply@manilasugar.com", address: "Brgy. San Juan, Pampanga" },
  { id: "S003", name: "Spice Route Trading", contact: "+63 919 345 6789", email: "info@spiceroute.ph", address: "Davao Export Zone" },
  { id: "S004", name: "Pacific Soy Inc.", contact: "+63 920 456 7890", email: "sales@pacificsoy.com", address: "Subic Bay Freeport" },
  { id: "S005", name: "Global Pack Solutions", contact: "+63 921 567 8901", email: "order@globalpack.ph", address: "Cavite Industrial Estate" },
];

export const batches: Batch[] = [
  { id: "B001", batchCode: "CB-BTCH-20251010-BANANAKETC-A1B2C3D4", productId: "P001", quantityPlanned: 500, quantityProduced: 495, productionDate: "2025-10-10", expirationDate: "2026-05-08", status: "completed" },
  { id: "B002", batchCode: "CB-BTCH-20250915-SOYSAUCE-11AA22BB", productId: "P002", quantityPlanned: 200, quantityProduced: 198, productionDate: "2025-09-15", expirationDate: "2026-05-13", status: "completed" },
  { id: "B003", batchCode: "CB-BTCH-20260415-SWEETSAUCE-55CC66DD", productId: "P004", quantityPlanned: 300, quantityProduced: 0, productionDate: "2026-04-15", expirationDate: "2026-11-11", status: "planned" },
  { id: "B004", batchCode: "CB-BTCH-20260412-HOTSAUCE-77EE88FF", productId: "P007", quantityPlanned: 250, quantityProduced: 120, productionDate: "2026-04-12", expirationDate: "2026-11-08", status: "in-progress" },
];

export const stockMovements: StockMovement[] = [
  { id: "M001", type: "IN", itemType: "ingredient", itemId: "I001", itemName: "Water", quantity: 50, date: "2026-04-12T08:30:00", remarks: "New delivery from Fresh Farms", user: "Admin" },
  { id: "M002", type: "OUT", itemType: "ingredient", itemId: "I002", itemName: "Sugar", quantity: 25, date: "2026-04-12T09:15:00", remarks: "Used in batch CB-BTCH-20260412-HOTSAUCE-77EE88FF", user: "Admin" },
  { id: "M003", type: "IN", itemType: "product", itemId: "P001", itemName: "Banana Ketchup", quantity: 500, date: "2026-04-11T14:00:00", remarks: "Batch CB-BTCH-20251010-BANANAKETC-A1B2C3D4 completed", user: "Admin" },
  { id: "M004", type: "OUT", itemType: "product", itemId: "P007", itemName: "Hot Sauce (Estimated Placeholder)", quantity: 100, date: "2026-04-11T16:30:00", remarks: "Dispatched to Central Hub", user: "Admin" },
  { id: "M005", type: "ADJUSTMENT", itemType: "ingredient", itemId: "I003", itemName: "Iodized Salt", quantity: -2, date: "2026-04-10T11:00:00", remarks: "Physical count correction", user: "Admin" },
];

export const alerts: Alert[] = [
  { id: "A001", type: "low-stock", message: "Tomato Base (Estimated Placeholder) is below critical level", itemName: "Tomato Base (Estimated Placeholder)", date: "2026-04-12", urgent: true },
  { id: "A002", type: "low-stock", message: "Garlic is below minimum stock", itemName: "Garlic", date: "2026-04-12", urgent: true },
  { id: "A003", type: "expiring", message: "Soy Sauce batch CB-BTCH-20250915-SOYSAUCE-11AA22BB expires soon", itemName: "Soy Sauce", date: "2026-04-12", urgent: true },
  { id: "A004", type: "low-stock", message: "Oyster Sauce stock critically low (5 units)", itemName: "Oyster Sauce", date: "2026-04-12", urgent: false },
  { id: "A005", type: "expiring", message: "Tomato Base (Estimated Placeholder) expires Jun 15", itemName: "Tomato Base (Estimated Placeholder)", date: "2026-04-11", urgent: false },
];

export const auditLogs: AuditLog[] = [
  { id: "L001", user: "Admin", action: "CREATE", module: "Batch Production", timestamp: "2026-04-12T09:00:00", details: "Created batch CB-BTCH-20260412-HOTSAUCE-77EE88FF for Hot Sauce" },
  { id: "L002", user: "Admin", action: "UPDATE", module: "Ingredients", timestamp: "2026-04-12T08:30:00", details: "Stock in: 50 liters Water" },
  { id: "L003", user: "Admin", action: "UPDATE", module: "Stock Movements", timestamp: "2026-04-11T16:30:00", details: "Dispatched 100 Hot Sauce to Central Hub" },
  { id: "L004", user: "Admin", action: "CREATE", module: "Products", timestamp: "2026-04-10T10:00:00", details: "Added new product: Spicy Ketchup 500ml" },
  { id: "L005", user: "Admin", action: "ADJUSTMENT", module: "Ingredients", timestamp: "2026-04-10T11:00:00", details: "Manual adjustment: Iodized Salt -2kg (physical count)" },
];

export const recipes: Recipe[] = [
  { id: "R001", productId: "P001", ingredients: [{ ingredientId: "I012", quantity: 0.25 }, { ingredientId: "I001", quantity: 0.2 }, { ingredientId: "I002", quantity: 0.08 }, { ingredientId: "I009", quantity: 0.03 }, { ingredientId: "I003", quantity: 0.01 }, { ingredientId: "I004", quantity: 0.005 }, { ingredientId: "I005", quantity: 0.02 }, { ingredientId: "I010", quantity: 0.001 }] },
  { id: "R002", productId: "P002", ingredients: [{ ingredientId: "I003", quantity: 0.08 }, { ingredientId: "I001", quantity: 0.45 }, { ingredientId: "I007", quantity: 0.12 }, { ingredientId: "I011", quantity: 0.003 }, { ingredientId: "I010", quantity: 0.001 }] },
  { id: "R003", productId: "P003", ingredients: [{ ingredientId: "I001", quantity: 0.45 }, { ingredientId: "I005", quantity: 0.4 }, { ingredientId: "I015", quantity: 0.002 }] },
  { id: "R004", productId: "P004", ingredients: [{ ingredientId: "I002", quantity: 0.18 }, { ingredientId: "I001", quantity: 0.25 }, { ingredientId: "I006", quantity: 0.01 }, { ingredientId: "I009", quantity: 0.03 }, { ingredientId: "I003", quantity: 0.01 }, { ingredientId: "I004", quantity: 0.005 }, { ingredientId: "I010", quantity: 0.001 }] },
  { id: "R005", productId: "P005", ingredients: [{ ingredientId: "I001", quantity: 0.4 }, { ingredientId: "I008", quantity: 0.2 }, { ingredientId: "I003", quantity: 0.08 }, { ingredientId: "I010", quantity: 0.001 }, { ingredientId: "I014", quantity: 0.002 }] },
  { id: "R006", productId: "P006", ingredients: [{ ingredientId: "I013", quantity: 0.3 }, { ingredientId: "I001", quantity: 0.2 }, { ingredientId: "I002", quantity: 0.06 }, { ingredientId: "I003", quantity: 0.01 }] },
];
