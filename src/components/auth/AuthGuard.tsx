import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false, requireSuperAdmin = false }: AuthGuardProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          if (isMounted) {
            navigate('/auth');
          }
          return;
        }

        // Check for super_admin if required
        if (requireSuperAdmin) {
          const { data: isSuperAdmin, error } = await supabase
            .rpc('is_super_admin', { _user_id: session.user.id });

          if (error) {
            console.error('Error checking super admin role:', error);
            if (isMounted) {
              navigate('/auth');
            }
            return;
          }

          if (!isSuperAdmin) {
            if (isMounted) {
              navigate('/');
            }
            return;
          }
        } else if (requireAdmin) {
          // Check if user has admin role using the has_role function
          const { data: hasAdminRole, error } = await supabase
            .rpc('has_role', { _user_id: session.user.id, _role: 'admin' });

          if (error) {
            console.error('Error checking admin role:', error);
            if (isMounted) {
              navigate('/auth');
            }
            return;
          }

          // Also check for owner and super_admin roles as they should have admin access
          const { data: hasOwnerRole } = await supabase
            .rpc('has_role', { _user_id: session.user.id, _role: 'owner' });
          
          const { data: hasSuperAdminRole } = await supabase
            .rpc('has_role', { _user_id: session.user.id, _role: 'super_admin' });

          if (!hasAdminRole && !hasOwnerRole && !hasSuperAdminRole) {
            if (isMounted) {
              navigate('/auth');
            }
            return;
          }
        }

        if (isMounted) {
          setAuthorized(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        if (isMounted) {
          navigate('/auth');
        }
      }
    };

    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          if (isMounted) {
            navigate('/auth');
          }
        } else if (event === 'SIGNED_IN') {
          checkAuth();
        }
      }
    );

    checkAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, requireAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return <>{children}</>;
}
