// client/src/components/app-sidebar.tsx
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileBarChart,
  Settings,
  FileText,
  MessageSquareText,
  Archive,
  Clock,
  Calendar,
  ClipboardList,
  Send,
  FolderArchive,
  LogOut,
  Zap,
  ChevronsRight,
  MoreVertical,
  Bell,
  HelpCircle,
  Moon,
  Sun,
  Target, // Imported Target icon
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { motion, AnimatePresence } from "framer-motion";

// Admin Navigation Items
const adminNavItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
    gradient: "from-blue-400 to-blue-600",
    glow: "shadow-blue-500/25",
  },
  {
    title: "Employees",
    url: "/admin/employees",
    icon: Users,
    gradient: "from-violet-400 to-violet-600",
    glow: "shadow-violet-500/25",
  },
  // ADDED: BD Target Setup
  {
    title: "BD Targets",
    url: "/admin/targets",
    icon: Target,
    gradient: "from-red-400 to-rose-600",
    glow: "shadow-rose-500/25",
  },
  {
    title: "Attendance",
    url: "/admin/attendance",
    icon: CalendarCheck,
    gradient: "from-emerald-400 to-emerald-600",
    glow: "shadow-emerald-500/25",
  },
  {
    title: "Reports",
    url: "/admin/reports",
    icon: FileBarChart,
    gradient: "from-orange-400 to-orange-600",
    glow: "shadow-orange-500/25",
  },
  {
    title: "Daily Reports",
    url: "/admin/daily-reports",
    icon: FileText,
    gradient: "from-cyan-400 to-cyan-600",
    glow: "shadow-cyan-500/25",
  },
  {
    title: "Requests",
    url: "/admin/special-requests",
    icon: MessageSquareText,
    gradient: "from-pink-400 to-pink-600",
    glow: "shadow-pink-500/25",
    badge: "3",
  },
  {
    title: "Archive",
    url: "/admin/archive",
    icon: Archive,
    gradient: "from-slate-400 to-slate-600",
    glow: "shadow-slate-500/25",
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
    gradient: "from-gray-400 to-gray-600",
    glow: "shadow-gray-500/25",
  },
];

// Employee Navigation Items
const employeeNavItems = [
  {
    title: "Dashboard",
    url: "/employee",
    icon: LayoutDashboard,
    gradient: "from-blue-400 to-blue-600",
    glow: "shadow-blue-500/25",
  },
  {
    title: "Attendance",
    url: "/employee/attendance",
    icon: Clock,
    gradient: "from-emerald-400 to-emerald-600",
    glow: "shadow-emerald-500/25",
  },
  {
    title: "Calendar",
    url: "/employee/calendar",
    icon: Calendar,
    gradient: "from-violet-400 to-violet-600",
    glow: "shadow-violet-500/25",
  },
  {
    title: "Shift Report",
    url: "/employee/shift-report",
    icon: ClipboardList,
    gradient: "from-orange-400 to-orange-600",
    glow: "shadow-orange-500/25",
  },
  {
    title: "Request",
    url: "/employee/special-request",
    icon: Send,
    gradient: "from-pink-400 to-pink-600",
    glow: "shadow-pink-500/25",
  },
  {
    title: "Archive",
    url: "/employee/archive",
    icon: FolderArchive,
    gradient: "from-slate-400 to-slate-600",
    glow: "shadow-slate-500/25",
  },
];

// Animated Logo Component
const Logo = ({ collapsed }: { collapsed: boolean }) => (
  <div className="flex items-center gap-3 px-1">
    {/* Animated Logo Icon */}
    <motion.div
      className="relative flex-shrink-0"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
        <Zap className="w-5 h-5 text-white fill-white" />
      </div>
      {/* Animated glow ring */}
      <motion.div
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 opacity-50 blur-md -z-10"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.div>

    {/* Animated Text */}
    <AnimatePresence mode="wait">
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col"
        >
          <span className="font-bold text-base tracking-tight text-white">
            Dash<span className="text-blue-400">HR</span>
          </span>
          <span className="text-[10px] text-slate-400 -mt-0.5 font-medium">
            Recovery System
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// Animated Navigation Item
const NavItem = ({
  item,
  isActive,
  collapsed,
  index,
}: {
  item: (typeof adminNavItems)[0];
  isActive: boolean;
  collapsed: boolean;
  index: number;
}) => {
  const Icon = item.icon;

  const content = (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className={cn(
          "relative h-11 transition-all duration-300 group/item",
          collapsed ? "w-11 px-0 justify-center mx-auto" : "w-full px-3",
          isActive
            ? "bg-white/10 text-white"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        )}
      >
        <Link href={item.url}>
          {/* Active Indicator - Animated */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-gradient-to-b from-blue-400 to-purple-500 rounded-r-full"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                exit={{ opacity: 0, scaleY: 0 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </AnimatePresence>

          {/* Icon Container */}
          <motion.div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300",
              isActive
                ? `bg-gradient-to-br ${item.gradient} shadow-lg ${item.glow}`
                : "bg-slate-800/50 group-hover/item:bg-slate-700/50"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Icon
              className={cn(
                "w-[18px] h-[18px] transition-all duration-300",
                isActive ? "text-white" : "text-slate-400 group-hover/item:text-slate-200"
              )}
            />
          </motion.div>

          {/* Label */}
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                className="flex-1 flex items-center justify-between ml-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <span className="text-sm font-medium truncate">{item.title}</span>
                {item.badge && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold"
                  >
                    {item.badge}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </SidebarMenuButton>
    </motion.div>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="flex items-center gap-2 bg-slate-900 border-slate-800 text-white"
        >
          {item.title}
          {item.badge && (
            <span className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {item.badge}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
};

// Theme Toggle Button
const ThemeToggle = ({ collapsed }: { collapsed: boolean }) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  const button = (
    <motion.button
      onClick={handleToggle}
      className={cn(
        "relative flex items-center gap-3 rounded-lg transition-all duration-300",
        "text-slate-400 hover:text-white hover:bg-white/5",
        collapsed ? "h-11 w-11 justify-center mx-auto" : "h-11 w-full px-3"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 transition-colors">
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div
              key="sun"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Sun className="w-[18px] h-[18px] text-amber-400" />
            </motion.div>
          ) : (
            <motion.div
              key="moon"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Moon className="w-[18px] h-[18px] text-blue-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            className="text-sm font-medium"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {isDark ? "Light Mode" : "Dark Mode"}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="bg-slate-900 border-slate-800 text-white">
          {isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

// User Menu Component
const UserMenu = ({ collapsed }: { collapsed: boolean }) => {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const initials = `${user?.firstName?.charAt(0) || ""}${user?.lastName?.charAt(0) || ""}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.button
          className={cn(
            "flex items-center gap-3 w-full rounded-xl p-2 transition-all duration-300",
            "hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            collapsed && "justify-center"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative">
            <Avatar className="h-10 w-10 rounded-xl ring-2 ring-white/10">
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Online indicator */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-slate-900" />
          </div>

          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                className="flex-1 text-left"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                <p className="text-sm font-semibold text-white truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-slate-400 truncate capitalize">{user?.role}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && <MoreVertical className="w-4 h-4 text-slate-500" />}
        </motion.button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "start" : "center"}
        className="w-56 bg-slate-900 border-slate-800 text-white"
      >
        <DropdownMenuLabel className="text-slate-300">
          <div className="flex flex-col">
            <span className="font-semibold text-white">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs font-normal text-slate-400">{user?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuItem
          className="text-slate-300 hover:text-white hover:bg-white/5 focus:bg-white/5 cursor-pointer"
          onClick={() => setLocation(user?.role === "admin" ? "/admin/notifications" : "/employee/notifications")}
        >
          <Bell className="w-4 h-4 mr-2" />
          Notifications
        </DropdownMenuItem>
        <DropdownMenuItem className="text-slate-300 hover:text-white hover:bg-white/5 focus:bg-white/5">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem className="text-slate-300 hover:text-white hover:bg-white/5 focus:bg-white/5">
          <HelpCircle className="w-4 h-4 mr-2" />
          Help & Support
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-slate-800" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Toggle Button Component
const ToggleButton = ({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <motion.button
          onClick={onToggle}
          className={cn(
            "absolute -right-3 top-7 z-50",
            "flex items-center justify-center w-6 h-6 rounded-full",
            "bg-slate-800 hover:bg-slate-700 border border-slate-700",
            "text-slate-400 hover:text-white",
            "shadow-lg transition-colors duration-200"
          )}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <motion.div
            animate={{ rotate: collapsed ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </motion.div>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-slate-900 border-slate-800 text-white">
        {collapsed ? "Expand sidebar" : "Collapse sidebar"}
      </TooltipContent>
    </Tooltip>
  );
};

// Decorative Background Elements
const SidebarBackground = () => (
  <>
    {/* Gradient orbs */}
    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
    <div className="absolute bottom-20 left-0 w-24 h-24 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
    <div className="absolute top-1/2 right-0 w-20 h-20 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
  </>
);

// Main Sidebar Component
export function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { state, toggleSidebar } = useSidebar();

  const collapsed = state === "collapsed";
  const navItems = user?.role === "admin" ? adminNavItems : employeeNavItems;

  // Separate main and system items
  const mainItems = navItems.filter(
    (item) => !["Settings", "Archive"].includes(item.title)
  );
  const systemItems = navItems.filter((item) =>
    ["Settings", "Archive"].includes(item.title)
  );

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        "border-r border-slate-800/50",
        "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950",
        "transition-all duration-300 ease-in-out"
      )}
    >
      {/* Background decorations */}
      <SidebarBackground />

      {/* Header with Logo */}
      <SidebarHeader className="relative p-4 border-b border-slate-800/50">
        <Logo collapsed={collapsed} />
        <ToggleButton collapsed={collapsed} onToggle={toggleSidebar} />
      </SidebarHeader>

      {/* Main Navigation */}
      <SidebarContent className="relative p-3">
        <SidebarGroup>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <SidebarGroupLabel className="px-3 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Main Menu
                </SidebarGroupLabel>
              </motion.div>
            )}
          </AnimatePresence>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {mainItems.map((item, index) => (
                <SidebarMenuItem key={item.title}>
                  <NavItem
                    item={item}
                    isActive={location === item.url}
                    collapsed={collapsed}
                    index={index}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System Items */}
        <SidebarGroup className="mt-auto pt-4 border-t border-slate-800/50">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <SidebarGroupLabel className="px-3 mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  System
                </SidebarGroupLabel>
              </motion.div>
            )}
          </AnimatePresence>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {systemItems.map((item, index) => (
                <SidebarMenuItem key={item.title}>
                  <NavItem
                    item={item}
                    isActive={location === item.url}
                    collapsed={collapsed}
                    index={mainItems.length + index}
                  />
                </SidebarMenuItem>
              ))}

              {/* Theme Toggle */}
              <SidebarMenuItem>
                <ThemeToggle collapsed={collapsed} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with User */}
      <SidebarFooter className="relative p-3 border-t border-slate-800/50">
        <UserMenu collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}