export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          id: string
          item_name: string | null
          message: string
          resolved: boolean
          type: Database["public"]["Enums"]["alert_type"]
          urgent: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          item_name?: string | null
          message: string
          resolved?: boolean
          type?: Database["public"]["Enums"]["alert_type"]
          urgent?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string | null
          message?: string
          resolved?: boolean
          type?: Database["public"]["Enums"]["alert_type"]
          urgent?: boolean
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          module: string
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          module: string
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          module?: string
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          barcode_token: string
          barcode_value: string
          batch_code: string
          created_at: string
          created_by: string | null
          expiration_date: string | null
          id: string
          manufactured_date: string
          price: number
          product_id: string
          production_date: string
          quantity_planned: number
          quantity_produced: number
          status: Database["public"]["Enums"]["batch_status"]
          updated_at: string
        }
        Insert: {
          barcode_token: string
          barcode_value: string
          batch_code: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          manufactured_date: string
          price?: number
          product_id: string
          production_date?: string
          quantity_planned?: number
          quantity_produced?: number
          status?: Database["public"]["Enums"]["batch_status"]
          updated_at?: string
        }
        Update: {
          barcode_token?: string
          barcode_value?: string
          batch_code?: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          manufactured_date?: string
          price?: number
          product_id?: string
          production_date?: string
          quantity_planned?: number
          quantity_produced?: number
          status?: Database["public"]["Enums"]["batch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          quantity: number
          reason: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          quantity?: number
          reason?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          quantity?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defects_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_receipts: {
        Row: {
          created_at: string
          expiration_date: string | null
          id: string
          ingredient_id: string
          invoice_number: string | null
          lot_number: string | null
          notes: string | null
          quantity: number
          received_by: string | null
          received_date: string
          supplier_id: string | null
          total_cost: number | null
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          ingredient_id: string
          invoice_number?: string | null
          lot_number?: string | null
          notes?: string | null
          quantity: number
          received_by?: string | null
          received_date?: string
          supplier_id?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          expiration_date?: string | null
          id?: string
          ingredient_id?: string
          invoice_number?: string | null
          lot_number?: string | null
          notes?: string | null
          quantity?: number
          received_by?: string | null
          received_date?: string
          supplier_id?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_receipts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          barcode: string | null
          created_at: string
          current_stock: number
          expiration_date: string | null
          id: string
          min_stock: number
          name: string
          supplier_id: string | null
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          current_stock?: number
          expiration_date?: string | null
          id?: string
          min_stock?: number
          name: string
          supplier_id?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          current_stock?: number
          expiration_date?: string | null
          id?: string
          min_stock?: number
          name?: string
          supplier_id?: string | null
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_activity: {
        Row: {
          activity_type: string
          created_at: string
          details: string | null
          id: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity: number | null
          reference_id: string | null
          reference_table: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: string | null
          id?: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity?: number | null
          reference_id?: string | null
          reference_table?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: string | null
          id?: string
          item_id?: string
          item_name?: string
          item_type?: Database["public"]["Enums"]["movement_item_type"]
          quantity?: number | null
          reference_id?: string | null
          reference_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_adjustment_requests: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity: number
          reason: string
          requested_by: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity: number
          reason: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_name?: string
          item_type?: Database["public"]["Enums"]["movement_item_type"]
          quantity?: number
          reason?: string
          requested_by?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          updated_at?: string
        }
        Relationships: []
      }
      product_dispatches: {
        Row: {
          batch_id: string | null
          created_at: string
          destination: string | null
          dispatch_type: string
          dispatched_by: string | null
          dispatched_date: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reference_number: string | null
          total_value: number | null
          unit_price: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          destination?: string | null
          dispatch_type?: string
          dispatched_by?: string | null
          dispatched_date?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_number?: string | null
          total_value?: number | null
          unit_price?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          destination?: string | null
          dispatch_type?: string
          dispatched_by?: string | null
          dispatched_date?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_number?: string | null
          total_value?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_dispatches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_dispatches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          estimated_unit_cost: number
          expiration_date: string | null
          id: string
          image_url: string | null
          min_stock: number
          name: string
          quantity: number
          shelf_life: number | null
          status: Database["public"]["Enums"]["product_status"]
          unit_price: number
          updated_at: string
          variant: string | null
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          estimated_unit_cost?: number
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          quantity?: number
          shelf_life?: number | null
          status?: Database["public"]["Enums"]["product_status"]
          unit_price?: number
          updated_at?: string
          variant?: string | null
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          estimated_unit_cost?: number
          expiration_date?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          quantity?: number
          shelf_life?: number | null
          status?: Database["public"]["Enums"]["product_status"]
          unit_price?: number
          updated_at?: string
          variant?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          quantity: number
          recipe_id: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          quantity?: number
          recipe_id: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          quantity?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          name: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_code: string | null
          batch_id: string | null
          created_at: string
          id: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity: number
          remarks: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id: string | null
        }
        Insert: {
          batch_code?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["movement_item_type"]
          quantity: number
          remarks?: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id?: string | null
        }
        Update: {
          batch_code?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_name?: string
          item_type?: Database["public"]["Enums"]["movement_item_type"]
          quantity?: number
          remarks?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_product_status: {
        Args: {
          expiration_value: string
          min_stock_value: number
          quantity_value: number
        }
        Returns: Database["public"]["Enums"]["product_status"]
      }
      create_inventory_alert: {
        Args: {
          alert_type_value: Database["public"]["Enums"]["alert_type"]
          item_name_value: string
          message_value: string
          urgent_value?: boolean
        }
        Returns: undefined
      }
      dispatch_product: {
        Args: {
          batch_id_value?: string
          destination_value?: string
          dispatch_type_value?: string
          dispatched_date_value?: string
          notes_value?: string
          product_id_value: string
          quantity_value: number
          reference_number_value?: string
          unit_price_value?: number
        }
        Returns: string
      }
      find_batch_by_barcode: {
        Args: { barcode_value_value: string }
        Returns: {
          barcode_token: string
          batch_code: string
          batch_id: string
          category: string
          defect_quantity: number
          expiration_date: string
          manufactured_date: string
          price: number
          product_id: string
          product_name: string
          quantity_produced: number
          remaining_quantity: number
          shelf_life: number
          status: Database["public"]["Enums"]["batch_status"]
          variant: string
        }[]
      }
      generate_batch_token: {
        Args: { product_name_value: string; production_date_value: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_defect: {
        Args: {
          batch_id_value: string
          quantity_value: number
          reason_value?: string
        }
        Returns: string
      }
      normalize_batch_token: { Args: { value: string }; Returns: string }
      produce_batch: {
        Args: {
          batch_code_value?: string
          expiration_date_value: string
          product_id_value: string
          production_date_value?: string
          quantity_value: number
        }
        Returns: string
      }
      product_code: { Args: { value: string }; Returns: string }
      receive_ingredient: {
        Args: {
          expiration_date_value?: string
          ingredient_id_value: string
          invoice_number_value?: string
          lot_number_value?: string
          notes_value?: string
          quantity_value: number
          received_date_value?: string
          supplier_id_value?: string
          unit_cost_value?: number
        }
        Returns: string
      }
      refresh_inventory_alerts: { Args: never; Returns: undefined }
      request_inventory_adjustment: {
        Args: {
          item_id_value: string
          item_type_value: Database["public"]["Enums"]["movement_item_type"]
          quantity_value: number
          reason_value: string
        }
        Returns: string
      }
      review_inventory_adjustment: {
        Args: {
          approve_value: boolean
          request_id_value: string
          review_note_value?: string
        }
        Returns: undefined
      }
      save_recipe: {
        Args: {
          image_url_value: string
          ingredients_value: Json
          name_value: string
          product_id_value: string
          recipe_id_value: string
        }
        Returns: string
      }
      set_user_role: {
        Args: {
          enabled_value: boolean
          role_value: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      adjustment_status: "pending" | "approved" | "rejected"
      alert_type: "low-stock" | "expiring" | "critical"
      app_role: "admin" | "user"
      batch_status: "planned" | "in-progress" | "completed"
      movement_item_type: "ingredient" | "product"
      movement_type: "IN" | "OUT" | "ADJUSTMENT"
      product_status: "in-stock" | "low-stock" | "expiring" | "out-of-stock"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      adjustment_status: ["pending", "approved", "rejected"],
      alert_type: ["low-stock", "expiring", "critical"],
      app_role: ["admin", "user"],
      batch_status: ["planned", "in-progress", "completed"],
      movement_item_type: ["ingredient", "product"],
      movement_type: ["IN", "OUT", "ADJUSTMENT"],
      product_status: ["in-stock", "low-stock", "expiring", "out-of-stock"],
    },
  },
} as const
