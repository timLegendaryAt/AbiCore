import { useEffect, useState } from 'react';
import { Database, Plus, HardDrive } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OutputDestinationCard } from './OutputDestinationCard';
import { AddDestinationDialog } from './AddDestinationDialog';
import { SharedCacheOutputCard } from './SharedCacheOutputCard';
import { SharedCacheSelector } from './SharedCacheSelector';
import { CreateSharedCacheDialog } from './CreateSharedCacheDialog';
import { OutputDestination, NodeOutputDestination, SharedCache, SharedCacheOutputDestination } from '@/types/workflow';

export function LoadingTab() {
  const { workflow, selectedNodeIds, updateNodeConfig } = useWorkflowStore();
  const [destinations, setDestinations] = useState<OutputDestination[]>([]);
  const [sharedCaches, setSharedCaches] = useState<SharedCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCacheSelector, setShowCacheSelector] = useState(false);
  const [showCreateCacheDialog, setShowCreateCacheDialog] = useState(false);

  const selectedNode = selectedNodeIds.length === 1 
    ? workflow.nodes.find(n => n.id === selectedNodeIds[0])
    : undefined;

  // Fetch available destinations and shared caches
  useEffect(() => {
    const fetchData = async () => {
      const [destResult, cacheResult] = await Promise.all([
        supabase
          .from('output_destinations')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('shared_caches')
          .select('*')
          .order('name')
      ]);

      if (!destResult.error && destResult.data) {
        setDestinations(destResult.data as OutputDestination[]);
      }
      if (!cacheResult.error && cacheResult.data) {
        setSharedCaches(cacheResult.data as SharedCache[]);
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Get configured destinations for this node (with migration support)
  const getNodeDestinations = (): NodeOutputDestination[] => {
    if (!selectedNode) return [];
    
    const config = selectedNode.config || {};
    
    // If new format exists, use it
    if (config.outputDestinations && Array.isArray(config.outputDestinations)) {
      return config.outputDestinations;
    }
    
    // Migrate from legacy format
    const legacyDestinations: NodeOutputDestination[] = [];
    
    if (config.isAbiOutput) {
      const abiDest = destinations.find(d => d.profile === 'abi');
      if (abiDest) {
        legacyDestinations.push({
          destination_id: abiDest.id,
          destination_name: abiDest.name,
          enabled: true,
        });
      }
    }
    
    if (config.isAbiVCOutput) {
      const abivcDest = destinations.find(d => d.profile === 'abivc');
      if (abivcDest) {
        legacyDestinations.push({
          destination_id: abivcDest.id,
          destination_name: abivcDest.name,
          enabled: true,
        });
      }
    }
    
    if (config.isMasterDataOutput) {
      const masterDest = destinations.find(d => d.destination_type === 'internal_db');
      if (masterDest) {
        legacyDestinations.push({
          destination_id: masterDest.id,
          destination_name: masterDest.name,
          enabled: true,
          field_mapping: config.masterDataMapping || undefined,
        });
      }
    }
    
    return legacyDestinations;
  };

  const nodeDestinations = getNodeDestinations();

  const handleAddDestination = (destinationId: string) => {
    if (!selectedNode) return;
    
    const destination = destinations.find(d => d.id === destinationId);
    if (!destination) return;
    
    const newDestination: NodeOutputDestination = {
      destination_id: destinationId,
      destination_name: destination.name,
      enabled: true,
    };
    
    const updatedDestinations = [...nodeDestinations, newDestination];
    
    // Clear legacy flags when using new format
    updateNodeConfig(selectedNode.id, {
      outputDestinations: updatedDestinations,
      isAbiOutput: undefined,
      isAbiVCOutput: undefined,
      isMasterDataOutput: undefined,
      masterDataMapping: undefined,
    });
    
    setShowAddDialog(false);
  };

  const handleUpdateDestination = (index: number, updates: Partial<NodeOutputDestination>) => {
    if (!selectedNode) return;
    
    const updatedDestinations = nodeDestinations.map((dest, i) => 
      i === index ? { ...dest, ...updates } : dest
    );
    
    updateNodeConfig(selectedNode.id, {
      outputDestinations: updatedDestinations,
      isAbiOutput: undefined,
      isAbiVCOutput: undefined,
      isMasterDataOutput: undefined,
      masterDataMapping: undefined,
    });
  };

  const handleRemoveDestination = (index: number) => {
    if (!selectedNode) return;
    
    const updatedDestinations = nodeDestinations.filter((_, i) => i !== index);
    
    updateNodeConfig(selectedNode.id, {
      outputDestinations: updatedDestinations,
      isAbiOutput: undefined,
      isAbiVCOutput: undefined,
      isMasterDataOutput: undefined,
      masterDataMapping: undefined,
    });
  };

  // Shared Cache output handlers
  const getSharedCacheOutputs = (): SharedCacheOutputDestination[] => {
    if (!selectedNode) return [];
    return selectedNode.config?.sharedCacheOutputs || [];
  };

  const sharedCacheOutputs = getSharedCacheOutputs();

  const handleAddSharedCache = (cacheId: string, cacheName: string) => {
    if (!selectedNode) return;
    
    const newCacheOutput: SharedCacheOutputDestination = {
      shared_cache_id: cacheId,
      shared_cache_name: cacheName,
      enabled: true,
    };
    
    const updatedOutputs = [...sharedCacheOutputs, newCacheOutput];
    updateNodeConfig(selectedNode.id, { sharedCacheOutputs: updatedOutputs });
    setShowCacheSelector(false);
  };

  const handleUpdateSharedCacheOutput = (index: number, updates: Partial<SharedCacheOutputDestination>) => {
    if (!selectedNode) return;
    
    const updatedOutputs = sharedCacheOutputs.map((output, i) =>
      i === index ? { ...output, ...updates } : output
    );
    
    updateNodeConfig(selectedNode.id, { sharedCacheOutputs: updatedOutputs });
  };

  const handleRemoveSharedCacheOutput = (index: number) => {
    if (!selectedNode) return;
    
    const updatedOutputs = sharedCacheOutputs.filter((_, i) => i !== index);
    updateNodeConfig(selectedNode.id, { sharedCacheOutputs: updatedOutputs });
  };

  const handleCacheCreated = async (cache: { id: string; name: string }) => {
    // Refresh caches list
    const { data } = await supabase
      .from('shared_caches')
      .select('*')
      .order('name');
    if (data) {
      setSharedCaches(data as SharedCache[]);
    }
    // Add the new cache as an output
    handleAddSharedCache(cache.id, cache.name);
  };

  // Get caches not yet added
  const availableCaches = sharedCaches.filter(
    cache => !sharedCacheOutputs.some(co => co.shared_cache_id === cache.id)
  );

  // Get destinations not yet added
  const availableDestinations = destinations.filter(
    dest => !nodeDestinations.some(nd => nd.destination_id === dest.id)
  );

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Database className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a node to configure its output destinations
        </p>
      </div>
    );
  }

  if (selectedNode.type === 'note') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Database className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Not Applicable</h3>
        <p className="text-sm text-muted-foreground">
          Note nodes don't produce outputs
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-2" />
          <div className="h-4 bg-muted rounded w-2/3 mb-4" />
          <div className="h-24 bg-muted rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Output Destinations</h3>
        <p className="text-sm text-muted-foreground">
          Configure where "{selectedNode.label}" outputs are sent after workflow execution.
        </p>
      </div>

      {/* Custom Output Name */}
      <div>
        <Label htmlFor="outputName">Custom Output Name</Label>
        <Input 
          id="outputName" 
          value={selectedNode?.config.outputName || ''} 
          onChange={e => updateNodeConfig(selectedNode.id, { outputName: e.target.value })} 
          placeholder="e.g., generated_summary, transformed_data" 
        />
        <p className="text-xs text-muted-foreground mt-1">
          Name used when referencing this node's output
        </p>
      </div>

      {/* Add Destination Button */}
      {availableDestinations.length > 0 && (
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="w-4 h-4" />
          Add Destination
        </Button>
      )}

      {/* Configured Destinations */}
      <div className="space-y-3">
        {nodeDestinations.map((nodeDest, index) => {
          const destination = destinations.find(d => d.id === nodeDest.destination_id);
          if (!destination) return null;
          
          return (
            <OutputDestinationCard
              key={nodeDest.destination_id}
              destination={destination}
              nodeDestination={nodeDest}
              nodeLabel={selectedNode.label}
              onUpdate={(updates) => handleUpdateDestination(index, updates)}
              onRemove={() => handleRemoveDestination(index)}
            />
          );
        })}
      </div>

      {/* Empty State for Destinations */}
      {nodeDestinations.length === 0 && (
        <div className="border border-dashed rounded-lg p-6 text-center">
          <Database className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No output destinations configured. This node's output will only be stored in workflow node data.
          </p>
        </div>
      )}

      {/* Shared Cache Outputs Section */}
      <div className="pt-4 border-t">
        <div className="mb-3">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-violet-500" />
            Write to Shared Cache
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Send this node's output to a shared cache for use by other nodes.
          </p>
        </div>

        {/* Add Shared Cache Button */}
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 mb-3"
          onClick={() => setShowCacheSelector(true)}
        >
          <Plus className="w-4 h-4" />
          Add Shared Cache
        </Button>

        {/* Configured Shared Cache Outputs */}
        <div className="space-y-3">
          {sharedCacheOutputs.map((cacheOutput, index) => {
            const cache = sharedCaches.find(c => c.id === cacheOutput.shared_cache_id);
            return (
              <SharedCacheOutputCard
                key={cacheOutput.shared_cache_id}
                cache={cache}
                config={cacheOutput}
                onUpdate={(updates) => handleUpdateSharedCacheOutput(index, updates)}
                onRemove={() => handleRemoveSharedCacheOutput(index)}
              />
            );
          })}
        </div>
      </div>

      {/* Add Destination Dialog */}
      <AddDestinationDialog 
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        destinations={availableDestinations}
        onSelect={handleAddDestination}
      />

      {/* Shared Cache Selector Dialog */}
      <SharedCacheSelector
        open={showCacheSelector}
        onOpenChange={setShowCacheSelector}
        caches={availableCaches}
        onSelect={handleAddSharedCache}
        onCreateNew={() => {
          setShowCacheSelector(false);
          setShowCreateCacheDialog(true);
        }}
      />

      {/* Create Shared Cache Dialog */}
      <CreateSharedCacheDialog
        open={showCreateCacheDialog}
        onOpenChange={setShowCreateCacheDialog}
        onCreated={handleCacheCreated}
      />
    </div>
  );
}
