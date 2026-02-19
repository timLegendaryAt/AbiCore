import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  FileEdit, 
  CheckCircle, 
  XCircle, 
  Clock,
  ChevronRight,
  Filter
} from 'lucide-react';
import { SSOTPendingChange } from '@/types/ssot-changes';
import { SSOTChangeReviewDialog } from './SSOTChangeReviewDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SSOTPendingChangesPanelProps {
  companyId: string;
}

export function SSOTPendingChangesPanel({ companyId }: SSOTPendingChangesPanelProps) {
  const [changes, setChanges] = useState<SSOTPendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedChange, setSelectedChange] = useState<SSOTPendingChange | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchChanges = async () => {
    setLoading(true);
    
    let query = supabase
      .from('ssot_pending_changes')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setChanges(data as unknown as SSOTPendingChange[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchChanges();
  }, [companyId, statusFilter]);

  const handleChangeClick = (change: SSOTPendingChange) => {
    setSelectedChange(change);
    setDialogOpen(true);
  };

  const handleChangeProcessed = () => {
    fetchChanges();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      L1C: 'bg-purple-500/20 text-purple-400',
      L2: 'bg-blue-500/20 text-blue-400',
      L3: 'bg-amber-500/20 text-amber-400',
      L4: 'bg-green-500/20 text-green-400',
    };
    return (
      <Badge className={`text-xs ${colors[level] || 'bg-muted'}`}>
        {level}
      </Badge>
    );
  };

  const pendingCount = changes.filter(c => c.status === 'pending').length;

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-6 w-32" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit className="w-5 h-5" />
          <h3 className="font-semibold">SSOT Pending Changes</h3>
          {pendingCount > 0 && (
            <Badge variant="secondary">{pendingCount} pending</Badge>
          )}
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Changes list */}
      {changes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileEdit className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No SSOT changes found</p>
          <p className="text-sm">Changes from AI-generated plans will appear here.</p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-4">
            {changes.map((change) => {
              const pathDisplay = [
                change.target_domain,
                change.target_path.l2,
                change.target_path.l3,
              ].filter(Boolean).join(' → ');

              return (
                <Button
                  key={change.id}
                  variant="ghost"
                  className="w-full justify-start h-auto py-3 px-4"
                  onClick={() => handleChangeClick(change)}
                >
                  <div className="flex items-start gap-3 w-full">
                    {getStatusIcon(change.status)}
                    
                    <div className="flex-1 text-left space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{change.change_id}</span>
                        {getLevelBadge(change.target_level)}
                        <Badge variant="outline" className="text-xs">
                          {change.action}
                        </Badge>
                      </div>
                      
                      <p className="text-xs text-muted-foreground truncate">
                        {pathDisplay}
                      </p>
                      
                      <p className="text-xs text-muted-foreground">
                        {new Date(change.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Button>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Review dialog */}
      <SSOTChangeReviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        change={selectedChange}
        onChangeProcessed={handleChangeProcessed}
      />
    </div>
  );
}
