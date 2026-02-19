import { AvailableModelsSection } from './AvailableModelsSection';
import { ModelVerificationPanel } from './ModelVerificationPanel';

export function AgentsModels() {
  return (
    <div className="space-y-6 pt-4">
      <ModelVerificationPanel />
      <AvailableModelsSection />
    </div>
  );
}
