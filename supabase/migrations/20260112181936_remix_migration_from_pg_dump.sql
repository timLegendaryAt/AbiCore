CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: ai_agent_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_tools (
    agent_id uuid NOT NULL,
    tool_id uuid NOT NULL
);


--
-- Name: ai_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    system_prompt text NOT NULL,
    model text DEFAULT 'google/gemini-2.5-flash'::text NOT NULL,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 2000,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ai_agents_type_check CHECK ((type = ANY (ARRAY['user'::text, 'system'::text])))
);


--
-- Name: ai_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_name text DEFAULT 'Transformation Engine'::text NOT NULL,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    node_palette_customizations jsonb DEFAULT '{}'::jsonb
);


--
-- Name: datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    dependencies jsonb DEFAULT '[]'::jsonb NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text DEFAULT 'general'::text
);


--
-- Name: frameworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.frameworks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    schema jsonb NOT NULL,
    type text NOT NULL,
    category text DEFAULT 'uncategorized'::text,
    workflow_association text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    is_template boolean DEFAULT false,
    language text,
    score text,
    CONSTRAINT frameworks_type_check CHECK ((type = ANY (ARRAY['rating_scale'::text, 'rubric'::text, 'criteria'::text, 'custom'::text, 'document'::text])))
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    connected boolean DEFAULT false NOT NULL,
    color text NOT NULL,
    initials text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT integrations_category_check CHECK ((category = ANY (ARRAY['communication'::text, 'crm'::text, 'data'::text, 'productivity'::text, 'payments'::text, 'automation'::text])))
);


--
-- Name: node_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.node_schemas (
    type text NOT NULL,
    category text NOT NULL,
    display_name text NOT NULL,
    description text NOT NULL,
    purpose text NOT NULL,
    use_cases jsonb DEFAULT '[]'::jsonb NOT NULL,
    parameters jsonb DEFAULT '[]'::jsonb NOT NULL,
    outputs jsonb DEFAULT '[]'::jsonb NOT NULL,
    connections jsonb DEFAULT '{}'::jsonb NOT NULL,
    examples jsonb DEFAULT '[]'::jsonb NOT NULL,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT node_schemas_category_check CHECK ((category = ANY (ARRAY['transform'::text, 'design'::text, 'connect'::text])))
);


--
-- Name: workflow_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    input_data jsonb,
    results jsonb,
    error_message text,
    execution_time_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    description text,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    edges jsonb DEFAULT '[]'::jsonb NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid,
    sort_order integer DEFAULT 0,
    is_expanded boolean DEFAULT true
);


--
-- Name: ai_agent_tools ai_agent_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_pkey PRIMARY KEY (agent_id, tool_id);


--
-- Name: ai_agents ai_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);


--
-- Name: ai_tools ai_tools_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tools
    ADD CONSTRAINT ai_tools_name_key UNIQUE (name);


--
-- Name: ai_tools ai_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_tools
    ADD CONSTRAINT ai_tools_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: datasets datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datasets
    ADD CONSTRAINT datasets_pkey PRIMARY KEY (id);


--
-- Name: frameworks frameworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.frameworks
    ADD CONSTRAINT frameworks_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: node_schemas node_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.node_schemas
    ADD CONSTRAINT node_schemas_pkey PRIMARY KEY (type);


--
-- Name: workflow_executions workflow_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: idx_workflow_executions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_created_at ON public.workflow_executions USING btree (created_at DESC);


--
-- Name: idx_workflow_executions_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_executions_workflow_id ON public.workflow_executions USING btree (workflow_id);


--
-- Name: idx_workflows_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_created_at ON public.workflows USING btree (created_at DESC);


--
-- Name: idx_workflows_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_parent_id ON public.workflows USING btree (parent_id);


--
-- Name: idx_workflows_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_sort_order ON public.workflows USING btree (sort_order);


--
-- Name: idx_workflows_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_user_id ON public.workflows USING btree (user_id);


--
-- Name: unique_agent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_agent_type ON public.ai_agents USING btree (type);


--
-- Name: ai_agents update_ai_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_tools update_ai_tools_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_tools_updated_at BEFORE UPDATE ON public.ai_tools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: app_settings update_app_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: datasets update_datasets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON public.datasets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: frameworks update_frameworks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_frameworks_updated_at BEFORE UPDATE ON public.frameworks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: integrations update_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: node_schemas update_node_schemas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_node_schemas_updated_at BEFORE UPDATE ON public.node_schemas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workflows update_workflows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_tools ai_agent_tools_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE;


--
-- Name: ai_agent_tools ai_agent_tools_tool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_tool_id_fkey FOREIGN KEY (tool_id) REFERENCES public.ai_tools(id) ON DELETE CASCADE;


--
-- Name: workflow_executions workflow_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_executions
    ADD CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workflows(id) ON DELETE CASCADE;


--
-- Name: workflows workflows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--




COMMIT;