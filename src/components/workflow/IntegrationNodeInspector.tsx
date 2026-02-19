import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { PromptBuilder } from '@/components/workflow/PromptBuilder';
import { PromptPart } from '@/types/workflow';
import { Integration } from '@/types/integration';
import { Flame, Search, Map, Network } from 'lucide-react';

interface IntegrationRow {
  id: string;
  name: string;
  initials: string;
  color: string;
  connected: boolean;
}

interface IntegrationNodeInspectorProps {
  nodeId: string;
}

// Firecrawl capabilities configuration
const FIRECRAWL_CAPABILITIES = [
  { 
    id: 'scrape', 
    name: 'Scrape', 
    description: 'Extract content from a single URL',
    icon: Flame,
    inputLabel: 'URL to scrape'
  },
  { 
    id: 'search', 
    name: 'Search', 
    description: 'Web search with optional scraping',
    icon: Search,
    inputLabel: 'Search query'
  },
  { 
    id: 'map', 
    name: 'Map', 
    description: 'Discover all URLs on a website',
    icon: Map,
    inputLabel: 'Base URL to map'
  },
  { 
    id: 'crawl', 
    name: 'Crawl', 
    description: 'Recursively scrape pages',
    icon: Network,
    inputLabel: 'Start URL to crawl'
  },
];

const SCRAPE_FORMATS = [
  { id: 'markdown', label: 'Markdown', description: 'Clean, LLM-ready text' },
  { id: 'html', label: 'HTML', description: 'Processed HTML' },
  { id: 'links', label: 'Links', description: 'Extract all URLs' },
  { id: 'screenshot', label: 'Screenshot', description: 'Page image' },
  { id: 'branding', label: 'Branding', description: 'Brand identity extraction' },
  { id: 'summary', label: 'Summary', description: 'AI-generated summary' },
];

export function IntegrationNodeInspector({ nodeId }: IntegrationNodeInspectorProps) {
  const { workflow, updateNodeConfig } = useWorkflowStore();
  const [integrationRows, setIntegrationRows] = useState<IntegrationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('integrations')
      .select('id, name, initials, color, connected')
      .eq('connected', true);
    
    setIntegrationRows((data || []) as IntegrationRow[]);
    setIsLoading(false);
  };

  if (!selectedNode) return null;

  const config = selectedNode.config || {};
  const selectedIntegrationRow = integrationRows.find(i => i.name.toLowerCase() === config.integrationId);
  const selectedCapability = FIRECRAWL_CAPABILITIES.find(c => c.id === config.capability);

  // Get available nodes for dependencies
  const availableNodes = workflow.nodes
    .filter(n => n.id !== nodeId && n.type !== 'note')
    .map(n => ({ id: n.id, label: n.label }));

  // Map integration rows to Integration type for PromptBuilder
  const integrationsForBuilder: Integration[] = integrationRows.map(row => ({
    id: row.id,
    name: row.name,
    description: '',
    category: 'data',
    profile: 'main',
    color: row.color,
    initials: row.initials,
    connected: row.connected,
  }));

  const handleIntegrationChange = (integrationId: string) => {
    const integration = integrationRows.find(i => i.name.toLowerCase() === integrationId);
    updateNodeConfig(nodeId, {
      integrationId,
      integrationName: integration?.name || integrationId,
      capability: undefined,
      options: {},
    });
  };

  const handleCapabilityChange = (capability: string) => {
    updateNodeConfig(nodeId, {
      capability,
      options: capability === 'scrape' ? { formats: ['markdown'] } : {},
    });
  };

  const handleOptionChange = (key: string, value: any) => {
    updateNodeConfig(nodeId, {
      options: { ...config.options, [key]: value },
    });
  };

  const handleFormatToggle = (formatId: string, checked: boolean) => {
    const currentFormats = config.options?.formats || ['markdown'];
    const newFormats = checked
      ? [...currentFormats, formatId]
      : currentFormats.filter((f: string) => f !== formatId);
    handleOptionChange('formats', newFormats.length > 0 ? newFormats : ['markdown']);
  };

  const handlePromptPartsChange = (parts: PromptPart[]) => {
    updateNodeConfig(nodeId, { promptParts: parts });
  };

  const renderCapabilityOptions = () => {
    if (!config.capability) return null;

    switch (config.capability) {
      case 'scrape':
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Output Formats</Label>
              <div className="grid grid-cols-2 gap-2">
                {SCRAPE_FORMATS.map((format) => (
                  <div key={format.id} className="flex items-center space-x-2">
                    <Switch
                      id={`format-${format.id}`}
                      checked={(config.options?.formats || ['markdown']).includes(format.id)}
                      onCheckedChange={(checked) => handleFormatToggle(format.id, checked)}
                    />
                    <Label htmlFor={`format-${format.id}`} className="flex flex-col cursor-pointer">
                      <span className="text-sm">{format.label}</span>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="onlyMainContent"
                checked={config.options?.onlyMainContent ?? true}
                onCheckedChange={(checked) => handleOptionChange('onlyMainContent', checked)}
              />
              <Label htmlFor="onlyMainContent">Only main content</Label>
            </div>
          </div>
        );

      case 'search':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="searchLimit">Result limit</Label>
              <Input
                id="searchLimit"
                type="number"
                value={config.options?.limit || 10}
                onChange={(e) => handleOptionChange('limit', parseInt(e.target.value) || 10)}
                min={1}
                max={100}
              />
            </div>
            <div>
              <Label htmlFor="timeFilter">Time filter</Label>
              <Select
                value={config.options?.tbs || 'none'}
                onValueChange={(value) => handleOptionChange('tbs', value === 'none' ? undefined : value)}
              >
                <SelectTrigger id="timeFilter">
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any time</SelectItem>
                  <SelectItem value="qdr:h">Past hour</SelectItem>
                  <SelectItem value="qdr:d">Past day</SelectItem>
                  <SelectItem value="qdr:w">Past week</SelectItem>
                  <SelectItem value="qdr:m">Past month</SelectItem>
                  <SelectItem value="qdr:y">Past year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'map':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="mapLimit">URL limit</Label>
              <Input
                id="mapLimit"
                type="number"
                value={config.options?.limit || 100}
                onChange={(e) => handleOptionChange('limit', parseInt(e.target.value) || 100)}
                min={1}
                max={5000}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="includeSubdomains"
                checked={config.options?.includeSubdomains ?? false}
                onCheckedChange={(checked) => handleOptionChange('includeSubdomains', checked)}
              />
              <Label htmlFor="includeSubdomains">Include subdomains</Label>
            </div>
          </div>
        );

      case 'crawl':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="crawlLimit">Page limit</Label>
              <Input
                id="crawlLimit"
                type="number"
                value={config.options?.limit || 50}
                onChange={(e) => handleOptionChange('limit', parseInt(e.target.value) || 50)}
                min={1}
                max={500}
              />
            </div>
            <div>
              <Label htmlFor="maxDepth">Max depth</Label>
              <Input
                id="maxDepth"
                type="number"
                value={config.options?.maxDepth || 3}
                onChange={(e) => handleOptionChange('maxDepth', parseInt(e.target.value) || 3)}
                min={1}
                max={10}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Integration Selector */}
      <div>
        <Label htmlFor="integration_select">Integration</Label>
        <Select 
          value={config.integrationId || ''} 
          onValueChange={handleIntegrationChange}
          disabled={isLoading}
        >
          <SelectTrigger id="integration_select">
            <SelectValue placeholder={isLoading ? "Loading..." : "Select integration..."} />
          </SelectTrigger>
          <SelectContent>
            {integrationRows.length === 0 ? (
              <SelectItem value="none" disabled>No connected integrations</SelectItem>
            ) : (
              integrationRows.map((integration) => (
                <SelectItem key={integration.id} value={integration.name.toLowerCase()}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: integration.color }}
                    >
                      {integration.initials}
                    </div>
                    {integration.name}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Firecrawl Capability Selector */}
      {config.integrationId === 'firecrawl' && (
        <>
          <div>
            <Label htmlFor="capability_select">Capability</Label>
            <Select 
              value={config.capability || ''} 
              onValueChange={handleCapabilityChange}
            >
              <SelectTrigger id="capability_select">
                <SelectValue placeholder="Select capability..." />
              </SelectTrigger>
              <SelectContent>
                {FIRECRAWL_CAPABILITIES.map((cap) => {
                  const Icon = cap.icon;
                  return (
                    <SelectItem key={cap.id} value={cap.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <div className="flex flex-col items-start">
                          <span>{cap.name}</span>
                          <span className="text-xs text-muted-foreground">{cap.description}</span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Capability-specific options */}
          {config.capability && (
            <div className="p-3 bg-muted rounded-lg space-y-4">
              <div className="flex items-center gap-2">
                {selectedCapability && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      {selectedCapability.name}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {selectedCapability.description}
                    </span>
                  </>
                )}
              </div>
              {renderCapabilityOptions()}
            </div>
          )}

          {/* Input from dependency */}
          {config.capability && (
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {selectedCapability?.inputLabel || 'Input'} from:
              </Label>
              <PromptBuilder
                promptParts={config.promptParts || []}
                availableNodes={availableNodes}
                integrations={integrationsForBuilder}
                onChange={handlePromptPartsChange}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Add a dependency that provides the {config.capability === 'search' ? 'query' : 'URL'} for this integration
              </p>
            </div>
          )}
        </>
      )}

      {/* Summary display */}
      {config.integrationId && config.capability && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary font-medium">
            {config.integrationName}: {selectedCapability?.name}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Results will be stored per company like Generate nodes
          </p>
        </div>
      )}
    </div>
  );
}
