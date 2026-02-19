import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { X, ExternalLink, Database, FileEdit } from 'lucide-react';
import { OutputDestination, NodeOutputDestination } from '@/types/workflow';
import { MasterDataMappingConfig } from './MasterDataMappingConfig';

interface OutputDestinationCardProps {
  destination: OutputDestination;
  nodeDestination: NodeOutputDestination;
  nodeLabel: string;
  onUpdate: (updates: Partial<NodeOutputDestination>) => void;
  onRemove: () => void;
}

// Helper function to convert label to field name
function toFieldName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function OutputDestinationCard({
  destination,
  nodeDestination,
  nodeLabel,
  onUpdate,
  onRemove,
}: OutputDestinationCardProps) {
  const isEnabled = nodeDestination.enabled;
  const isMasterData = destination.destination_type === 'internal_db' && destination.profile !== 'ssot_update';
  const isExternalApi = destination.destination_type === 'external_api';
  const isSSOTUpdate = destination.profile === 'ssot_update';

  const IconComponent = isSSOTUpdate ? FileEdit : isMasterData ? Database : ExternalLink;

  return (
    <div 
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: `${destination.color}30` }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3"
        style={{ backgroundColor: `${destination.color}10` }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: destination.color }}
          />
          <IconComponent className="w-4 h-4" style={{ color: destination.color }} />
          <span className="font-medium text-sm">{destination.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch 
            checked={isEnabled}
            onCheckedChange={(checked) => onUpdate({ enabled: checked })}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isEnabled && (
        <div className="p-3 space-y-3 border-t" style={{ borderColor: `${destination.color}20` }}>
          {/* External API destinations show the field key */}
          {isExternalApi && (
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: destination.color }}>
                Field Key: <code className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${destination.color}20` }}>
                  {nodeDestination.field_mapping?.custom_field_name || toFieldName(nodeLabel)}
                </code>
              </p>
              <p className="text-xs text-muted-foreground">
                📤 Sends to: <code className="text-xs">outputs[].field_name</code>
              </p>
            </div>
          )}

          {/* Master Data destination shows domain/field selector */}
          {isMasterData && (
            <div className="space-y-2">
              <MasterDataMappingConfig
                nodeId={nodeDestination.destination_id}
                currentMapping={nodeDestination.field_mapping ? {
                  domain: nodeDestination.field_mapping.domain || '',
                  field_key: nodeDestination.field_mapping.field_key || '',
                } : null}
                onMappingChange={(mapping) => {
                  onUpdate({
                    field_mapping: mapping ? {
                      domain: mapping.domain,
                      field_key: mapping.field_key,
                    } : undefined
                  });
                }}
              />
            </div>
          )}

          {/* SSOT Update destination shows approval settings */}
          {isSSOTUpdate && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Node output must be a valid <code className="text-xs">SSOT_CHANGE_PLAN</code> JSON format.
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`auto-approve-l4-${nodeDestination.destination_id}`}
                    checked={nodeDestination.config?.auto_approve_l4 ?? false}
                    onCheckedChange={(checked) => {
                      onUpdate({
                        config: {
                          ...nodeDestination.config,
                          auto_approve_l4: checked === true,
                        }
                      });
                    }}
                  />
                  <Label htmlFor={`auto-approve-l4-${nodeDestination.destination_id}`} className="text-xs">
                    Auto-approve L4 (Input) updates
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`require-approval-${nodeDestination.destination_id}`}
                    checked={nodeDestination.config?.require_approval_create ?? true}
                    onCheckedChange={(checked) => {
                      onUpdate({
                        config: {
                          ...nodeDestination.config,
                          require_approval_create: checked === true,
                        }
                      });
                    }}
                  />
                  <Label htmlFor={`require-approval-${nodeDestination.destination_id}`} className="text-xs">
                    Require approval for new fields
                  </Label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
