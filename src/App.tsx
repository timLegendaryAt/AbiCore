import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Frameworks from "./pages/Frameworks";
import Dataset from "./pages/Dataset";
import Companies from "./pages/Companies";
import NotFound from "./pages/NotFound";
import { AuthGuard } from "./components/auth/AuthGuard";
import { AppLayout } from "./components/layout/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<AuthGuard><AppLayout defaultExpanded={false}><Index /></AppLayout></AuthGuard>} />
          <Route path="/frameworks" element={<AuthGuard><AppLayout defaultExpanded={false}><Frameworks /></AppLayout></AuthGuard>} />
          <Route path="/datasets" element={<AuthGuard><AppLayout defaultExpanded={false}><Dataset /></AppLayout></AuthGuard>} />
          <Route path="/companies" element={<AuthGuard requireAdmin><AppLayout defaultExpanded={false}><Companies /></AppLayout></AuthGuard>} />
          <Route path="/self-improvement" element={<Navigate to="/admin?tab=self-improvement" replace />} />
          <Route path="/admin" element={<AuthGuard requireAdmin><AppLayout defaultExpanded={true}><Admin /></AppLayout></AuthGuard>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
