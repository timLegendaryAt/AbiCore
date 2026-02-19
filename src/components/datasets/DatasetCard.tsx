import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { Dataset } from "@/types/dataset";

interface DatasetCardProps {
  dataset: Dataset;
  onEdit: (dataset: Dataset) => void;
  onDuplicate: (dataset: Dataset) => void;
  onDelete: (dataset: Dataset) => void;
}

export const DatasetCard = ({ dataset, onEdit, onDuplicate, onDelete }: DatasetCardProps) => {
  const dependencyCount = dataset.dependencies.length;
  const previewDependencies = dataset.dependencies.slice(0, 3);
  const remainingCount = dependencyCount - 3;

  return (
    <Card 
      className="group hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-[1.02]"
      onClick={() => onEdit(dataset)}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{dataset.name}</CardTitle>
            {dataset.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {dataset.description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Badge variant="secondary" className="mb-2">
            {dependencyCount} {dependencyCount === 1 ? 'Dependency' : 'Dependencies'}
          </Badge>
          
          {previewDependencies.length > 0 && (
            <div className="text-sm text-muted-foreground space-y-1">
              {previewDependencies.map((dep, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="font-medium">{dep.nodeName}</span>
                  <span className="text-xs">({dep.nodeType})</span>
                  {!dep.isIntegration && dep.workflowName && (
                    <span className="text-xs italic">- {dep.workflowName}</span>
                  )}
                  {dep.isIntegration && (
                    <Badge variant="outline" className="text-xs">Integration</Badge>
                  )}
                </div>
              ))}
              {remainingCount > 0 && (
                <div className="text-xs italic">+{remainingCount} more...</div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(dataset);
              }}
              className="flex-1"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(dataset);
              }}
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(dataset);
              }}
              className="flex-1 hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
