import { useState, useEffect } from 'react';
import { Settings, Shield, Database, Cpu, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MetricToggles {
  metrics_hallucination_enabled: boolean;
  metrics_data_quality_enabled: boolean;
  metrics_complexity_enabled: boolean;
}

const DEFAULT_METRIC_TOGGLES: MetricToggles = {
  metrics_hallucination_enabled: true,
  metrics_data_quality_enabled: true,
  metrics_complexity_enabled: true,
};

export function OverviewTab() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toggles, setToggles] = useState<MetricToggles>(DEFAULT_METRIC_TOGGLES);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('self_improvement_settings')
        .limit(1)
        .maybeSingle();

      if (data?.self_improvement_settings) {
        const settings = data.self_improvement_settings as Record<string, any>;
        setToggles({
          metrics_hallucination_enabled: settings.metrics_hallucination_enabled ?? true,
          metrics_data_quality_enabled: settings.metrics_data_quality_enabled ?? true,
          metrics_complexity_enabled: settings.metrics_complexity_enabled ?? true,
        });
      }
      setLoading(false);
    };

    loadSettings();
  }, []);

  // Save toggle changes
  const handleToggleChange = async (key: keyof MetricToggles, value: boolean) => {
    const newToggles = { ...toggles, [key]: value };
    setToggles(newToggles);

    // Persist to database
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id, self_improvement_settings')
      .limit(1)
      .maybeSingle();

    const existingSettings = (existing?.self_improvement_settings as Record<string, any>) || {};
    const updatedSettings = { ...existingSettings, ...newToggles };

    if (existing) {
      await supabase
        .from('app_settings')
        .update({
          self_improvement_settings: updatedSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('app_settings').insert({
        self_improvement_settings: updatedSettings,
      });
    }

    const metricName = key.replace('metrics_', '').replace('_enabled', '').replace('_', ' ');
    toast({
      title: value ? 'Metric enabled' : 'Metric disabled',
      description: `${metricName.charAt(0).toUpperCase() + metricName.slice(1)} evaluation is now ${value ? 'on' : 'off'}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with Settings Icon */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Self-Improvement Overview</h3>
          <p className="text-sm text-muted-foreground">
            Configure evaluation metrics and view system status
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(!settingsOpen)}
          className={settingsOpen ? 'bg-accent' : ''}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Collapsible Settings Panel */}
      <Collapsible open={settingsOpen}>
        <CollapsibleContent className="transition-all duration-200">
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Evaluation Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Metric Toggles */}
              <div className="flex flex-wrap gap-6">
                {/* Hallucination */}
                <div className="flex items-center space-x-3">
                  <Switch
                    id="hallucination"
                    checked={toggles.metrics_hallucination_enabled}
                    onCheckedChange={(v) => handleToggleChange('metrics_hallucination_enabled', v)}
                    disabled={loading}
                  />
                  <Label htmlFor="hallucination" className="flex items-center gap-2 cursor-pointer">
                    <Shield className="h-4 w-4 text-amber-600" />
                    Hallucination
                  </Label>
                </div>

                {/* Data Quality */}
                <div className="flex items-center space-x-3">
                  <Switch
                    id="dataQuality"
                    checked={toggles.metrics_data_quality_enabled}
                    onCheckedChange={(v) => handleToggleChange('metrics_data_quality_enabled', v)}
                    disabled={loading}
                  />
                  <Label htmlFor="dataQuality" className="flex items-center gap-2 cursor-pointer">
                    <Database className="h-4 w-4 text-blue-600" />
                    Data Quality
                  </Label>
                </div>

                {/* Complexity */}
                <div className="flex items-center space-x-3">
                  <Switch
                    id="complexity"
                    checked={toggles.metrics_complexity_enabled}
                    onCheckedChange={(v) => handleToggleChange('metrics_complexity_enabled', v)}
                    disabled={loading}
                  />
                  <Label htmlFor="complexity" className="flex items-center gap-2 cursor-pointer">
                    <Cpu className="h-4 w-4 text-purple-600" />
                    Complexity
                  </Label>
                </div>
              </div>

              {/* Info text */}
              <div className="flex items-start gap-2 text-sm text-muted-foreground pt-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>Disabled metrics will be skipped during AI evaluation after workflow execution.</p>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Dashboard placeholder */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground max-w-md">
            Navigate to the <span className="font-medium">Current Data</span> tab to view evaluation history,
            configure thresholds, and generate improvement summaries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
