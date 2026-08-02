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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      complaint_images: {
        Row: {
          complaint_id: string
          created_at: string
          id: string
          image_url: string
          kind: string
          uploaded_by: string | null
        }
        Insert: {
          complaint_id: string
          created_at?: string
          id?: string
          image_url: string
          kind?: string
          uploaded_by?: string | null
        }
        Update: {
          complaint_id?: string
          created_at?: string
          id?: string
          image_url?: string
          kind?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_images_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_supports: {
        Row: {
          citizen_id: string
          complaint_id: string
          created_at: string
          id: string
        }
        Insert: {
          citizen_id: string
          complaint_id: string
          created_at?: string
          id?: string
        }
        Update: {
          citizen_id?: string
          complaint_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_supports_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_supports_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          address: string
          ai_assignment_reason: string | null
          ai_category_suggestion: string | null
          ai_priority_score: number | null
          category: string
          citizen_id: string | null
          created_at: string
          department_id: string | null
          description: string
          district_id: string | null
          id: string
          lat: number | null
          lng: number | null
          officer_id: string | null
          priority: Database["public"]["Enums"]["complaint_priority"]
          reference: string
          remarks: string | null
          reporter_name: string
          reporter_phone: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["complaint_status"]
          support_count: number
          title: string
          updated_at: string
        }
        Insert: {
          address?: string
          ai_assignment_reason?: string | null
          ai_category_suggestion?: string | null
          ai_priority_score?: number | null
          category?: string
          citizen_id?: string | null
          created_at?: string
          department_id?: string | null
          description?: string
          district_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          officer_id?: string | null
          priority?: Database["public"]["Enums"]["complaint_priority"]
          reference?: string
          remarks?: string | null
          reporter_name?: string
          reporter_phone?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          support_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          address?: string
          ai_assignment_reason?: string | null
          ai_category_suggestion?: string | null
          ai_priority_score?: number | null
          category?: string
          citizen_id?: string | null
          created_at?: string
          department_id?: string | null
          description?: string
          district_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          officer_id?: string | null
          priority?: Database["public"]["Enums"]["complaint_priority"]
          reference?: string
          remarks?: string | null
          reporter_name?: string
          reporter_phone?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
          support_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_citizen_id_fkey"
            columns: ["citizen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "officers"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          category: string
          code: string
          contact_email: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category?: string
          code: string
          contact_email?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          code?: string
          contact_email?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      districts: {
        Row: {
          center_lat: number
          center_lng: number
          city: string
          code: string
          created_at: string
          id: string
          name: string
          population: number
        }
        Insert: {
          center_lat?: number
          center_lng?: number
          city?: string
          code: string
          created_at?: string
          id?: string
          name: string
          population?: number
        }
        Update: {
          center_lat?: number
          center_lng?: number
          city?: string
          code?: string
          created_at?: string
          id?: string
          name?: string
          population?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          complaint_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          user_id: string
        }
        Insert: {
          complaint_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title: string
          user_id: string
        }
        Update: {
          complaint_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      officers: {
        Row: {
          active_count: number
          avg_resolution_hours: number
          created_at: string
          department_id: string | null
          district_id: string | null
          employee_code: string
          full_name: string
          id: string
          phone: string | null
          profile_id: string | null
          rating: number
          resolved_count: number
        }
        Insert: {
          active_count?: number
          avg_resolution_hours?: number
          created_at?: string
          department_id?: string | null
          district_id?: string | null
          employee_code: string
          full_name: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          rating?: number
          resolved_count?: number
        }
        Update: {
          active_count?: number
          avg_resolution_hours?: number
          created_at?: string
          department_id?: string | null
          district_id?: string | null
          employee_code?: string
          full_name?: string
          id?: string
          phone?: string | null
          profile_id?: string | null
          rating?: number
          resolved_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "officers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officers_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          district_id: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          district_id?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          district_id?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      status_history: {
        Row: {
          changed_by: string | null
          changed_by_name: string
          complaint_id: string
          created_at: string
          id: string
          remarks: string | null
          status: Database["public"]["Enums"]["complaint_status"]
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string
          complaint_id: string
          created_at?: string
          id?: string
          remarks?: string | null
          status: Database["public"]["Enums"]["complaint_status"]
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string
          complaint_id?: string
          created_at?: string
          id?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["complaint_status"]
        }
        Relationships: [
          {
            foreignKeyName: "status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_history_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      app_role: "citizen" | "department_admin" | "field_officer"
      complaint_priority: "low" | "medium" | "high" | "critical"
      complaint_status:
        | "submitted"
        | "under_review"
        | "assigned"
        | "in_progress"
        | "completed"
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
      app_role: ["citizen", "department_admin", "field_officer"],
      complaint_priority: ["low", "medium", "high", "critical"],
      complaint_status: [
        "submitted",
        "under_review",
        "assigned",
        "in_progress",
        "completed",
      ],
    },
  },
} as const
