import { useState, useEffect, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Upload, Trash2, Plus, RefreshCw } from 'lucide-react';
import { AIUsageOverview } from '@/components/analytics/AIUsageOverview';
import { UsageByModelChart } from '@/components/analytics/UsageByModelChart';
import { UsageOverTimeChart } from '@/components/analytics/UsageOverTimeChart';
import { RecentUsageTable } from '@/components/analytics/RecentUsageTable';
import { CostCategoryBreakdown } from '@/components/analytics/CostCategoryBreakdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Integration } from '@/types/integration';
import { IntegrationCard } from '@/components/admin/IntegrationCard';
import { NodePaletteEditor } from '@/components/admin/NodePaletteEditor';
import { NodeCustomizations } from '@/lib/nodeDefaults';
import { AIAgent, AITool } from '@/types/ai-agent';
import { AIAgentCard } from '@/components/admin/AIAgentCard';
import { AIToolCard } from '@/components/admin/AIToolCard';
import { AIToolDialog } from '@/components/admin/AIToolDialog';
import { UserManagement } from '@/components/admin/UserManagement';
import { AbiVCConnectionPanel } from '@/components/admin/AbiVCConnectionPanel';
import { AbiConnectionPanel } from '@/components/admin/AbiConnectionPanel';
import { SystemPromptsTab } from '@/components/agents/SystemPromptsTab';
import { AgentsModels } from '@/components/agents/AgentsModels';
import { NodeMigration } from '@/components/agents/NodeMigration';
import { ErrorsAlertsTab } from '@/components/admin/ErrorsAlertsTab';
import { OverviewTab } from '@/components/self-improvement/OverviewTab';
import { CurrentDataTab } from '@/components/self-improvement/CurrentDataTab';
import { MasterSchemaTab } from '@/components/database/MasterSchemaTab';
import { DomainDefinitionsTab } from '@/components/database/DomainDefinitionsTab';
import { ContextFactDefinitionsTab } from '@/components/database/ContextFactDefinitionsTab';
import { SharedCachesTab } from '@/components/database/SharedCachesTab';

export default function Admin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tabFromUrl = searchParams.get('tab') || 'design';
  const [activeTab, setActiveTab] = useState<string>(tabFromUrl);
  const [appName, setAppName] = useState('');
  const [currentLogo, setCurrentLogo] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);
  const [nodeCustomizations, setNodeCustomizations] = useState<NodeCustomizations>({});
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [tools, setTools] = useState<AITool[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [showToolDialog, setShowToolDialog] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const handleRefreshAnalytics = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    setIsRefreshing(false);
  };

  // Sync tab with URL
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const fetchIntegrations = async () => {
    try {
      setIntegrationsLoading(true);
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setIntegrations((data || []) as Integration[]);
    } catch (error) {
      console.error('Error fetching integrations:', error);
      toast({
        title: "Error",
        description: "Failed to load integrations",
        variant: "destructive",
      });
    } finally {
      setIntegrationsLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      setAgentsLoading(true);
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*, ai_agent_tools(tool_id)')
        .order('type');
      
      if (error) throw error;
      setAgents((data || []) as AIAgent[]);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast({
        title: "Error",
        description: "Failed to load AI agents",
        variant: "destructive",
      });
    } finally {
      setAgentsLoading(false);
    }
  };

  const fetchTools = async () => {
    try {
      setToolsLoading(true);
      const { data, error } = await supabase
        .from('ai_tools')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setTools((data || []) as AITool[]);
    } catch (error) {
      console.error('Error fetching tools:', error);
      toast({
        title: "Error",
        description: "Failed to load AI tools",
        variant: "destructive",
      });
    } finally {
      setToolsLoading(false);
    }
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
      return;
    }

    if (data) {
      setAppName(data.app_name);
      setSettingsId(data.id);
      if (data.logo_url) {
        setCurrentLogo(data.logo_url);
      }
      if (data.node_palette_customizations) {
        setNodeCustomizations(data.node_palette_customizations as NodeCustomizations);
      }
    }
    // If no data exists, settingsId stays null and we'll insert on save
  };

  useEffect(() => {
    fetchSettings();
    fetchIntegrations();
    fetchAgents();
    fetchTools();
    checkSuperAdmin();
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: isSuperAdminResult } = await supabase.rpc('is_super_admin', {
          _user_id: user.id
        });
        setIsSuperAdmin(isSuperAdminResult || false);
      }
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }
  };

  // Auto-save logo immediately on upload
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settingsId) return;

    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('branding')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        toast({
          title: 'Error uploading logo',
          description: uploadError.message,
          variant: 'destructive'
        });
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('branding')
        .getPublicUrl(data.path);

      const { error: updateError } = await supabase
        .from('app_settings')
        .update({ logo_url: publicUrl })
        .eq('id', settingsId);

      if (updateError) {
        toast({
          title: 'Error saving logo',
          description: updateError.message,
          variant: 'destructive'
        });
      } else {
        setCurrentLogo(publicUrl);
        toast({ title: 'Logo saved' });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Save app name on blur
  const handleAppNameBlur = async () => {
    if (!settingsId) return;
    
    const { error } = await supabase
      .from('app_settings')
      .update({ app_name: appName })
      .eq('id', settingsId);

    if (error) {
      toast({
        title: 'Error saving app name',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({ title: 'App name saved' });
    }
  };

  // Save node customizations
  const saveNodeCustomizations = async (customizations: NodeCustomizations) => {
    if (!settingsId) return;
    
    const { error } = await supabase
      .from('app_settings')
      .update({ node_palette_customizations: customizations as Json })
      .eq('id', settingsId);

    if (error) {
      toast({
        title: 'Error saving palette settings',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({ title: 'Palette settings saved' });
    }
  };

  const handleRemoveLogo = async () => {
    if (!settingsId) return;
    setLoading(true);

    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ logo_url: null })
        .eq('id', settingsId);

      if (error) {
        toast({
          title: 'Error removing logo',
          description: error.message,
          variant: 'destructive'
        });
      } else {
        setCurrentLogo(null);
        toast({ title: 'Logo removed' });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex flex-col h-full w-full bg-background">
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
            {/* Design Section - with inline tab navigation */}
            {(activeTab === 'design' || activeTab.startsWith('design-')) && (() => {
              const currentDesignTab = activeTab === 'design' ? 'design-site' : activeTab;
              const designTabs = [
                { value: 'design-site', label: 'Site Design' },
                { value: 'design-palette', label: 'Palette' },
              ];
              
              return (
                <div className="space-y-6">
                  {/* Inline header with title and tab navigation */}
                  <div className="flex items-baseline gap-6">
                    <h2 className="text-3xl font-bold tracking-tight">General</h2>
                    <nav className="flex items-center gap-2 text-sm">
                      {designTabs.map((tab, index, arr) => (
                        <Fragment key={tab.value}>
                          <button
                            onClick={() => navigate(`/admin?tab=${tab.value}`)}
                            className={cn(
                              "hover:text-foreground transition-colors",
                              currentDesignTab === tab.value
                                ? "text-foreground font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {tab.label}
                          </button>
                          {index < arr.length - 1 && (
                            <span className="text-muted-foreground/30">/</span>
                          )}
                        </Fragment>
                      ))}
                    </nav>
                  </div>
                  
                  {/* Site Design Tab */}
                  {currentDesignTab === 'design-site' && (
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Application Name</CardTitle>
                          <CardDescription>
                            Change the name of your application displayed in the header
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="appName">App Name</Label>
                              <Input
                                id="appName"
                                value={appName}
                                onChange={(e) => setAppName(e.target.value)}
                                onBlur={handleAppNameBlur}
                                placeholder="Enter app name"
                                className="mt-2"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Application Logo</CardTitle>
                          <CardDescription>
                            Upload a custom logo for your application
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {currentLogo && (
                              <div className="space-y-2">
                                <Label>Current Logo</Label>
                                <div className="flex items-center gap-4">
                                  <img
                                    src={currentLogo}
                                    alt="Logo"
                                    className="w-16 h-16 object-contain rounded border border-border"
                                  />
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleRemoveLogo}
                                    disabled={loading}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Remove Logo
                                  </Button>
                                </div>
                              </div>
                            )}

                            <div>
                              <Label htmlFor="logo">Upload New Logo</Label>
                              <div className="mt-2">
                                <label htmlFor="logo" className="cursor-pointer">
                                  <div className="flex items-center gap-2 border-2 border-dashed border-border rounded-lg p-4 hover:bg-accent transition-colors">
                                    <Upload className="w-5 h-5 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                      Click to upload logo
                                    </span>
                                  </div>
                                </label>
                                <input
                                  id="logo"
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoChange}
                                  className="hidden"
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Palette Tab */}
                  {currentDesignTab === 'design-palette' && (
                    <NodePaletteEditor 
                      customizations={nodeCustomizations}
                      onChange={setNodeCustomizations}
                      onSave={saveNodeCustomizations}
                    />
                  )}
                </div>
              );
            })()}

            {/* Database Section - with inline tab navigation */}
            {(activeTab === 'database' || activeTab.startsWith('database-')) && (() => {
              const currentDatabaseTab = activeTab === 'database' ? 'database-master' : activeTab;
              const databaseTabs = [
                { value: 'database-master', label: 'Master Schema' },
                { value: 'database-domains', label: 'Domains' },
                { value: 'database-context', label: 'Context Facts' },
                { value: 'database-caches', label: 'Shared Caches' },
              ];
              
              return (
                <div className="space-y-6">
                  {/* Inline header with title and tab navigation */}
                  <div className="flex items-baseline gap-6">
                    <h2 className="text-3xl font-bold tracking-tight">Database</h2>
                    <nav className="flex items-center gap-2 text-sm">
                      {databaseTabs.map((tab, index, arr) => (
                        <Fragment key={tab.value}>
                          <button
                            onClick={() => navigate(`/admin?tab=${tab.value}`)}
                            className={cn(
                              "hover:text-foreground transition-colors",
                              currentDatabaseTab === tab.value
                                ? "text-foreground font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {tab.label}
                          </button>
                          {index < arr.length - 1 && (
                            <span className="text-muted-foreground/30">/</span>
                          )}
                        </Fragment>
                      ))}
                    </nav>
                  </div>
                  
                  {/* Tab content */}
                  {currentDatabaseTab === 'database-master' && <MasterSchemaTab />}
                  {currentDatabaseTab === 'database-domains' && <DomainDefinitionsTab />}
                  {currentDatabaseTab === 'database-context' && <ContextFactDefinitionsTab />}
                  {currentDatabaseTab === 'database-caches' && <SharedCachesTab />}
                </div>
              );
            })()}

            {/* Self-Improvement Section - with inline tab navigation */}
            {(activeTab === 'self-improvement' || activeTab.startsWith('self-improvement-')) && (() => {
              const currentSelfImprovementTab = activeTab === 'self-improvement' ? 'self-improvement-overview' : activeTab;
              const selfImprovementTabs = [
                { value: 'self-improvement-overview', label: 'Overview' },
                { value: 'self-improvement-data', label: 'Current Data' },
              ];
              
              return (
                <div className="space-y-6">
                  {/* Inline header with title and tab navigation */}
                  <div className="flex items-baseline gap-6">
                    <h2 className="text-3xl font-bold tracking-tight">Self-Improvement</h2>
                    <nav className="flex items-center gap-2 text-sm">
                      {selfImprovementTabs.map((tab, index, arr) => (
                        <Fragment key={tab.value}>
                          <button
                            onClick={() => navigate(`/admin?tab=${tab.value}`)}
                            className={cn(
                              "hover:text-foreground transition-colors",
                              currentSelfImprovementTab === tab.value
                                ? "text-foreground font-medium"
                                : "text-muted-foreground"
                            )}
                          >
                            {tab.label}
                          </button>
                          {index < arr.length - 1 && (
                            <span className="text-muted-foreground/30">/</span>
                          )}
                        </Fragment>
                      ))}
                    </nav>
                  </div>
                  
                  {/* Tab content */}
                  {currentSelfImprovementTab === 'self-improvement-overview' && <OverviewTab />}
                  {currentSelfImprovementTab === 'self-improvement-data' && <CurrentDataTab />}
                </div>
              );
            })()}

            {/* Automagic Workflows Section (renamed from AI Configuration) */}
            {activeTab === 'ai' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Automagic Workflows</h2>
                  <p className="text-muted-foreground">
                    Configure AI agents and tools for your workflow builder
                  </p>
                </div>

                {/* Agents Section */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>AI Agents</CardTitle>
                        <CardDescription>
                          Configure user and system AI agents
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {agentsLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[...Array(2)].map((_, i) => (
                          <Card key={i} className="animate-pulse">
                            <CardHeader className="h-48" />
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {agents.map(agent => (
                          <AIAgentCard 
                            key={agent.id} 
                            agent={agent}
                            tools={tools}
                            onUpdate={() => {
                              fetchAgents();
                              fetchTools();
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tools Section */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>AI Tools</CardTitle>
                        <CardDescription>
                          Define tools that AI agents can use
                        </CardDescription>
                      </div>
                      <Button onClick={() => setShowToolDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Tool
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {toolsLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(3)].map((_, i) => (
                          <Card key={i} className="animate-pulse">
                            <CardHeader className="h-32" />
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tools.map(tool => (
                          <AIToolCard 
                            key={tool.id} 
                            tool={tool}
                            onUpdate={fetchTools}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Integrations Section */}
            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Integrations</h2>
                  <p className="text-muted-foreground">
                    Connect external services and APIs to extend functionality
                  </p>
                </div>
                
                <Tabs defaultValue="main" className="w-full">
                  <TabsList>
                    <TabsTrigger value="main">Main</TabsTrigger>
                    <TabsTrigger value="abi">Abi</TabsTrigger>
                    <TabsTrigger value="abivc">AbiVC</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="main" className="mt-6">
                    {integrationsLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                          <Card key={i} className="animate-pulse">
                            <CardHeader className="h-32" />
                          </Card>
                        ))}
                      </div>
                    ) : integrations.filter(i => (i.profile || 'main') === 'main').length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No integrations in this profile
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {integrations.filter(i => (i.profile || 'main') === 'main').map((integration) => (
                          <IntegrationCard 
                            key={integration.id} 
                            integration={integration}
                            onUpdate={fetchIntegrations}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="abi" className="mt-6">
                    <AbiConnectionPanel />
                  </TabsContent>
                  
                  <TabsContent value="abivc" className="mt-6">
                    <AbiVCConnectionPanel />
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* Analytics Section */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Analytics</h2>
                    <p className="text-muted-foreground">
                      Track usage, costs, and performance metrics
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshAnalytics}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
                
                <Tabs defaultValue="ai" className="w-full">
                  <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="ai">AI</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="general" className="mt-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>General Analytics</CardTitle>
                        <CardDescription>
                          Workflow execution metrics and performance data
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                          Coming soon
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="ai" className="mt-6 space-y-6">
                    <AIUsageOverview />
                    <div className="grid gap-6 lg:grid-cols-3">
                      <UsageByModelChart />
                      <CostCategoryBreakdown />
                      <UsageOverTimeChart />
                    </div>
                    <RecentUsageTable />
                  </TabsContent>
                </Tabs>
              </div>
            )}

          {/* Errors & Alerts Section */}
          {activeTab === 'errors' && (
            <ErrorsAlertsTab />
          )}

          {/* Users Section - Super Admin Only */}
          {activeTab === 'users' && isSuperAdmin && (
            <UserManagement />
          )}

          {/* Agents Section - with inline tab navigation */}
          {(activeTab === 'agents' || activeTab.startsWith('agents-')) && (() => {
            const currentAgentsTab = activeTab === 'agents' ? 'agents-overview' : activeTab;
            const agentTabs = [
              { value: 'agents-overview', label: 'Overview' },
              { value: 'agents-prompts', label: 'System Prompts' },
              { value: 'agents-models', label: 'Models' },
              { value: 'agents-migration', label: 'Node Migration' },
            ];
            
            return (
              <div className="space-y-6">
                {/* Inline header with title and tab navigation */}
                <div className="flex items-baseline gap-6">
                  <h2 className="text-3xl font-bold tracking-tight">Agents</h2>
                  <nav className="flex items-center gap-2 text-sm">
                    {agentTabs.map((tab, index, arr) => (
                      <Fragment key={tab.value}>
                        <button
                          onClick={() => navigate(`/admin?tab=${tab.value}`)}
                          className={cn(
                            "hover:text-foreground transition-colors",
                            currentAgentsTab === tab.value
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {tab.label}
                        </button>
                        {index < arr.length - 1 && (
                          <span className="text-muted-foreground/30">/</span>
                        )}
                      </Fragment>
                    ))}
                  </nav>
                </div>
                
                {/* Tab content */}
                {currentAgentsTab === 'agents-overview' && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    Coming soon
                  </div>
                )}
                {currentAgentsTab === 'agents-prompts' && <SystemPromptsTab />}
                {currentAgentsTab === 'agents-models' && <AgentsModels />}
                {currentAgentsTab === 'agents-migration' && <NodeMigration />}
              </div>
            );
          })()}
        </div>
      </main>

      <AIToolDialog
        open={showToolDialog}
        onOpenChange={setShowToolDialog}
        onSave={fetchTools}
      />
    </div>
  );
}
