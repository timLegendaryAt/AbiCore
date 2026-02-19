import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ArrowRight,
  FileEdit,
  Clock,
  User
} from 'lucide-react';
import { SSOTPendingChange } from '@/types/ssot-changes';
import { approveSSOTChange, rejectSSOTChange } from '@/lib/ssotApproval';

interface SSOTChangeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  change: SSOTPendingChange | null;
  onChangeProcessed: () => void;
}

export function SSOTChangeReviewDialog({
  open,
  onOpenChange,
  change,
  onChangeProcessed,
}: SSOTChangeReviewDialogProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  if (!change) return null;

  const handleApprove = async () => {
    setProcessing(true);
    const success = await approveSSOTChange(change);
    if (success) {
      onChangeProcessed();
      onOpenChange(false);
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    setProcessing(true);
    const success = await rejectSSOTChange(change, rejectionReason);
    if (success) {
      onChangeProcessed();
      onOpenChange(false);
    }
    setProcessing(false);
  };


  const pathDisplay = [
    change.target_path.l1,
    change.target_path.l2,
    change.target_path.l3,
    change.target_path.l4,
  ].filter(Boolean).join(' → ');

  const getStatusBadge = () => {
    if (change.validation_status === 'invalid') {
      return <Badge variant="destructive">Validation Failed</Badge>;
    }
    if (change.status === 'approved') {
      return <Badge className="bg-green-500/20 text-green-400">Approved</Badge>;
    }
    if (change.status === 'rejected') {
      return <Badge variant="destructive">Rejected</Badge>;
    }
    return <Badge variant="secondary">Pending Review</Badge>;
  };

  const getLevelBadge = () => {
    const colors: Record<string, string> = {
      L1C: 'bg-purple-500/20 text-purple-400',
      L2: 'bg-blue-500/20 text-blue-400',
      L3: 'bg-amber-500/20 text-amber-400',
      L4: 'bg-green-500/20 text-green-400',
    };
    return (
      <Badge className={colors[change.target_level] || 'bg-muted'}>
        {change.target_level}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5" />
            SSOT Change Review
          </DialogTitle>
          <DialogDescription>
            Review and approve or reject this proposed change to the SSOT.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{change.change_id}</Badge>
              {getLevelBadge()}
              {getStatusBadge()}
              <Badge variant="outline">{change.action}</Badge>
              {change.is_scored && (
                <Badge className="bg-amber-500/20 text-amber-400">Scored</Badge>
              )}
            </div>

            {/* Target path */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target Path</Label>
              <div className="font-mono text-sm bg-muted/50 p-2 rounded">
                {pathDisplay}
              </div>
            </div>

            {/* Data type and evaluation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data Type</Label>
                <div className="text-sm">{change.data_type}</div>
              </div>
              {change.evaluation_method && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Evaluation Method</Label>
                  <div className="text-sm">{change.evaluation_method}</div>
                </div>
              )}
            </div>

            <Separator />

            {/* Value comparison */}
            <div className="grid grid-cols-1 gap-4">
              {change.current_value !== null && change.current_value !== undefined && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <XCircle className="w-3 h-3 text-destructive" />
                    Current Value
                  </Label>
                  <div className="font-mono text-sm bg-destructive/10 p-2 rounded border border-destructive/20">
                    {typeof change.current_value === 'object' 
                      ? JSON.stringify(change.current_value, null, 2)
                      : String(change.current_value)}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                  Proposed Value
                </Label>
                <div className="font-mono text-sm bg-green-500/10 p-2 rounded border border-green-500/20">
                  {typeof change.proposed_value === 'object' 
                    ? JSON.stringify(change.proposed_value, null, 2)
                    : String(change.proposed_value)}
                </div>
              </div>
            </div>

            {/* Provenance */}
            {change.provenance && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Provenance</Label>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {change.provenance.source}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(change.provenance.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Validation errors/warnings */}
            {(change.validation_errors?.length || change.validation_warnings?.length) && (
              <>
                <Separator />
                <div className="space-y-2">
                  {change.validation_errors?.map((error, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                      <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {error}
                    </div>
                  ))}
                  {change.validation_warnings?.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-500">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      {warning}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Rejection reason input */}
            {change.status === 'pending' && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason (required for rejection)</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Explain why this change should be rejected..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {change.status === 'pending' && change.validation_status !== 'invalid' && (
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={processing}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
