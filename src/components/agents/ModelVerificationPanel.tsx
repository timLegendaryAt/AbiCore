import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { RefreshCw, Check, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MODEL_REGISTRY } from '@/lib/modelRegistry';
import { ModelDiscrepancyDialog } from './ModelDiscrepancyDialog';
import { formatDistanceToNow, addDays, isPast } from 'date-fns';
import { useSearchParams } from 'react-router-dom';

interface PendingChanges {
  discrepancies: Array<{
    modelId: string;
    modelName: string;
    field: string;
    oldValue: string | number;
    newValue: string | number;
    source?: string;
  }>;
  newModels: Array<{
    id: string;
    displayName: string;
    provider: string;
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
    contextWindow?: number;
    maxOutputTokens?: number;
    source?: string;
  }>;
  deprecatedModels: string[];
  citations: string[];
}

interface VerificationSettings {
  enabled: boolean;
  interval_days: number;
  last_run: string | null;
  last_result: {
    matches_count: number;
    discrepancies_count: number;
    new_models_count: number;
    deprecated_count?: number;
  } | null;
  pending_changes: PendingChanges | null;
}

interface VerificationResult {
  matches: string[];
  discrepancies: Array<{
    modelId: string;
    modelName: string;
    field: string;
    oldValue: string | number;
    newValue: string | number;
    source?: string;
  }>;
  newModels: Array<{
    id: string;
    displayName: string;
    provider: string;
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
    contextWindow?: number;
    maxOutputTokens?: number;
    source?: string;
  }>;
  deprecatedModels: string[];
  errors: string[];
  citations: string[];
}

export function ModelVerificationPanel() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [settings, setSettings] = useState<VerificationSettings>({
    enabled: false,
    interval_days: 7,
    last_run: null,
    last_result: null,
    pending_changes: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Auto-open dialog if there are pending changes and user navigated from alert
    if (settings.pending_changes && !isLoading) {
      const hasPendingChanges = 
        settings.pending_changes.discrepancies.length > 0 ||
        settings.pending_changes.newModels.length > 0 ||
        settings.pending_changes.deprecatedModels.length > 0;
      
      if (hasPendingChanges) {
        // Convert pending_changes to VerificationResult format
        setVerificationResult({
          matches: [],
          discrepancies: settings.pending_changes.discrepancies,
          newModels: settings.pending_changes.newModels,
          deprecatedModels: settings.pending_changes.deprecatedModels,
          errors: [],
          citations: settings.pending_changes.citations || [],
        });
        setShowDialog(true);
      }
    }
  }, [settings.pending_changes, isLoading]);

  useEffect(() => {
    // Check if auto-verification is due
    if (settings.enabled && settings.last_run && !settings.pending_changes) {
      const nextRun = addDays(new Date(settings.last_run), settings.interval_days);
      if (isPast(nextRun)) {
        handleVerify(true);
      }
    }
  }, [settings.enabled, settings.last_run, settings.interval_days, settings.pending_changes]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('model_verification_settings')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data?.model_verification_settings) {
        const settingsData = data.model_verification_settings as unknown as VerificationSettings;
        setSettings(settingsData);
      }
    } catch (error) {
      console.error('Error loading verification settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async (newSettings: VerificationSettings) => {
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ model_verification_settings: newSettings as any })
        .not('id', 'is', null);

      if (error) throw error;
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving verification settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save verification settings',
        variant: 'destructive',
      });
    }
  };

  const handleVerify = async (isAutoRun = false) => {
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-model-data', {
        body: { models: MODEL_REGISTRY },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Verification failed');
      }

      const result = data.data as VerificationResult;
      setVerificationResult(result);

      // Reload settings to get updated pending_changes from edge function
      await loadSettings();

      // Show results
      if (result.discrepancies.length > 0 || result.newModels.length > 0 || result.deprecatedModels.length > 0) {
        setShowDialog(true);
      } else {
        toast({
          title: 'Verification Complete',
          description: `All ${result.matches.length} models verified. Data is up to date.`,
        });
      }

      if (result.errors.length > 0) {
        toast({
          title: 'Partial Verification',
          description: `Some providers had errors: ${result.errors.join(', ')}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleToggleEnabled = (enabled: boolean) => {
    saveSettings({ ...settings, enabled });
  };

  const handleIntervalChange = (value: string) => {
    saveSettings({ ...settings, interval_days: parseInt(value, 10) });
  };

  const handleDialogApplied = () => {
    // Reload settings to clear pending_changes
    loadSettings();
  };

  const getStatusIcon = () => {
    if (isVerifying) {
      return <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
    if (!settings.last_run) {
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
    if (settings.pending_changes) {
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
    if (settings.last_result?.discrepancies_count === 0) {
      return <Check className="h-4 w-4 text-green-500" />;
    }
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  };

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="h-12 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div className="text-sm">
                {settings.last_run ? (
                  <>
                    <span className="text-muted-foreground">Last verified: </span>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(settings.last_run), { addSuffix: true })}
                    </span>
                    {settings.pending_changes ? (
                      <span className="text-yellow-500 ml-2">
                        ({settings.pending_changes.discrepancies.length} pending changes)
                      </span>
                    ) : settings.last_result && (
                      <span className="text-muted-foreground ml-2">
                        ({settings.last_result.matches_count} verified
                        {settings.last_result.discrepancies_count > 0 && 
                          `, ${settings.last_result.discrepancies_count} changes`})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Never verified</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {settings.pending_changes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (settings.pending_changes) {
                      setVerificationResult({
                        matches: [],
                        discrepancies: settings.pending_changes.discrepancies,
                        newModels: settings.pending_changes.newModels,
                        deprecatedModels: settings.pending_changes.deprecatedModels,
                        errors: [],
                        citations: settings.pending_changes.citations || [],
                      });
                      setShowDialog(true);
                    }
                  }}
                  className="text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/10"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Review Changes
                </Button>
              )}
              
              <div className="flex items-center gap-2">
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={handleToggleEnabled}
                  id="auto-verify"
                />
                <label htmlFor="auto-verify" className="text-sm text-muted-foreground">
                  Auto-verify
                </label>
                <Select
                  value={settings.interval_days.toString()}
                  onValueChange={handleIntervalChange}
                  disabled={!settings.enabled}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Daily</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">Weekly</SelectItem>
                    <SelectItem value="14">2 weeks</SelectItem>
                    <SelectItem value="30">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleVerify(false)}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Verify Now
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {verificationResult && (
        <ModelDiscrepancyDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          result={verificationResult}
          citations={verificationResult.citations}
          onApplied={handleDialogApplied}
        />
      )}
    </>
  );
}
