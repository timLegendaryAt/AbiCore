import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ValidationBannerProps {
  errors: string[];
  onClose: () => void;
}

export function ValidationBanner({ errors, onClose }: ValidationBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="bg-warning/10 border-l-4 border-warning p-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-semibold text-foreground mb-1">Preview validation failed</h3>
        <ul className="text-sm text-foreground space-y-1">
          {errors.map((error, index) => (
            <li key={index}>• {error}</li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-6 w-6 p-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
