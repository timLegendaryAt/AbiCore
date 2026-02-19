import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  History,
  ArrowRight,
  User,
  Bot,
  Globe,
  Download,
  FileEdit,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { CompanyDomain } from '@/types/company-master';

interface HistoryRecord {
  id: string;
  master_data_id: string;
  company_id: string;
  domain: CompanyDomain;
  field_key: string;
  previous_value: unknown;
  new_value: unknown;
  change_type: string;
  changed_by: string | null;
  change_source: string | null;
  change_metadata: Record<string, unknown> | null;
  version: number;
  created_at: string | null;
}

interface CurrentField {
  id: string;
  domain: CompanyDomain;
  field_key: string;
  field_value: unknown;
  is_verified: boolean | null;
  version: number;
}

interface FieldHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: CurrentField | null;
  displayName: string;
  domainDisplayName: string;
}

export function FieldHistoryDialog({
  open,
  onOpenChange,
  field,
  displayName,
  domainDisplayName,
}: FieldHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && field) {
      fetchHistory(field.id);
    }
  }, [open, field]);

  const fetchHistory = async (masterDataId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_master_data_history')
      .select('*')
      .eq('master_data_id', masterDataId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistory(data as HistoryRecord[]);
    }
    setLoading(false);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const truncateValue = (value: string, maxLength = 50): string => {
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '...';
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'create':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'update':
        return <FileEdit className="h-4 w-4 text-blue-500" />;
      case 'delete':
        return <Trash2 className="h-4 w-4 text-destructive" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case 'create':
        return 'Created';
      case 'update':
        return 'Updated';
      case 'delete':
        return 'Deleted';
      default:
        return changeType;
    }
  };

  const getSourceIcon = (source: string | null) => {
    switch (source) {
      case 'workflow':
        return <Bot className="h-3 w-3" />;
      case 'api':
        return <Globe className="h-3 w-3" />;
      case 'import':
        return <Download className="h-3 w-3" />;
      case 'user':
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const getSourceLabel = (source: string | null) => {
    switch (source) {
      case 'workflow':
        return 'Workflow';
      case 'api':
        return 'API';
      case 'import':
        return 'Import';
      case 'user':
        return 'Manual';
      default:
        return source || 'Unknown';
    }
  };

  if (!field) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Field History: {displayName}
          </DialogTitle>
        </DialogHeader>

        {/* Field Info Header */}
        <div className="flex flex-col gap-2 py-3 px-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Domain: {domainDisplayName}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Field: {field.field_key}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Current: {truncateValue(formatValue(field.field_value), 40)}
            </span>
            <Badge variant="outline" className="text-xs">v{field.version}</Badge>
            {field.is_verified && (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
          </div>
        </div>

        <Separator />

        {/* Timeline */}
        <div className="flex-1 min-h-0">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Revision Timeline
          </h4>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <History className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No revision history available
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {history.map((record, index) => (
                  <div key={record.id} className="relative">
                    {/* Timeline line */}
                    {index < history.length - 1 && (
                      <div className="absolute left-[7px] top-8 bottom-0 w-px bg-border" />
                    )}

                    <div className="flex gap-3">
                      {/* Timeline dot */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          index === 0 
                            ? 'bg-primary' 
                            : 'bg-muted border-2 border-border'
                        }`}>
                          {index === 0 && (
                            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant="outline" 
                            className="text-xs gap-1"
                          >
                            {getChangeTypeIcon(record.change_type)}
                            {getChangeTypeLabel(record.change_type)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            v{record.version}
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground mb-2">
                          {record.created_at
                            ? format(new Date(record.created_at), 'MMM d, yyyy \'at\' h:mm a')
                            : 'Unknown date'}
                        </p>

                        {/* Value change */}
                        <div className="bg-muted/30 rounded p-2 text-xs space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground line-through">
                              {truncateValue(formatValue(record.previous_value))}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">
                              {truncateValue(formatValue(record.new_value))}
                            </span>
                          </div>
                        </div>

                        {/* Source */}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {getSourceIcon(record.change_source)}
                          <span>Source: {getSourceLabel(record.change_source)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
