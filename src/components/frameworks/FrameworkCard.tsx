import { Framework } from "@/types/framework";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Copy, Trash2 } from "lucide-react";

interface FrameworkCardProps {
  framework: Framework;
  onEdit: (framework: Framework) => void;
  onDuplicate: (framework: Framework) => void;
  onDelete: (framework: Framework) => void;
}

const typeColors = {
  rating_scale: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  rubric: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  criteria: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  custom: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  document: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
};

const typeLabels = {
  rating_scale: "Rating Scale",
  rubric: "Rubric",
  criteria: "Criteria",
  custom: "Custom",
  document: "Document"
};

const categoryColors = {
  lifecycle: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300"
};

export const FrameworkCard = ({ framework, onEdit, onDuplicate, onDelete }: FrameworkCardProps) => {
  const displayTags = [
    framework.language && `Language: ${framework.language}`,
    framework.score && `Score: ${framework.score}`
  ].filter(Boolean);

  // For document type, show a preview of the content
  const getContentPreview = () => {
    if (framework.type === 'document') {
      const schemaStr = JSON.stringify(framework.schema);
      return schemaStr.substring(1, 101) + (schemaStr.length > 100 ? '...' : '');
    }
    return null;
  };

  const contentPreview = getContentPreview();

  const isLifecycle = framework.category === "lifecycle";

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
      onClick={() => onEdit(framework)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{framework.name}</CardTitle>
          <div className="flex gap-1">
            {isLifecycle && (
              <Badge className={categoryColors.lifecycle} variant="secondary">
                Lifecycle
              </Badge>
            )}
            {!isLifecycle && (
              <Badge className={typeColors[framework.type]} variant="secondary">
                {typeLabels[framework.type]}
              </Badge>
            )}
          </div>
        </div>
        {framework.description && (
          <CardDescription className="line-clamp-1">
            {framework.description}
          </CardDescription>
        )}
        {contentPreview && (
          <CardDescription className="line-clamp-2 font-mono text-xs mt-1">
            {contentPreview}
          </CardDescription>
        )}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {displayTags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardFooter className="p-4 pt-2 flex items-center justify-between">
        <div className="flex gap-2">
          {framework.workflow_association && (
            <Badge variant="secondary" className="text-xs">
              Workflow
            </Badge>
          )}
          {framework.is_template && (
            <Badge variant="secondary" className="text-xs">
              Template
            </Badge>
          )}
        </div>
        
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(framework);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(framework);
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(framework);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
