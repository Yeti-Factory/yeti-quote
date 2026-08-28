// Types métier de l'API PostgreSQL native OVH.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_defaults: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      clients: {
        Row: {
          adresse: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          email: string | null
          entreprise: string
          id: string
          notes: string | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entreprise: string
          id?: string
          notes?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          entreprise?: string
          id?: string
          notes?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dossiers: {
        Row: {
          client_id: string
          contact: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          objet: string
          onedrive_note: string | null
          params: Json
          payload: Json
          reference: string
          results: Json
          statut: Database["public"]["Enums"]["dossier_statut"]
          type: Database["public"]["Enums"]["dossier_type"]
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          objet: string
          onedrive_note?: string | null
          params?: Json
          payload?: Json
          reference: string
          results?: Json
          statut?: Database["public"]["Enums"]["dossier_statut"]
          type: Database["public"]["Enums"]["dossier_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          objet?: string
          onedrive_note?: string | null
          params?: Json
          payload?: Json
          reference?: string
          results?: Json
          statut?: Database["public"]["Enums"]["dossier_statut"]
          type?: Database["public"]["Enums"]["dossier_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dossiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "user"
      dossier_statut: "brouillon" | "valide" | "archive"
      dossier_type: "standard" | "contra" | "kits" | "stands"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseSchema = Database

type DefaultSchema = DatabaseSchema["public"]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseSchema },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseSchema
  }
    ? keyof (DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseSchema
}
  ? (DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseSchema },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseSchema
  }
    ? keyof DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseSchema
}
  ? DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseSchema },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseSchema
  }
    ? keyof DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseSchema
}
  ? DatabaseSchema[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseSchema },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseSchema
  }
    ? keyof DatabaseSchema[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseSchema
}
  ? DatabaseSchema[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseSchema },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseSchema
  }
    ? keyof DatabaseSchema[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseSchema
}
  ? DatabaseSchema[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      dossier_statut: ["brouillon", "valide", "archive"],
      dossier_type: ["standard", "contra", "kits", "stands"],
    },
  },
} as const
