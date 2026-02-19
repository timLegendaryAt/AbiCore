import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Zap,
  Layers,
  FileStack,
  Database,
  Building2,
  Sparkles,
  Palette,
  Bot,
  Plug,
  BarChart3,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Settings,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { NotificationPanel } from './NotificationPanel';

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, toggleSidebar, setOpen } = useSidebar();
  const collapsed = state === 'collapsed';
  
  const [appName, setAppName] = useState('ABI//CORE');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasUnresolvedAlerts, setHasUnresolvedAlerts] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const fetchBranding = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .maybeSingle();

      if (data && !error) {
        if (data.app_name) setAppName(data.app_name);
        setLogoUrl(data.logo_url);
      }
    };
    fetchBranding();

    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        const { data: isSuperAdminResult } = await supabase.rpc('is_super_admin', {
          _user_id: user.id
        });
        setIsSuperAdmin(isSuperAdminResult || false);
      }
    };
    fetchUser();

    // Check for unresolved alerts
    const checkAlerts = async () => {
      const { count } = await supabase
        .from('system_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);
      
      const alertNum = count || 0;
      setAlertCount(alertNum);
      setHasUnresolvedAlerts(alertNum > 0);
    };
    
    checkAlerts();
    const alertInterval = setInterval(checkAlerts, 30000);
    return () => clearInterval(alertInterval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const isActive = (path: string) => location.pathname === path;
  const isSettingsActive = location.pathname === '/admin';

  // Get current tab from URL
  const currentTab = new URLSearchParams(location.search).get('tab') || 'design';
  const isAgentsActive = currentTab === 'agents' || currentTab.startsWith('agents-');
  const isSelfImprovementActive = currentTab === 'self-improvement' || currentTab.startsWith('self-improvement-');
  const isDatabaseActive = currentTab === 'database' || currentTab.startsWith('database-');

  // Main navigation items
  const mainNavItems = [
    { title: 'Workflows', url: '/', icon: Layers },
    { title: 'Frameworks', url: '/frameworks', icon: FileStack },
    { title: 'Datasets', url: '/datasets', icon: Database },
    { title: 'Companies', url: '/companies', icon: Building2 },
    { title: 'Settings', url: '/admin', icon: Settings },
  ];

  const handleNavigation = (url: string) => {
    if (url === '/admin') {
      setOpen(true);
    } else {
      setOpen(false);
    }
    navigate(url);
  };

  // Settings sub-navigation items
  const settingsNavItems = [
    { id: 'design', title: 'General', icon: Palette },
    { id: 'database', title: 'Database', icon: Database },
    { id: 'self-improvement', title: 'Self-Improvement', icon: Sparkles },
    { id: 'ai', title: 'Automagic Workflows', icon: Zap },
    { id: 'integrations', title: 'Integrations', icon: Plug },
    { id: 'analytics', title: 'Analytics', icon: BarChart3 },
    { id: 'errors', title: 'Errors & Alerts', icon: AlertTriangle },
    ...(isSuperAdmin ? [{ id: 'users', title: 'Users', icon: Users }] : []),
    { id: 'agents', title: 'Agents', icon: Bot },
  ];

  const navigateToSettings = (tabId?: string) => {
    if (tabId) {
      navigate(`/admin?tab=${tabId}`);
    } else {
      navigate('/admin');
    }
  };

  const getUserInitials = () => {
    if (!userEmail) return '?';
    return userEmail.substring(0, 2).toUpperCase();
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r"
    >
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn(
          "flex items-center gap-2 py-2",
          collapsed ? "justify-center" : "px-2"
        )}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground truncate">{appName}</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup className={cn(collapsed ? "px-1" : "px-2")}>
          {!collapsed && <SidebarGroupLabel>Main</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    onClick={() => handleNavigation(item.url)}
                    isActive={isActive(item.url)}
                    tooltip={collapsed ? item.title : undefined}
                    className={cn(
                      "w-full relative",
                      isActive(item.url) && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings Section - Only show when on admin pages */}
        {isSettingsActive && (
          <>
            <Separator className="my-2" />
            <SidebarGroup className={cn(collapsed ? "px-1" : "px-2")}>
              {!collapsed && <SidebarGroupLabel>Settings</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {collapsed ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => navigateToSettings()}
                        isActive={isSettingsActive}
                        tooltip="Settings"
                        className={cn(
                          "w-full",
                          isSettingsActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                        )}
                      >
                        <Settings className="h-4 w-4" />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : (
                    <>
                      {settingsNavItems.map((item) => {
                        const isItemActive = item.id === 'agents' 
                          ? isAgentsActive 
                          : item.id === 'self-improvement'
                            ? isSelfImprovementActive
                            : item.id === 'database'
                              ? isDatabaseActive
                              : (isSettingsActive && currentTab === item.id);
                        
                        return (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              onClick={() => navigateToSettings(item.id)}
                              isActive={isItemActive}
                              className={cn(
                                "w-full",
                                isItemActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className={cn(
        "border-t border-sidebar-border",
        collapsed ? "p-1" : "p-2"
      )}>
        <div className={cn("flex flex-col gap-1", collapsed && "items-center")}>
          {/* Notification button with Sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full h-10 flex items-center justify-center gap-2 hover:bg-sidebar-accent relative",
                  collapsed ? "px-0" : "justify-start px-2"
                )}
              >
                <Bell className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="text-sm">Notifications</span>}
                {hasUnresolvedAlerts && (
                  <>
                    {collapsed ? (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                    ) : (
                      <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">
                        {alertCount}
                      </Badge>
                    )}
                  </>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[400px] flex flex-col">
              <SheetHeader>
                <SheetTitle>Notifications</SheetTitle>
              </SheetHeader>
              <NotificationPanel onClose={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* User dropdown menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full h-10 flex items-center justify-center gap-2 hover:bg-sidebar-accent",
                  collapsed ? "px-0" : "justify-start px-2"
                )}
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <span className="text-sm font-medium truncate text-sidebar-foreground">{userEmail}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              side={collapsed ? "right" : "top"} 
              align="start"
              className="w-56 bg-popover z-50"
            >
              <div className="px-2 py-1.5 text-sm font-medium">{userEmail}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigateToSettings('design')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Toggle button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn(
              "w-full h-10 text-muted-foreground hover:text-foreground flex items-center justify-center",
              collapsed ? "px-0" : "justify-start px-2"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-2">Collapse</span>
              </>
            )}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
