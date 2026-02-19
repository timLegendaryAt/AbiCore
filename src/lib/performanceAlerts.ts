import { supabase } from '@/integrations/supabase/client';
import { formatCost } from '@/lib/modelRegistry';
import type { PerformanceStats } from '@/components/self-improvement/PerformanceMetricsSection';

export interface PerformanceThresholds {
  speed_threshold_ms: number;
  e2e_latency_threshold_ms: number;
  cost_threshold: number;
  token_threshold_percent: number;
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  speed_threshold_ms: 5000,          // 5 seconds
  e2e_latency_threshold_ms: 30000,   // 30 seconds from dep change to response
  cost_threshold: 0.01,              // $0.01 per generation
  token_threshold_percent: 80,       // 80% of model max
};

export async function checkPerformanceAlerts(
  stats: PerformanceStats,
  workflowId: string,
  nodeId: string,
  nodeLabel: string,
  thresholds: PerformanceThresholds = DEFAULT_PERFORMANCE_THRESHOLDS
): Promise<void> {
  // Check speed
  if (stats.avgSpeedMs && stats.avgSpeedMs > thresholds.speed_threshold_ms) {
    await supabase.rpc('upsert_performance_alert', {
      _workflow_id: workflowId,
      _node_id: nodeId,
      _node_label: nodeLabel,
      _alert_type: 'slow_speed',
      _value: stats.avgSpeedMs,
      _threshold: thresholds.speed_threshold_ms,
      _description: `Average speed ${(stats.avgSpeedMs / 1000).toFixed(1)}s exceeds ${thresholds.speed_threshold_ms / 1000}s threshold`
    });
  }
  
  // Check E2E latency
  if (stats.avgE2ELatencyMs && stats.avgE2ELatencyMs > thresholds.e2e_latency_threshold_ms) {
    await supabase.rpc('upsert_performance_alert', {
      _workflow_id: workflowId,
      _node_id: nodeId,
      _node_label: nodeLabel,
      _alert_type: 'high_latency',
      _value: stats.avgE2ELatencyMs,
      _threshold: thresholds.e2e_latency_threshold_ms,
      _description: `Average E2E latency ${(stats.avgE2ELatencyMs / 1000).toFixed(1)}s exceeds ${thresholds.e2e_latency_threshold_ms / 1000}s threshold`
    });
  }
  
  // Check cost
  if (stats.avgCost && stats.avgCost > thresholds.cost_threshold) {
    await supabase.rpc('upsert_performance_alert', {
      _workflow_id: workflowId,
      _node_id: nodeId,
      _node_label: nodeLabel,
      _alert_type: 'high_cost',
      _value: stats.avgCost,
      _threshold: thresholds.cost_threshold,
      _description: `Average cost ${formatCost(stats.avgCost)} exceeds ${formatCost(thresholds.cost_threshold)} threshold`
    });
  }
}
