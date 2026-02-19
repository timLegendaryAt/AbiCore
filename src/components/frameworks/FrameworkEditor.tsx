import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FrameworkForm } from "./FrameworkForm";
import { Framework, FrameworkFormData } from "@/types/framework";

interface Workflow {
  id: string;
  name: string;
}

interface FrameworkEditorProps {
  framework?: Framework;
  workflows: Workflow[];
  lifecycleMode: boolean;
  onSubmit: (data: FrameworkFormData) => void;
  onCancel: () => void;
}

export const FrameworkEditor = ({
  framework,
  workflows,
  lifecycleMode,
  onSubmit,
  onCancel
}: FrameworkEditorProps) => {
  const isEditing = !!framework;
  const title = lifecycleMode
    ? (isEditing ? `Edit Lifecycle: ${framework?.name}` : "Add Lifecycle")
    : (isEditing ? `Edit Framework: ${framework?.name}` : "Create Framework");
  const backLabel = lifecycleMode ? "Back to lifecycles" : "Back to frameworks";

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header with back button */}
      <div className="border-b px-6 py-4 space-y-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backLabel}
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {lifecycleMode
              ? "Enter a name and paste your lifecycle content"
              : "Fill in the details to configure this framework"}
          </p>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <FrameworkForm
            framework={framework}
            workflows={workflows}
            lifecycleMode={lifecycleMode}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      </div>
    </div>
  );
};
