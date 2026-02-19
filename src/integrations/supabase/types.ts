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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      abi_sync_history: {
        Row: {
          company_id: string
          context_facts_synced: number | null
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          fields_synced: number | null
          filtered_count: number | null
          id: string
          schema_version: string | null
          status: string
          sync_type: string
          triggered_by: string | null
          webhook_response: Json | null
          webhook_status: number | null
        }
        Insert: {
          company_id: string
          context_facts_synced?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          fields_synced?: number | null
          filtered_count?: number | null
          id?: string
          schema_version?: string | null
          status?: string
          sync_type?: string
          triggered_by?: string | null
          webhook_response?: Json | null
          webhook_status?: number | null
        }
        Update: {
          company_id?: string
          context_facts_synced?: number | null
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          fields_synced?: number | null
          filtered_count?: number | null
          id?: string
          schema_version?: string | null
          status?: string
          sync_type?: string
          triggered_by?: string | null
          webhook_response?: Json | null
          webhook_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abi_sync_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_tools: {
        Row: {
          agent_id: string
          tool_id: string
        }
        Insert: {
          agent_id: string
          tool_id: string
        }
        Update: {
          agent_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "ai_tools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_role: string | null
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          max_tokens: number | null
          model: string
          name: string
          system_prompt: string
          temperature: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          agent_role?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          max_tokens?: number | null
          model?: string
          name: string
          system_prompt: string
          temperature?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          agent_role?: string | null
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          max_tokens?: number | null
          model?: string
          name?: string
          system_prompt?: string
          temperature?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_tools: {
        Row: {
          created_at: string | null
          description: string
          enabled: boolean | null
          id: string
          name: string
          parameters: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          enabled?: boolean | null
          id?: string
          name: string
          parameters?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          enabled?: boolean | null
          id?: string
          name?: string
          parameters?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          company_id: string | null
          completion_tokens: number
          created_at: string
          dependency_changed_at: string | null
          estimated_cost: number | null
          execution_time_ms: number | null
          id: string
          model: string
          node_id: string | null
          prompt_tokens: number
          total_tokens: number
          usage_category: string | null
          workflow_id: string | null
        }
        Insert: {
          company_id?: string | null
          completion_tokens?: number
          created_at?: string
          dependency_changed_at?: string | null
          estimated_cost?: number | null
          execution_time_ms?: number | null
          id?: string
          model: string
          node_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          usage_category?: string | null
          workflow_id?: string | null
        }
        Update: {
          company_id?: string | null
          completion_tokens?: number
          created_at?: string
          dependency_changed_at?: string | null
          estimated_cost?: number | null
          execution_time_ms?: number | null
          id?: string
          model?: string
          node_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          usage_category?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          app_name: string
          created_at: string
          id: string
          improvement_summaries: Json | null
          logo_url: string | null
          model_verification_settings: Json | null
          node_palette_customizations: Json | null
          self_improvement_settings: Json | null
          summary_schedule: Json | null
          updated_at: string
        }
        Insert: {
          app_name?: string
          created_at?: string
          id?: string
          improvement_summaries?: Json | null
          logo_url?: string | null
          model_verification_settings?: Json | null
          node_palette_customizations?: Json | null
          self_improvement_settings?: Json | null
          summary_schedule?: Json | null
          updated_at?: string
        }
        Update: {
          app_name?: string
          created_at?: string
          id?: string
          improvement_summaries?: Json | null
          logo_url?: string | null
          model_verification_settings?: Json | null
          node_palette_customizations?: Json | null
          self_improvement_settings?: Json | null
          summary_schedule?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          api_key: string | null
          assigned_workflow_id: string | null
          contact_email: string | null
          created_at: string
          id: string
          metadata: Json | null
          name: string
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          rate_limit_rpm: number
          settings: Json
          slug: string
          status: string | null
          storage_quota_mb: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          assigned_workflow_id?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          rate_limit_rpm?: number
          settings?: Json
          slug: string
          status?: string | null
          storage_quota_mb?: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          assigned_workflow_id?: string | null
          contact_email?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          rate_limit_rpm?: number
          settings?: Json
          slug?: string
          status?: string | null
          storage_quota_mb?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_assigned_workflow_id_fkey"
            columns: ["assigned_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      company_admins: {
        Row: {
          company_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_context_facts: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          display_name: string
          fact_key: string
          fact_type: string
          fact_value: Json | null
          id: string
          is_verified: boolean | null
          source_reference: Json | null
          source_type: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string | null
          display_name: string
          fact_key: string
          fact_type?: string
          fact_value?: Json | null
          id?: string
          is_verified?: boolean | null
          source_reference?: Json | null
          source_type?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          display_name?: string
          fact_key?: string
          fact_type?: string
          fact_value?: Json | null
          id?: string
          is_verified?: boolean | null
          source_reference?: Json | null
          source_type?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_context_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_data_submissions: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          execution_run_id: string | null
          id: string
          metadata: Json | null
          processed_at: string | null
          raw_data: Json
          source_type: string
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          execution_run_id?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          raw_data?: Json
          source_type?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          execution_run_id?: string | null
          id?: string
          metadata?: Json | null
          processed_at?: string | null
          raw_data?: Json
          source_type?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_data_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_data_submissions_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "execution_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      company_domain_definitions: {
        Row: {
          color: string | null
          context_keywords: string[] | null
          description: string | null
          display_name: string
          domain: Database["public"]["Enums"]["company_domain"]
          icon_name: string | null
          retrieval_priority: number | null
          sort_order: number | null
          typical_queries: string[] | null
        }
        Insert: {
          color?: string | null
          context_keywords?: string[] | null
          description?: string | null
          display_name: string
          domain: Database["public"]["Enums"]["company_domain"]
          icon_name?: string | null
          retrieval_priority?: number | null
          sort_order?: number | null
          typical_queries?: string[] | null
        }
        Update: {
          color?: string | null
          context_keywords?: string[] | null
          description?: string | null
          display_name?: string
          domain?: Database["public"]["Enums"]["company_domain"]
          icon_name?: string | null
          retrieval_priority?: number | null
          sort_order?: number | null
          typical_queries?: string[] | null
        }
        Relationships: []
      }
      company_domain_scores: {
        Row: {
          calculated_at: string | null
          company_id: string
          confidence: number | null
          contributing_fields: Json | null
          created_at: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          id: string
          reasoning: string | null
          score: number | null
          updated_at: string | null
        }
        Insert: {
          calculated_at?: string | null
          company_id: string
          confidence?: number | null
          contributing_fields?: Json | null
          created_at?: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          id?: string
          reasoning?: string | null
          score?: number | null
          updated_at?: string | null
        }
        Update: {
          calculated_at?: string | null
          company_id?: string
          confidence?: number | null
          contributing_fields?: Json | null
          created_at?: string | null
          domain?: Database["public"]["Enums"]["company_domain"]
          id?: string
          reasoning?: string | null
          score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_domain_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_field_definitions: {
        Row: {
          benchmark_reference: Json | null
          default_value: Json | null
          description: string | null
          display_name: string
          domain: Database["public"]["Enums"]["company_domain"]
          evaluation_config: Json | null
          evaluation_method: string | null
          field_key: string
          field_type: string
          id: string
          importance_score: number | null
          is_primary_description: boolean | null
          is_primary_score: boolean | null
          is_required: boolean | null
          is_scored: boolean | null
          level: Database["public"]["Enums"]["ssot_level"] | null
          parent_field_id: string | null
          related_fields: string[] | null
          retrieval_context: string | null
          score_weight: number | null
          semantic_description: string | null
          semantic_tags: string[] | null
          sort_order: number | null
          validation_rules: Json | null
        }
        Insert: {
          benchmark_reference?: Json | null
          default_value?: Json | null
          description?: string | null
          display_name: string
          domain: Database["public"]["Enums"]["company_domain"]
          evaluation_config?: Json | null
          evaluation_method?: string | null
          field_key: string
          field_type?: string
          id?: string
          importance_score?: number | null
          is_primary_description?: boolean | null
          is_primary_score?: boolean | null
          is_required?: boolean | null
          is_scored?: boolean | null
          level?: Database["public"]["Enums"]["ssot_level"] | null
          parent_field_id?: string | null
          related_fields?: string[] | null
          retrieval_context?: string | null
          score_weight?: number | null
          semantic_description?: string | null
          semantic_tags?: string[] | null
          sort_order?: number | null
          validation_rules?: Json | null
        }
        Update: {
          benchmark_reference?: Json | null
          default_value?: Json | null
          description?: string | null
          display_name?: string
          domain?: Database["public"]["Enums"]["company_domain"]
          evaluation_config?: Json | null
          evaluation_method?: string | null
          field_key?: string
          field_type?: string
          id?: string
          importance_score?: number | null
          is_primary_description?: boolean | null
          is_primary_score?: boolean | null
          is_required?: boolean | null
          is_scored?: boolean | null
          level?: Database["public"]["Enums"]["ssot_level"] | null
          parent_field_id?: string | null
          related_fields?: string[] | null
          retrieval_context?: string | null
          score_weight?: number | null
          semantic_description?: string | null
          semantic_tags?: string[] | null
          sort_order?: number | null
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "company_field_definitions_parent_field_id_fkey"
            columns: ["parent_field_id"]
            isOneToOne: false
            referencedRelation: "company_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ingest_schemas: {
        Row: {
          created_at: string | null
          description: string | null
          fields: Json
          id: string
          name: string
          node_id: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name: string
          node_id: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fields?: Json
          id?: string
          name?: string
          node_id?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_ingest_schemas_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      company_master_data: {
        Row: {
          aggregated_from: Json | null
          company_id: string
          confidence_score: number | null
          created_at: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          field_key: string
          field_type: string | null
          field_value: Json | null
          id: string
          is_verified: boolean | null
          score: number | null
          score_calculated_at: string | null
          score_confidence: number | null
          score_reasoning: string | null
          source_reference: Json | null
          source_type: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          aggregated_from?: Json | null
          company_id: string
          confidence_score?: number | null
          created_at?: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          field_key: string
          field_type?: string | null
          field_value?: Json | null
          id?: string
          is_verified?: boolean | null
          score?: number | null
          score_calculated_at?: string | null
          score_confidence?: number | null
          score_reasoning?: string | null
          source_reference?: Json | null
          source_type?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          aggregated_from?: Json | null
          company_id?: string
          confidence_score?: number | null
          created_at?: string | null
          domain?: Database["public"]["Enums"]["company_domain"]
          field_key?: string
          field_type?: string | null
          field_value?: Json | null
          id?: string
          is_verified?: boolean | null
          score?: number | null
          score_calculated_at?: string | null
          score_confidence?: number | null
          score_reasoning?: string | null
          source_reference?: Json | null
          source_type?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_master_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_master_data_history: {
        Row: {
          change_metadata: Json | null
          change_source: string | null
          change_type: string
          changed_by: string | null
          company_id: string
          created_at: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          field_key: string
          id: string
          master_data_id: string
          new_value: Json | null
          previous_value: Json | null
          version: number
        }
        Insert: {
          change_metadata?: Json | null
          change_source?: string | null
          change_type: string
          changed_by?: string | null
          company_id: string
          created_at?: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          field_key: string
          id?: string
          master_data_id: string
          new_value?: Json | null
          previous_value?: Json | null
          version: number
        }
        Update: {
          change_metadata?: Json | null
          change_source?: string | null
          change_type?: string
          changed_by?: string | null
          company_id?: string
          created_at?: string | null
          domain?: Database["public"]["Enums"]["company_domain"]
          field_key?: string
          id?: string
          master_data_id?: string
          new_value?: Json | null
          previous_value?: Json | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_master_data_history_master_data_id_fkey"
            columns: ["master_data_id"]
            isOneToOne: false
            referencedRelation: "company_master_data"
            referencedColumns: ["id"]
          },
        ]
      }
      company_node_data: {
        Row: {
          company_id: string
          content_hash: string | null
          created_at: string | null
          data: Json | null
          dependency_hashes: Json | null
          id: string
          last_executed_at: string | null
          low_quality_fields: Json | null
          node_id: string
          node_label: string | null
          node_type: string
          updated_at: string | null
          version: number | null
          workflow_id: string
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          id?: string
          last_executed_at?: string | null
          low_quality_fields?: Json | null
          node_id: string
          node_label?: string | null
          node_type: string
          updated_at?: string | null
          version?: number | null
          workflow_id: string
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          id?: string
          last_executed_at?: string | null
          low_quality_fields?: Json | null
          node_id?: string
          node_label?: string | null
          node_type?: string
          updated_at?: string | null
          version?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_node_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_node_data_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      company_outputs: {
        Row: {
          company_id: string
          created_at: string
          execution_run_id: string | null
          id: string
          output_data: Json
          output_type: string | null
          submission_id: string | null
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          execution_run_id?: string | null
          id?: string
          output_data?: Json
          output_type?: string | null
          submission_id?: string | null
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          execution_run_id?: string | null
          id?: string
          output_data?: Json
          output_type?: string | null
          submission_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_outputs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_outputs_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "execution_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_outputs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "company_data_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      company_usage: {
        Row: {
          ai_tokens_used: number
          company_id: string
          created_at: string
          data_processed_mb: number
          id: string
          period: string
          updated_at: string
          workflow_executions: number
        }
        Insert: {
          ai_tokens_used?: number
          company_id: string
          created_at?: string
          data_processed_mb?: number
          id?: string
          period: string
          updated_at?: string
          workflow_executions?: number
        }
        Update: {
          ai_tokens_used?: number
          company_id?: string
          created_at?: string
          data_processed_mb?: number
          id?: string
          period?: string
          updated_at?: string
          workflow_executions?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      context_fact_definitions: {
        Row: {
          allowed_values: Json | null
          category: string
          created_at: string | null
          default_domains:
            | Database["public"]["Enums"]["company_domain"][]
            | null
          description: string | null
          display_name: string
          fact_key: string
          fact_type: string
          icon_name: string | null
          id: string
          sort_order: number | null
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          allowed_values?: Json | null
          category?: string
          created_at?: string | null
          default_domains?:
            | Database["public"]["Enums"]["company_domain"][]
            | null
          description?: string | null
          display_name: string
          fact_key: string
          fact_type?: string
          icon_name?: string | null
          id?: string
          sort_order?: number | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          allowed_values?: Json | null
          category?: string
          created_at?: string | null
          default_domains?:
            | Database["public"]["Enums"]["company_domain"][]
            | null
          description?: string | null
          display_name?: string
          fact_key?: string
          fact_type?: string
          icon_name?: string | null
          id?: string
          sort_order?: number | null
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
      data_snapshots: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string
          id: string
          row_count: number
          size_bytes: number | null
          snapshot_data: Json
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id: string
          id?: string
          row_count?: number
          size_bytes?: number | null
          snapshot_data?: Json
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string
          id?: string
          row_count?: number
          size_bytes?: number | null
          snapshot_data?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_snapshots_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_snapshots_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string
          dependencies: Json
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          dependencies?: Json
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          dependencies?: Json
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasets_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_context_references: {
        Row: {
          created_at: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          fact_id: string
          id: string
          relevance_note: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          domain: Database["public"]["Enums"]["company_domain"]
          fact_id: string
          id?: string
          relevance_note?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          domain?: Database["public"]["Enums"]["company_domain"]
          fact_id?: string
          id?: string
          relevance_note?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_context_references_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "company_context_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          entity_type: string
          icon_name: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          entity_type?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          entity_type?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      entity_node_data: {
        Row: {
          content_hash: string | null
          created_at: string | null
          data: Json | null
          dependency_hashes: Json | null
          entity_id: string
          id: string
          last_executed_at: string | null
          node_id: string
          node_label: string | null
          node_type: string
          updated_at: string | null
          version: number | null
          workflow_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          entity_id: string
          id?: string
          last_executed_at?: string | null
          node_id: string
          node_label?: string | null
          node_type: string
          updated_at?: string | null
          version?: number | null
          workflow_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          entity_id?: string
          id?: string
          last_executed_at?: string | null
          node_id?: string
          node_label?: string | null
          node_type?: string
          updated_at?: string | null
          version?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_node_data_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_node_data_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_history: {
        Row: {
          company_id: string
          complexity_reasoning: string | null
          complexity_score: number | null
          created_at: string
          data_quality_reasoning: string | null
          data_quality_score: number | null
          evaluated_at: string
          flags: string[] | null
          hallucination_reasoning: string | null
          hallucination_score: number | null
          id: string
          node_id: string
          node_label: string | null
          overall_score: number | null
          workflow_id: string
        }
        Insert: {
          company_id: string
          complexity_reasoning?: string | null
          complexity_score?: number | null
          created_at?: string
          data_quality_reasoning?: string | null
          data_quality_score?: number | null
          evaluated_at?: string
          flags?: string[] | null
          hallucination_reasoning?: string | null
          hallucination_score?: number | null
          id?: string
          node_id: string
          node_label?: string | null
          overall_score?: number | null
          workflow_id: string
        }
        Update: {
          company_id?: string
          complexity_reasoning?: string | null
          complexity_score?: number | null
          created_at?: string
          data_quality_reasoning?: string | null
          data_quality_score?: number | null
          evaluated_at?: string
          flags?: string[] | null
          hallucination_reasoning?: string | null
          hallucination_score?: number | null
          id?: string
          node_id?: string
          node_label?: string | null
          overall_score?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_history_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_runs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          max_retries: number
          output_data: Json | null
          retry_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["execution_status"]
          trigger_type: Database["public"]["Enums"]["trigger_type"]
          triggered_by: string | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          max_retries?: number
          output_data?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          trigger_type?: Database["public"]["Enums"]["trigger_type"]
          triggered_by?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          max_retries?: number
          output_data?: Json | null
          retry_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          trigger_type?: Database["public"]["Enums"]["trigger_type"]
          triggered_by?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_runs_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          execution_order: number
          execution_run_id: string
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          node_id: string
          node_label: string | null
          node_type: string
          output_data: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["execution_status"]
          tokens_used: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_order?: number
          execution_run_id: string
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          node_id: string
          node_label?: string | null
          node_type: string
          output_data?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          tokens_used?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_order?: number
          execution_run_id?: string
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          node_id?: string
          node_label?: string | null
          node_type?: string
          output_data?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_steps_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "execution_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      frameworks: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_template: boolean | null
          language: string | null
          name: string
          schema: Json
          score: string | null
          type: string
          updated_at: string | null
          user_id: string | null
          workflow_association: string | null
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean | null
          language?: string | null
          name: string
          schema: Json
          score?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
          workflow_association?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_template?: boolean | null
          language?: string | null
          name?: string
          schema?: Json
          score?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
          workflow_association?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frameworks_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_checks: {
        Row: {
          check_type: string
          created_at: string
          error_message: string | null
          id: string
          integration_id: string
          response_data: Json | null
          response_time_ms: number | null
          status: string
          status_code: number | null
        }
        Insert: {
          check_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          integration_id: string
          response_data?: Json | null
          response_time_ms?: number | null
          status: string
          status_code?: number | null
        }
        Update: {
          check_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          integration_id?: string
          response_data?: Json | null
          response_time_ms?: number | null
          status?: string
          status_code?: number | null
        }
        Relationships: []
      }
      integration_ingest_sources: {
        Row: {
          created_at: string | null
          description: string | null
          fields: Json | null
          id: string
          ingest_point_id: string
          integration_id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fields?: Json | null
          id?: string
          ingest_point_id: string
          integration_id: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fields?: Json | null
          id?: string
          ingest_point_id?: string
          integration_id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          category: string
          color: string
          connected: boolean
          created_at: string | null
          description: string
          id: string
          initials: string
          name: string
          profile: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          color: string
          connected?: boolean
          created_at?: string | null
          description: string
          id?: string
          initials: string
          name: string
          profile?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          color?: string
          connected?: boolean
          created_at?: string | null
          description?: string
          id?: string
          initials?: string
          name?: string
          profile?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          execution_run_id: string | null
          id: string
          max_retries: number
          payload: Json
          picked_up_at: string | null
          priority: Database["public"]["Enums"]["job_priority"]
          result: Json | null
          retry_count: number
          scheduled_for: string
          status: Database["public"]["Enums"]["execution_status"]
          updated_at: string
          worker_id: string | null
          workflow_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_run_id?: string | null
          id?: string
          max_retries?: number
          payload?: Json
          picked_up_at?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          status?: Database["public"]["Enums"]["execution_status"]
          updated_at?: string
          worker_id?: string | null
          workflow_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          execution_run_id?: string | null
          id?: string
          max_retries?: number
          payload?: Json
          picked_up_at?: string | null
          priority?: Database["public"]["Enums"]["job_priority"]
          result?: Json | null
          retry_count?: number
          scheduled_for?: string
          status?: Database["public"]["Enums"]["execution_status"]
          updated_at?: string
          worker_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_queue_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "execution_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_queue_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_queue_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      master_node_data: {
        Row: {
          content_hash: string | null
          created_at: string | null
          data: Json | null
          dependency_hashes: Json | null
          id: string
          last_executed_at: string | null
          node_id: string
          node_label: string | null
          node_type: string
          updated_at: string | null
          version: number | null
          workflow_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          id?: string
          last_executed_at?: string | null
          node_id: string
          node_label?: string | null
          node_type: string
          updated_at?: string | null
          version?: number | null
          workflow_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string | null
          data?: Json | null
          dependency_hashes?: Json | null
          id?: string
          last_executed_at?: string | null
          node_id?: string
          node_label?: string | null
          node_type?: string
          updated_at?: string | null
          version?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_node_data_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      model_pricing_overrides: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          context_window: number | null
          created_at: string | null
          id: string
          input_cost_per_million: number | null
          max_output_tokens: number | null
          model_id: string
          output_cost_per_million: number | null
          source_citation: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          context_window?: number | null
          created_at?: string | null
          id?: string
          input_cost_per_million?: number | null
          max_output_tokens?: number | null
          model_id: string
          output_cost_per_million?: number | null
          source_citation?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          context_window?: number | null
          created_at?: string | null
          id?: string
          input_cost_per_million?: number | null
          max_output_tokens?: number | null
          model_id?: string
          output_cost_per_million?: number | null
          source_citation?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      node_schemas: {
        Row: {
          category: string
          connections: Json
          created_at: string | null
          description: string
          display_name: string
          enabled: boolean | null
          examples: Json
          outputs: Json
          parameters: Json
          purpose: string
          type: string
          updated_at: string | null
          use_cases: Json
        }
        Insert: {
          category: string
          connections?: Json
          created_at?: string | null
          description: string
          display_name: string
          enabled?: boolean | null
          examples?: Json
          outputs?: Json
          parameters?: Json
          purpose: string
          type: string
          updated_at?: string | null
          use_cases?: Json
        }
        Update: {
          category?: string
          connections?: Json
          created_at?: string | null
          description?: string
          display_name?: string
          enabled?: boolean | null
          examples?: Json
          outputs?: Json
          parameters?: Json
          purpose?: string
          type?: string
          updated_at?: string | null
          use_cases?: Json
        }
        Relationships: []
      }
      output_destinations: {
        Row: {
          color: string
          config_schema: Json | null
          created_at: string | null
          description: string | null
          destination_type: string
          edge_function: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          profile: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          color: string
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          destination_type: string
          edge_function?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          profile?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          destination_type?: string
          edge_function?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          profile?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      prompt_snippets: {
        Row: {
          content: string
          created_at: string | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prompt_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          company_id: string
          created_at: string
          cron_expression: string
          id: string
          input_data: Json | null
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string | null
          run_count: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          cron_expression: string
          id?: string
          input_data?: Json | null
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          run_count?: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          cron_expression?: string
          id?: string
          input_data?: Json | null
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_jobs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      score_influence_references: {
        Row: {
          created_at: string | null
          description: string | null
          fact_key: string
          field_definition_id: string | null
          id: string
          influence_config: Json | null
          influence_type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          fact_key: string
          field_definition_id?: string | null
          id?: string
          influence_config?: Json | null
          influence_type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          fact_key?: string
          field_definition_id?: string | null
          id?: string
          influence_config?: Json | null
          influence_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_influence_references_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "company_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_cache_data: {
        Row: {
          company_id: string
          content_hash: string | null
          created_at: string
          data: Json
          id: string
          node_id: string
          node_label: string | null
          shared_cache_id: string
          updated_at: string
          version: number
          workflow_id: string
        }
        Insert: {
          company_id: string
          content_hash?: string | null
          created_at?: string
          data?: Json
          id?: string
          node_id: string
          node_label?: string | null
          shared_cache_id: string
          updated_at?: string
          version?: number
          workflow_id: string
        }
        Update: {
          company_id?: string
          content_hash?: string | null
          created_at?: string
          data?: Json
          id?: string
          node_id?: string
          node_label?: string | null
          shared_cache_id?: string
          updated_at?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_cache_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_cache_data_shared_cache_id_fkey"
            columns: ["shared_cache_id"]
            isOneToOne: false
            referencedRelation: "shared_caches"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_caches: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          schema: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          schema?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          schema?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ssot_pending_changes: {
        Row: {
          action: string
          alert_id: string | null
          change_id: string
          company_id: string
          created_at: string | null
          current_value: Json | null
          data_type: string
          evaluation_method: string | null
          execution_run_id: string | null
          id: string
          input_field_ids: string[] | null
          is_scored: boolean | null
          node_id: string | null
          proposed_value: Json
          provenance: Json | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_domain: Database["public"]["Enums"]["company_domain"]
          target_level: Database["public"]["Enums"]["ssot_level"]
          target_path: Json
          updated_at: string | null
          validation_errors: string[] | null
          validation_status: string
          validation_warnings: string[] | null
          workflow_id: string | null
        }
        Insert: {
          action: string
          alert_id?: string | null
          change_id: string
          company_id: string
          created_at?: string | null
          current_value?: Json | null
          data_type: string
          evaluation_method?: string | null
          execution_run_id?: string | null
          id?: string
          input_field_ids?: string[] | null
          is_scored?: boolean | null
          node_id?: string | null
          proposed_value: Json
          provenance?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_domain: Database["public"]["Enums"]["company_domain"]
          target_level: Database["public"]["Enums"]["ssot_level"]
          target_path: Json
          updated_at?: string | null
          validation_errors?: string[] | null
          validation_status?: string
          validation_warnings?: string[] | null
          workflow_id?: string | null
        }
        Update: {
          action?: string
          alert_id?: string | null
          change_id?: string
          company_id?: string
          created_at?: string | null
          current_value?: Json | null
          data_type?: string
          evaluation_method?: string | null
          execution_run_id?: string | null
          id?: string
          input_field_ids?: string[] | null
          is_scored?: boolean | null
          node_id?: string | null
          proposed_value?: Json
          provenance?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_domain?: Database["public"]["Enums"]["company_domain"]
          target_level?: Database["public"]["Enums"]["ssot_level"]
          target_path?: Json
          updated_at?: string | null
          validation_errors?: string[] | null
          validation_status?: string
          validation_warnings?: string[] | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ssot_pending_changes_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "system_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssot_pending_changes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssot_pending_changes_execution_run_id_fkey"
            columns: ["execution_run_id"]
            isOneToOne: false
            referencedRelation: "execution_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ssot_pending_changes_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          action_url: string | null
          affected_model: string | null
          affected_nodes: Json | null
          alert_type: string
          created_at: string
          description: string | null
          error_pattern: string | null
          first_seen_at: string
          id: string
          is_resolved: boolean | null
          last_seen_at: string
          occurrence_count: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          affected_model?: string | null
          affected_nodes?: Json | null
          alert_type: string
          created_at?: string
          description?: string | null
          error_pattern?: string | null
          first_seen_at?: string
          id?: string
          is_resolved?: boolean | null
          last_seen_at?: string
          occurrence_count?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          affected_model?: string | null
          affected_nodes?: Json | null
          alert_type?: string
          created_at?: string
          description?: string | null
          error_pattern?: string | null
          first_seen_at?: string
          id?: string
          is_resolved?: boolean | null
          last_seen_at?: string
          occurrence_count?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_prompt_tags: {
        Row: {
          prompt_id: string
          tag_id: string
        }
        Insert: {
          prompt_id: string
          tag_id: string
        }
        Update: {
          prompt_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_prompt_tags_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "system_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_prompt_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "prompt_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompts: {
        Row: {
          created_at: string | null
          id: string
          name: string
          prompt: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          prompt: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          prompt?: string
          updated_at?: string | null
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
      webhook_endpoints: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          secret_key: string
          trigger_count: number
          updated_at: string
          workflow_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          secret_key: string
          trigger_count?: number
          updated_at?: string
          workflow_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          secret_key?: string
          trigger_count?: number
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_audit_log: {
        Row: {
          action: string
          changed_at: string
          client_transaction_id: string | null
          created_at: string
          id: string
          new_edge_count: number | null
          new_name: string | null
          new_node_count: number | null
          node_id_hash: string | null
          old_edge_count: number | null
          old_name: string | null
          old_node_count: number | null
          overlap_ratio: number | null
          source: string
          suspicious_change: boolean | null
          workflow_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          client_transaction_id?: string | null
          created_at?: string
          id?: string
          new_edge_count?: number | null
          new_name?: string | null
          new_node_count?: number | null
          node_id_hash?: string | null
          old_edge_count?: number | null
          old_name?: string | null
          old_node_count?: number | null
          overlap_ratio?: number | null
          source: string
          suspicious_change?: boolean | null
          workflow_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          client_transaction_id?: string | null
          created_at?: string
          id?: string
          new_edge_count?: number | null
          new_name?: string | null
          new_node_count?: number | null
          node_id_hash?: string | null
          old_edge_count?: number | null
          old_name?: string | null
          old_node_count?: number | null
          overlap_ratio?: number | null
          source?: string
          suspicious_change?: boolean | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_audit_log_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          company_id: string | null
          created_at: string
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          results: Json | null
          status: string
          workflow_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          results?: Json | null
          status?: string
          workflow_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          results?: Json | null
          status?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          edges: Json
          id: string
          is_expanded: boolean | null
          name: string
          nodes: Json
          parent_id: string | null
          settings: Json | null
          sort_order: number | null
          updated_at: string
          user_id: string | null
          variables: Json
          version: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_expanded?: boolean | null
          name: string
          nodes?: Json
          parent_id?: string | null
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
          variables?: Json
          version?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          edges?: Json
          id?: string
          is_expanded?: boolean | null
          name?: string
          nodes?: Json
          parent_id?: string | null
          settings?: Json | null
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_evaluation_history: {
        Args: { _keep_limit?: number }
        Returns: number
      }
      get_company_by_api_key: { Args: { _api_key: string }; Returns: string }
      get_company_cost_summaries: {
        Args: never
        Returns: {
          company_id: string
          generation_count: number
          total_cost: number
        }[]
      }
      get_evaluation_stats: {
        Args: { _limit?: number }
        Returns: {
          avg_score: number
          count: number
          max_score: number
          metric: string
          min_score: number
        }[]
      }
      get_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      next_output_version: { Args: { _company_id: string }; Returns: number }
      next_snapshot_version: { Args: { _dataset_id: string }; Returns: number }
      provision_company_node_storage: {
        Args: { _nodes: Json; _workflow_id: string }
        Returns: undefined
      }
      provision_entity_node_storage: {
        Args: { _entity_id: string; _nodes: Json; _workflow_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      upsert_connection_alert: {
        Args: {
          _error_message: string
          _integration_id: string
          _status_code: number
        }
        Returns: undefined
      }
      upsert_execution_summary_alert: {
        Args: {
          _cached_nodes: number
          _company_id: string
          _company_name: string
          _empty_outputs: number
          _executed_nodes: number
          _executed_workflows: number
          _issues: Json
          _paused_nodes: number
          _skipped_workflows: number
          _total_nodes: number
          _total_workflows: number
          _workflow_ids: string[]
        }
        Returns: undefined
      }
      upsert_gateway_alert: {
        Args: {
          _error_message: string
          _model: string
          _node_id: string
          _node_label: string
          _status_code: number
          _workflow_id: string
        }
        Returns: undefined
      }
      upsert_model_alert: {
        Args: {
          _error_message: string
          _model: string
          _node_id: string
          _status_code: number
        }
        Returns: undefined
      }
      upsert_model_mismatch_alert: {
        Args: {
          _configured_model: string
          _executed_model: string
          _node_id: string
          _node_label: string
          _workflow_id: string
        }
        Returns: undefined
      }
      upsert_performance_alert: {
        Args: {
          _alert_type: string
          _description: string
          _node_id: string
          _node_label: string
          _threshold: number
          _value: number
          _workflow_id: string
        }
        Returns: undefined
      }
      upsert_quality_alert: {
        Args: {
          _alert_type: string
          _company_id: string
          _company_name: string
          _node_id: string
          _node_label: string
          _reasoning: string
          _score: number
        }
        Returns: undefined
      }
      upsert_summary_alert: {
        Args: {
          _evaluations_analyzed: number
          _nodes_processed: number
          _status?: string
        }
        Returns: undefined
      }
      upsert_verification_alert: {
        Args: {
          _deprecated_count: number
          _discrepancies_count: number
          _has_pending_changes: boolean
          _matches_count: number
          _new_models_count: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "admin" | "member" | "viewer"
      company_domain:
        | "overview"
        | "leadership"
        | "strategy"
        | "product"
        | "operations"
        | "market"
        | "revenue"
        | "customer"
        | "people"
        | "finance"
      execution_status:
        | "queued"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
      job_priority: "low" | "normal" | "high" | "critical"
      plan_tier: "free" | "starter" | "professional" | "enterprise"
      ssot_level: "L1" | "L1C" | "L2" | "L3" | "L4"
      trigger_type: "manual" | "scheduled" | "webhook" | "api"
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
      app_role: ["super_admin", "owner", "admin", "member", "viewer"],
      company_domain: [
        "overview",
        "leadership",
        "strategy",
        "product",
        "operations",
        "market",
        "revenue",
        "customer",
        "people",
        "finance",
      ],
      execution_status: [
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled",
      ],
      job_priority: ["low", "normal", "high", "critical"],
      plan_tier: ["free", "starter", "professional", "enterprise"],
      ssot_level: ["L1", "L1C", "L2", "L3", "L4"],
      trigger_type: ["manual", "scheduled", "webhook", "api"],
    },
  },
} as const
