import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Framework, FrameworkType } from '@/types/framework';
import { Database } from 'lucide-react';

interface FrameworkNodeInspectorProps {
  nodeId: string;
}

export function FrameworkNodeInspector({ nodeId }: FrameworkNodeInspectorProps) {
  const { workflow, updateNodeConfig } = useWorkflowStore();
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);
  const [activeTab, setActiveTab] = useState<string>('existing');

  const { data: frameworks = [], isLoading } = useQuery({
    queryKey: ['frameworks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('frameworks')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as Framework[];
    },
  });

  useEffect(() => {
    // Set initial tab based on whether framework has a frameworkId
    if (selectedNode?.config.frameworkId) {
      setActiveTab('existing');
    } else if (selectedNode?.config.name) {
      setActiveTab('custom');
    }
  }, [selectedNode?.config.frameworkId, selectedNode?.config.name]);

  const handleFrameworkSelect = (frameworkId: string) => {
    const selectedFramework = frameworks.find(f => f.id === frameworkId);
    if (selectedFramework) {
      updateNodeConfig(nodeId, {
        frameworkId: selectedFramework.id,
        name: selectedFramework.name,
        description: selectedFramework.description || '',
        type: selectedFramework.type,
        schema: selectedFramework.schema,
        category: selectedFramework.category || undefined,
        workflow_association: selectedFramework.workflow_association || undefined,
        language: selectedFramework.language || undefined,
        score: selectedFramework.score || undefined,
      });
    }
  };

  const handleCustomConfigChange = (key: string, value: any) => {
    updateNodeConfig(nodeId, { 
      [key]: value,
      frameworkId: undefined // Clear frameworkId when using custom
    });
  };

  if (!selectedNode) return null;

  const typeLabels: Record<FrameworkType, string> = {
    rating_scale: 'Rating Scale',
    rubric: 'Rubric',
    criteria: 'Criteria',
    custom: 'Custom',
    document: 'Document',
  };

  const typeColors: Record<FrameworkType, string> = {
    rating_scale: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    rubric: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    criteria: 'bg-green-500/10 text-green-700 dark:text-green-400',
    custom: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    document: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="existing">Existing</TabsTrigger>
        <TabsTrigger value="custom">Custom</TabsTrigger>
      </TabsList>

      <TabsContent value="existing" className="space-y-4">
        <div>
          <Label htmlFor="framework_select">Select Framework</Label>
          <Select 
            value={selectedNode.config.frameworkId || ''} 
            onValueChange={handleFrameworkSelect}
            disabled={isLoading}
          >
            <SelectTrigger id="framework_select">
              <SelectValue placeholder={isLoading ? "Loading frameworks..." : "Choose a framework..."} />
            </SelectTrigger>
            <SelectContent>
              {frameworks.length === 0 ? (
                <SelectItem value="none" disabled>No frameworks available</SelectItem>
              ) : (
                frameworks.map((framework) => (
                  <SelectItem key={framework.id} value={framework.id}>
                    <div className="flex items-center gap-2">
                      <span>{framework.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[framework.type]}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {selectedNode.config.frameworkId && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  {selectedNode.config.name}
                </CardTitle>
                <Badge className={typeColors[selectedNode.config.type as FrameworkType]} variant="secondary">
                  {typeLabels[selectedNode.config.type as FrameworkType]}
                </Badge>
              </div>
              {selectedNode.config.description && (
                <CardDescription className="line-clamp-2">
                  {selectedNode.config.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {selectedNode.config.category && (
                  <Badge variant="outline" className="text-xs">
                    {selectedNode.config.category}
                  </Badge>
                )}
                {selectedNode.config.language && (
                  <Badge variant="outline" className="text-xs">
                    {selectedNode.config.language}
                  </Badge>
                )}
                {selectedNode.config.workflow_association && (
                  <Badge variant="outline" className="text-xs">
                    Workflow: {selectedNode.config.workflow_association}
                  </Badge>
                )}
              </div>
              {selectedNode.config.schema && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">Schema Preview</Label>
                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                    {typeof selectedNode.config.schema === 'string' 
                      ? selectedNode.config.schema 
                      : JSON.stringify(selectedNode.config.schema, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {frameworks.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-6 text-center">
              <Database className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                No frameworks found in database
              </p>
              <p className="text-xs text-muted-foreground">
                Create frameworks in the Frameworks page to use them here
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="custom" className="space-y-4">
        <div>
          <Label htmlFor="framework_name">Name</Label>
          <Input
            id="framework_name"
            value={selectedNode.config.name || ''}
            onChange={(e) => handleCustomConfigChange('name', e.target.value)}
            placeholder="Framework name"
          />
        </div>

        <div>
          <Label htmlFor="framework_description">Description</Label>
          <Textarea
            id="framework_description"
            value={selectedNode.config.description || ''}
            onChange={(e) => handleCustomConfigChange('description', e.target.value)}
            placeholder="Framework description"
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="framework_type">Type</Label>
          <Select
            value={selectedNode.config.type || 'rating_scale'}
            onValueChange={(value) => handleCustomConfigChange('type', value)}
          >
            <SelectTrigger id="framework_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating_scale">Rating Scale</SelectItem>
              <SelectItem value="rubric">Rubric</SelectItem>
              <SelectItem value="criteria">Criteria</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="document">Document</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="framework_schema">Schema</Label>
          <Textarea
            id="framework_schema"
            value={
              typeof selectedNode.config.schema === 'string'
                ? selectedNode.config.schema
                : JSON.stringify(selectedNode.config.schema, null, 2)
            }
            onChange={(e) => handleCustomConfigChange('schema', e.target.value)}
            placeholder="Framework schema (JSON or text)"
            rows={8}
            className="font-mono text-xs"
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
