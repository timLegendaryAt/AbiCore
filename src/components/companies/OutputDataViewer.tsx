import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface NodeData {
  id: string;
  company_id: string;
  workflow_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  data: { output?: any } | null;
  content_hash: string | null;
  last_executed_at: string | null;
  version: number | null;
}

interface OutputDataViewerProps {
  nodeData: NodeData[];
  nodeConfigLookup: Map<string, any>;
  workflows: Array<{ id: string; name: string }>;
  outputType: 'abi' | 'abivc';
}

export function OutputDataViewer({ nodeData, nodeConfigLookup, workflows, outputType }: OutputDataViewerProps) {
  // Filter nodes based on output type
  const filteredNodes = nodeData.filter(nd => {
    const config = nodeConfigLookup.get(`${nd.workflow_id}:${nd.node_id}`);
    if (outputType === 'abi') {
      return config?.isAbiOutput === true;
    }
    return config?.isAbiVCOutput === true;
  });

  if (filteredNodes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No nodes configured as {outputType === 'abi' ? 'Abi' : 'AbiVC'} outputs</p>
        <p className="text-sm mt-1">
          Mark nodes as "{outputType === 'abi' ? 'Abi Output' : 'AbiVC Output'}" in the workflow editor
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredNodes.map(nd => {
        const workflow = workflows.find(w => w.id === nd.workflow_id);
        const outputData = nd.data?.output;

        return (
          <Card key={nd.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{nd.node_label || nd.node_id}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {nd.node_type}
                  </Badge>
                  <Badge variant="outline">{workflow?.name || 'Unknown'}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Display field names and values */}
              <div className="space-y-2">
                {outputData && typeof outputData === 'object' && !Array.isArray(outputData) ? (
                  <div className="bg-muted rounded-lg p-3 space-y-2">
                    {Object.entries(outputData).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 text-sm">
                        <span className="font-mono text-xs bg-background px-1.5 py-0.5 rounded border shrink-0">
                          {key}
                        </span>
                        <span className="text-muted-foreground flex-1 break-all">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre className="text-sm bg-muted p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {typeof outputData === 'string' 
                      ? outputData 
                      : outputData 
                        ? JSON.stringify(outputData, null, 2) 
                        : 'No output data'}
                  </pre>
                )}
              </div>
              {nd.last_executed_at && (
                <p className="text-xs text-muted-foreground mt-3">
                  Last updated: {format(new Date(nd.last_executed_at), 'PPp')}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
