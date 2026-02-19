import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface IntegrationCardProps {
  integration: {
    id: string;
    name: string;
    description: string;
    color: string;
    connected: boolean;
    initials: string;
  };
  onUpdate?: () => void;
}

export const IntegrationCard = ({ integration, onUpdate }: IntegrationCardProps) => {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleConnect = async () => {
    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ connected: !integration.connected })
        .eq('id', integration.id);
      
      if (error) throw error;
      
      toast({
        title: integration.connected ? "Disconnected" : "Connected",
        description: `${integration.name} has been ${integration.connected ? 'disconnected' : 'connected'}`,
      });
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating integration:', error);
      toast({
        title: "Error",
        description: "Failed to update integration",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          <div 
            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: integration.color }}
          >
            {integration.initials}
          </div>
          <Badge variant={integration.connected ? "default" : "outline"} className="text-xs">
            {integration.connected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
        <CardTitle className="text-lg">{integration.name}</CardTitle>
        <CardDescription className="text-sm">
          {integration.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleConnect}
          className="w-full"
          variant={integration.connected ? "outline" : "default"}
          disabled={isUpdating}
        >
          {isUpdating ? "Updating..." : integration.connected ? "Disconnect" : "Connect"}
        </Button>
      </CardContent>
    </Card>
  );
};
