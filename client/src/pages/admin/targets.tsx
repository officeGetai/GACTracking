// client/src/pages/admin/targets.tsx

import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, isWithinInterval, subDays } from "date-fns";
import {
  Target,
  Users,
  TrendingUp,
  Zap,
  CheckCircle,
  Circle,
  Clock,
  Search,
  RefreshCw,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Check,
  X,
  Eye,
  Star,
  Award,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Building2,
  User,
  FileText,
  DollarSign,
  AlertCircle,
  Loader2,
  Download,
  ChevronLeft,
  ChevronUp,
  Code,
  GitBranch,
  ListChecks,
  AlertTriangle,
  SlidersHorizontal,
  Grid3X3,
  List,
  LayoutGrid,
  Columns,
  XCircle,
  Hash,
  Activity,
  Flame,
  Trophy,
  Medal,
  Crown,
  Layers,
  FolderOpen,
  Tag,
  Timer,
  ArrowRight,
  ChevronFirst,
  ChevronLast,
  MoreVertical,
  Inbox,
  Package,
  Briefcase,
  Globe,
  Linkedin,
  MonitorSmartphone,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { SafeUser, TargetItem, Target as TargetType } from "@shared/schema";

// === TARGET SETTING DIALOG ===
interface TargetDialogState {
  open: boolean;
  employee: SafeUser | null;
  currentTarget: TargetType | null;
}

function SetTargetDialog({
  state,
  onClose,
  onSave,
  selectedMonth,
  isSaving,
}: {
  state: TargetDialogState;
  onClose: () => void;
  onSave: (data: { userId: string; month: string; meetingTarget: number; orderTarget: number }) => void;
  selectedMonth: string;
  isSaving: boolean;
}) {
  const [meetingTarget, setMeetingTarget] = useState(20);
  const [orderTarget, setOrderTarget] = useState(5);

  React.useEffect(() => {
    if (state.open) {
      setMeetingTarget(state.currentTarget?.meetingTarget || 20);
      setOrderTarget(state.currentTarget?.orderTarget || 5);
    }
  }, [state.open, state.currentTarget, state.employee?.id]);

  const handleSave = () => {
    if (!state.employee) return;
    onSave({
      userId: state.employee.id,
      month: selectedMonth,
      meetingTarget,
      orderTarget,
    });
  };

  const employeeName = state.employee ? `${state.employee.firstName} ${state.employee.lastName}` : "";

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Set Monthly Targets
          </DialogTitle>
          <DialogDescription>
            Set meeting and order targets for <strong>{employeeName}</strong> for {format(new Date(selectedMonth + "-01"), "MMMM yyyy")}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label htmlFor="meeting-target" className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              Meeting Target
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="meeting-target"
                type="number"
                min={0}
                max={100}
                value={meetingTarget}
                onChange={(e) => setMeetingTarget(parseInt(e.target.value) || 0)}
                className="w-24 text-center font-semibold"
                data-testid="input-meeting-target"
              />
              <span className="text-sm text-slate-500">meetings per month</span>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="order-target" className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              Order Target
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="order-target"
                type="number"
                min={0}
                max={100}
                value={orderTarget}
                onChange={(e) => setOrderTarget(parseInt(e.target.value) || 0)}
                className="w-24 text-center font-semibold"
                data-testid="input-order-target"
              />
              <span className="text-sm text-slate-500">orders per month</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving} data-testid="button-cancel-target">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-target">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Save Targets
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === TYPES ===
interface EmployeeTargetData {
  employee: SafeUser;
  target: TargetType | null;
  meetings: { total: number; verified: number; rejected: number; items: TargetItem[] };
  orders: { total: number; verified: number; rejected: number; items: TargetItem[] };
}

interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string; color: string };
  date_done: string | null;
  url: string;
  priority: { priority: string; color: string } | null;
  list: { name: string };
  folder: { name: string; hidden?: boolean };
  project: { name: string; hidden?: boolean };
  tags: Array<{ name: string; tag_bg: string; tag_fg: string }>;
}

interface ClickUpUser { id: number; username: string; email: string }

interface DevEmployeeResult {
  employee: SafeUser;
  clickUpUser: ClickUpUser | null;
  tasks: ClickUpTask[];
  taskCount: number;
  status: "linked" | "not_linked" | "error";
  error?: string;
}

interface DevDataResponse {
  month: string;
  employees: DevEmployeeResult[];
  totals: { totalEmployees: number; linkedEmployees: number; totalTasks: number };
}

interface BDSummaryResponse {
  employees: EmployeeTargetData[];
  totals: {
    totalMeetings: number; verifiedMeetings: number; rejectedMeetings: number;
    totalOrders: number; verifiedOrders: number; rejectedOrders: number; totalEmployees: number;
  };
}

interface FilterState {
  types: string[];
  statuses: string[];
  sources: string[];
  clientTypes: string[];
  priorities: string[];
  dateRange: { from: Date | null; to: Date | null };
}

// === CONSTANTS ===
const SOURCES = [
  { value: "FB Yousaf", icon: MonitorSmartphone, category: "Facebook" },
  { value: "FB Abdullah", icon: MonitorSmartphone, category: "Facebook" },
  { value: "FB Get Ai", icon: MonitorSmartphone, category: "Facebook" },
  { value: "Insta Yousaf", icon: MonitorSmartphone, category: "Instagram" },
  { value: "Insta Getai", icon: MonitorSmartphone, category: "Instagram" },
  { value: "Linkedin Yousaf", icon: Linkedin, category: "LinkedIn" },
  { value: "Linkedin Abdullah", icon: Linkedin, category: "LinkedIn" },
  { value: "Linkedin Get Ai", icon: Linkedin, category: "LinkedIn" },
  { value: "Discovery", icon: Globe, category: "Organic" },
  { value: "Top Upwork", icon: Briefcase, category: "Freelance" },
  { value: "New Upwork", icon: Briefcase, category: "Freelance" },
  { value: "Fiver Top", icon: Briefcase, category: "Freelance" },
];

const PRIORITIES = ["urgent", "high", "normal", "low"];

// === HELPERS ===
const getInitials = (firstName: string, lastName: string) => 
  `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";

const getAvatarColor = (name: string) => {
  const colors = [
    "from-blue-500 to-blue-600", "from-emerald-500 to-emerald-600",
    "from-violet-500 to-violet-600", "from-rose-500 to-rose-600",
    "from-amber-500 to-amber-600", "from-cyan-500 to-cyan-600",
    "from-indigo-500 to-indigo-600", "from-pink-500 to-pink-600",
  ];
  return colors[(name?.charCodeAt(0) || 0) % colors.length];
};

const getPriorityConfig = (priority: string | undefined) => {
  switch (priority?.toLowerCase()) {
    case "urgent": return { color: "bg-red-500", badge: "bg-red-500/10 text-red-600 border-red-500/20", icon: Flame };
    case "high": return { color: "bg-orange-500", badge: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: ArrowUpRight };
    case "normal": return { color: "bg-blue-500", badge: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Activity };
    case "low": return { color: "bg-slate-400", badge: "bg-slate-500/10 text-slate-600 border-slate-500/20", icon: ArrowDownRight };
    default: return { color: "bg-slate-300", badge: "bg-slate-500/10 text-slate-500 border-slate-500/20", icon: Circle };
  }
};

const calculateThisWeekTasks = (tasks: ClickUpTask[]): number => {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  return tasks.filter(task => {
    if (!task.date_done) return false;
    const doneDate = new Date(parseInt(task.date_done));
    return isWithinInterval(doneDate, { start: weekStart, end: weekEnd });
  }).length;
};

const calculatePriorityStats = (tasks: ClickUpTask[]) => {
  return tasks.reduce(
    (acc, task) => {
      const priority = task.priority?.priority?.toLowerCase() || "none";
      if (priority === "urgent") acc.urgent++;
      else if (priority === "high") acc.high++;
      else if (priority === "normal") acc.normal++;
      else acc.low++;
      return acc;
    },
    { urgent: 0, high: 0, normal: 0, low: 0 }
  );
};

// === MINI STAT PILL ===
function MiniStat({ icon: Icon, value, label, color = "slate" }: { 
  icon: any; value: number | string; label: string; color?: string 
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
    slate: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full", colorClasses[color])}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-sm font-semibold">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}

// === FILTER CHIP ===
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
      {label}
      <button onClick={onRemove} className="hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full p-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// === ADVANCED FILTER PANEL ===
function FilterPanel({
  filters,
  setFilters,
  onClear,
  activeCount,
  department,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  onClear: () => void;
  activeCount: number;
  department: "bd" | "dev";
}) {
  const toggleFilter = (category: keyof FilterState, value: string) => {
    if (category === "dateRange") return;
    setFilters(prev => ({
      ...prev,
      [category]: (prev[category] as string[]).includes(value)
        ? (prev[category] as string[]).filter(v => v !== value)
        : [...(prev[category] as string[]), value]
    }));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-medium">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Advanced Filters
          </SheetTitle>
          <SheetDescription>
            Fine-tune your view with multiple filter options
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {department === "bd" && (
            <>
              {/* Type Filter */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-400" />
                  Entry Type
                </Label>
                <div className="flex flex-wrap gap-2">
                  {["meeting", "order"].map(type => (
                    <button
                      key={type}
                      onClick={() => toggleFilter("types", type)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                        filters.types.includes(type)
                          ? type === "meeting" 
                            ? "bg-blue-500 text-white" 
                            : "bg-emerald-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                      )}
                    >
                      {type === "meeting" ? "📅 Meetings" : "💰 Orders"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Filter */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-slate-400" />
                  Status
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "verified", label: "Verified", color: "bg-emerald-500" },
                    { value: "pending", label: "Pending", color: "bg-amber-500" },
                    { value: "rejected", label: "Rejected", color: "bg-rose-500" },
                  ].map(status => (
                    <button
                      key={status.value}
                      onClick={() => toggleFilter("statuses", status.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                        filters.statuses.includes(status.value)
                          ? `${status.color} text-white`
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                      )}
                    >
                      <span className={cn("w-2 h-2 rounded-full", 
                        filters.statuses.includes(status.value) ? "bg-white" : status.color
                      )} />
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source Filter */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-400" />
                  Lead Source
                </Label>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                  {Object.entries(
                    SOURCES.reduce((acc, s) => {
                      if (!acc[s.category]) acc[s.category] = [];
                      acc[s.category].push(s);
                      return acc;
                    }, {} as Record<string, typeof SOURCES>)
                  ).map(([category, sources]) => (
                    <div key={category} className="space-y-1">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider px-2 pt-2">
                        {category}
                      </p>
                      {sources.map(source => (
                        <label
                          key={source.value}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                            filters.sources.includes(source.value)
                              ? "bg-blue-50 dark:bg-blue-950"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          <Checkbox
                            checked={filters.sources.includes(source.value)}
                            onCheckedChange={() => toggleFilter("sources", source.value)}
                          />
                          <source.icon className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm">{source.value}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Client Type */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  Client Type
                </Label>
                <div className="flex gap-2">
                  {["B2B", "B2C"].map(type => (
                    <button
                      key={type}
                      onClick={() => toggleFilter("clientTypes", type)}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        filters.clientTypes.includes(type)
                          ? type === "B2B" 
                            ? "bg-purple-500 text-white" 
                            : "bg-amber-500 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                      )}
                    >
                      {type === "B2B" ? "🏢 B2B" : "👤 B2C"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {department === "dev" && (
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Flame className="w-4 h-4 text-slate-400" />
                Priority Level
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map(priority => {
                  const config = getPriorityConfig(priority);
                  return (
                    <button
                      key={priority}
                      onClick={() => toggleFilter("priorities", priority)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize flex items-center gap-2",
                        filters.priorities.includes(priority)
                          ? `${config.color} text-white`
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                      )}
                    >
                      <config.icon className="w-3.5 h-3.5" />
                      {priority}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-8">
          <Button variant="outline" onClick={onClear} className="flex-1">
            Clear All
          </Button>
          <SheetClose asChild>
            <Button className="flex-1">Apply Filters</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// === COMPACT ENTRY CARD (BD) ===
function CompactEntryCard({
  entry,
  type,
  employeeName,
  onVerify,
  onReject,
  isVerifying,
}: {
  entry: TargetItem;
  type: "meeting" | "order";
  employeeName: string;
  onVerify: () => void;
  onReject: () => void;
  isVerifying: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div
        className={cn(
          "group relative p-3 rounded-xl border transition-all duration-200",
          "bg-white dark:bg-slate-900/50 backdrop-blur-sm",
          entry.verified
            ? "border-emerald-200/50 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/20"
            : !!entry.isRejected
            ? "border-rose-200/50 dark:border-rose-800/50 bg-rose-50/30 dark:bg-rose-950/20"
            : "border-slate-200/50 dark:border-slate-700/50",
          "hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50",
          "hover:border-slate-300 dark:hover:border-slate-600"
        )}
      >
        {/* Top accent line */}
        <div className={cn(
          "absolute top-0 left-3 right-3 h-0.5 rounded-full",
          type === "meeting" ? "bg-blue-500" : "bg-emerald-500"
        )} />

        <div className="flex items-start gap-3">
          {/* Type Icon */}
          <div className={cn(
            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
            type === "meeting" 
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" 
              : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
          )}>
            {type === "meeting" ? <TrendingUp className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                  {entry.name}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {entry.date ? format(new Date(entry.date), "MMM dd") : "No date"}
                  {entry.source && ` • ${entry.source}`}
                </p>
              </div>

              {/* Status Badge */}
              <div className="shrink-0">
                {entry.verified ? (
                  <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </span>
                ) : !!entry.isRejected ? (
                  <span className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center">
                    <X className="w-3.5 h-3.5 text-white" />
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center animate-pulse">
                    <Clock className="w-3.5 h-3.5 text-white" />
                  </span>
                )}
              </div>
            </div>

            {/* Client Type Badge */}
            {(entry as any).clientType && (
              <Badge variant="outline" className={cn(
                "mt-2 text-[10px] px-1.5 py-0",
                (entry as any).clientType === "B2B" 
                  ? "border-purple-200 text-purple-600 bg-purple-50 dark:bg-purple-950/30" 
                  : "border-amber-200 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
              )}>
                {(entry as any).clientType}
              </Badge>
            )}

            {/* Actions */}
            {!entry.verified && !entry.isRejected && (
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" 
                  onClick={onVerify} 
                  disabled={isVerifying}
                >
                  {isVerifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                  Verify
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50" 
                  onClick={onReject}
                  disabled={isVerifying}
                >
                  <X className="w-3 h-3 mr-1" />Reject
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-7 px-2 text-xs ml-auto"
                  onClick={() => setShowDetails(true)}
                >
                  <Eye className="w-3 h-3" />
                </Button>
              </div>
            )}

            {/* External Link */}
            {(entry.verified || !!entry.isRejected) && entry.contactLink && (
              <a
                href={entry.contactLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700"
              >
                <ExternalLink className="w-3 h-3" />View in GHL
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {type === "meeting" ? <TrendingUp className="w-5 h-5 text-blue-500" /> : <DollarSign className="w-5 h-5 text-emerald-500" />}
              {entry.name}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div><p className="text-xs text-slate-500 mb-1">Type</p><Badge className={type === "meeting" ? "bg-blue-500" : "bg-emerald-500"}>{type}</Badge></div>
            <div><p className="text-xs text-slate-500 mb-1">Employee</p><p className="font-medium text-sm">{employeeName}</p></div>
            <div><p className="text-xs text-slate-500 mb-1">Date</p><p className="font-medium text-sm">{entry.date ? format(new Date(entry.date), "MMMM dd, yyyy") : "N/A"}</p></div>
            <div><p className="text-xs text-slate-500 mb-1">Source</p><p className="font-medium text-sm">{entry.source || "N/A"}</p></div>
            <div><p className="text-xs text-slate-500 mb-1">Client Type</p><p className="font-medium text-sm">{(entry as any).clientType || "N/A"}</p></div>
            <div><p className="text-xs text-slate-500 mb-1">Status</p><Badge className={entry.verified ? "bg-emerald-500" : !!entry.isRejected ? "bg-rose-500" : "bg-amber-500"}>{entry.verified ? "Verified" : !!entry.isRejected ? "Rejected" : "Pending"}</Badge></div>
          </div>
          {entry.contactLink && (
            <DialogFooter>
              <Button variant="outline" className="w-full" onClick={() => window.open(entry.contactLink!, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" />Open GHL Contact
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// === COMPACT TASK CARD (DEV) ===
function CompactTaskCard({ task }: { task: ClickUpTask }) {
  const config = getPriorityConfig(task.priority?.priority);

  return (
    <div className={cn(
      "group relative p-3 rounded-xl border transition-all duration-200",
      "bg-white dark:bg-slate-900/50 backdrop-blur-sm",
      "border-slate-200/50 dark:border-slate-700/50",
      "hover:shadow-lg hover:shadow-purple-500/10",
      "hover:border-purple-300 dark:hover:border-purple-700"
    )}>
      <div className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-full", config.color)} />

      <div className="pl-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <h4 className="font-medium text-sm text-slate-900 dark:text-white truncate">{task.name}</h4>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: task.status?.color || '#94a3b8' }} />
                {task.status?.status || "Done"}
              </span>
              <span>•</span>
              <span className="truncate">{task.list?.name || "No List"}</span>
            </div>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0" 
                onClick={() => window.open(task.url, '_blank')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in ClickUp</TooltipContent>
          </Tooltip>
        </div>

        {task.priority && (
          <Badge variant="outline" className={cn("mt-2 text-[10px] px-1.5 py-0 capitalize", config.badge)}>
            <config.icon className="w-2.5 h-2.5 mr-1" />
            {task.priority.priority}
          </Badge>
        )}

        {task.date_done && (
          <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
            <Timer className="w-3 h-3" />
            {format(new Date(parseInt(task.date_done)), "MMM dd, h:mm a")}
          </p>
        )}
      </div>
    </div>
  );
}

// === EMPLOYEE ROW (BD) ===
function BDEmployeeRow({
  data,
  isExpanded,
  onToggle,
  onVerify,
  onReject,
  onSetTarget,
  verifyingId,
  filters,
}: {
  data: EmployeeTargetData;
  isExpanded: boolean;
  onToggle: () => void;
  onVerify: (itemId: string) => void;
  onReject: (itemId: string) => void;
  onSetTarget: () => void;
  verifyingId: string | null;
  filters: FilterState;
}) {
  const { employee, target, meetings, orders } = data;
  const employeeName = `${employee.firstName} ${employee.lastName}`;

  const meetingsTarget = target?.meetingTarget || 20;
  const ordersTarget = target?.orderTarget || 5;
  const meetingsProgress = meetingsTarget > 0 ? Math.min((meetings.total / meetingsTarget) * 100, 100) : 0;
  const ordersProgress = ordersTarget > 0 ? Math.min((orders.total / ordersTarget) * 100, 100) : 0;

  const filterItems = useCallback((items: TargetItem[], type: "meeting" | "order") => {
    return items.filter((item) => {
      if (filters.types.length > 0 && !filters.types.includes(type)) return false;
      if (filters.statuses.length > 0) {
        const status = item.verified ? "verified" : !!item.isRejected ? "rejected" : "pending";
        if (!filters.statuses.includes(status)) return false;
      }
      if (filters.sources.length > 0 && (!item.source || !filters.sources.includes(item.source))) return false;
      if (filters.clientTypes.length > 0 && !(item as any).clientType) return false;
      if (filters.clientTypes.length > 0 && !filters.clientTypes.includes((item as any).clientType)) return false;
      return true;
    });
  }, [filters]);

  const filteredMeetings = useMemo(() => filterItems(meetings.items, "meeting"), [meetings.items, filterItems]);
  const filteredOrders = useMemo(() => filterItems(orders.items, "order"), [orders.items, filterItems]);
  const totalFiltered = filteredMeetings.length + filteredOrders.length;
  const pendingCount = [...meetings.items, ...orders.items].filter(i => !i.verified && !i.isRejected).length;

  const performanceScore = Math.round((meetingsProgress + ordersProgress) / 2);

  return (
    <div className="group">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-4 p-3 rounded-xl transition-all",
          "bg-white dark:bg-slate-900/50 backdrop-blur-sm",
          "border border-slate-200/50 dark:border-slate-700/50",
          "hover:border-slate-300 dark:hover:border-slate-600",
          "hover:shadow-md",
          isExpanded && "border-blue-200 dark:border-blue-800 shadow-md"
        )}
      >
        {/* Avatar */}
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={cn("text-white font-semibold bg-gradient-to-br text-sm", getAvatarColor(employee.firstName))}>
              {getInitials(employee.firstName, employee.lastName)}
            </AvatarFallback>
          </Avatar>
          {performanceScore >= 100 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
              <Crown className="w-3 h-3 text-amber-900" />
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{employeeName}</h3>
            {pendingCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px] px-1.5 py-0">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">{employee.email}</p>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">Meetings</p>
              <p className="text-sm font-bold text-blue-600">{meetings.verified}/{meetingsTarget}</p>
            </div>
            <div className="w-16">
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${meetingsProgress}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">Orders</p>
              <p className="text-sm font-bold text-emerald-600">{orders.verified}/{ordersTarget}</p>
            </div>
            <div className="w-16">
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${ordersProgress}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Performance Badge */}
        <div className="hidden sm:flex items-center gap-2">
          <div className={cn(
            "px-2 py-1 rounded-lg text-xs font-semibold",
            performanceScore >= 100 ? "bg-emerald-100 text-emerald-700" :
            performanceScore >= 75 ? "bg-blue-100 text-blue-700" :
            performanceScore >= 50 ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-600"
          )}>
            {performanceScore}%
          </div>
        </div>

        {/* Set Target Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onSetTarget();
              }}
              data-testid={`button-set-target-${employee.id}`}
            >
              <Target className="w-4 h-4 text-blue-600" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Set Monthly Targets</TooltipContent>
        </Tooltip>

        {/* Expand Icon */}
        <ChevronRight className={cn(
          "w-4 h-4 text-slate-400 transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>

      {/* Expanded Content */}
      {isExpanded && totalFiltered > 0 && (
        <div className="mt-2 ml-6 pl-6 border-l-2 border-slate-200 dark:border-slate-700 space-y-4 py-4">
          {filteredMeetings.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Meetings ({filteredMeetings.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {filteredMeetings.map((m) => (
                  <CompactEntryCard 
                    key={m.id} 
                    entry={m} 
                    type="meeting" 
                    employeeName={employeeName}
                    onVerify={() => onVerify(m.id)}
                    onReject={() => onReject(m.id)}
                    isVerifying={verifyingId === m.id}
                  />
                ))}
              </div>
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Orders ({filteredOrders.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {filteredOrders.map((o) => (
                  <CompactEntryCard 
                    key={o.id} 
                    entry={o} 
                    type="order" 
                    employeeName={employeeName}
                    onVerify={() => onVerify(o.id)}
                    onReject={() => onReject(o.id)}
                    isVerifying={verifyingId === o.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isExpanded && totalFiltered === 0 && (
        <div className="mt-2 ml-6 pl-6 border-l-2 border-slate-200 dark:border-slate-700 py-6 text-center text-sm text-slate-500">
          No entries match current filters
        </div>
      )}
    </div>
  );
}

// === EMPLOYEE ROW (DEV) ===
function DevEmployeeRow({
  data,
  isExpanded,
  onToggle,
  searchQuery,
  filters,
}: {
  data: DevEmployeeResult;
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery: string;
  filters: FilterState;
}) {
  const { employee, clickUpUser, tasks, taskCount, status, error } = data;
  const employeeName = `${employee.firstName} ${employee.lastName}`;

  const thisWeekTasks = useMemo(() => calculateThisWeekTasks(tasks), [tasks]);
  const priorityStats = useMemo(() => calculatePriorityStats(tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filters.priorities.length > 0) {
        const priority = t.priority?.priority?.toLowerCase() || "none";
        if (!filters.priorities.includes(priority)) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, filters.priorities]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, ClickUpTask[]> = {};
    filteredTasks.forEach(task => {
      const dateKey = task.date_done 
        ? format(new Date(parseInt(task.date_done)), "yyyy-MM-dd")
        : "No Date";
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(task);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5);
  }, [filteredTasks]);

  return (
    <div className="group">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-4 p-3 rounded-xl transition-all",
          "bg-white dark:bg-slate-900/50 backdrop-blur-sm",
          "border border-slate-200/50 dark:border-slate-700/50",
          "hover:border-purple-300 dark:hover:border-purple-700",
          "hover:shadow-md hover:shadow-purple-500/5",
          isExpanded && "border-purple-200 dark:border-purple-800 shadow-md shadow-purple-500/5"
        )}
      >
        {/* Avatar */}
        <Avatar className="h-10 w-10">
          <AvatarFallback className={cn("text-white font-semibold bg-gradient-to-br text-sm", getAvatarColor(employee.firstName))}>
            {getInitials(employee.firstName, employee.lastName)}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{employeeName}</h3>
            {status === "linked" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/30">
                <Code className="w-2.5 h-2.5 mr-1" />ClickUp
              </Badge>
            )}
            {status === "not_linked" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-600 border-amber-200">
                <AlertTriangle className="w-2.5 h-2.5 mr-1" />Not Linked
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">{employee.email}</p>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500">Month</p>
            <p className="text-sm font-bold text-purple-600">{taskCount}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Week</p>
            <p className="text-sm font-bold text-cyan-600">{thisWeekTasks}</p>
          </div>
        </div>

        {/* Priority Pills */}
        <div className="hidden lg:flex items-center gap-1">
          {priorityStats.urgent > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">{priorityStats.urgent}</span>
          )}
          {priorityStats.high > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">{priorityStats.high}</span>
          )}
          {priorityStats.normal > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">{priorityStats.normal}</span>
          )}
        </div>

        <ChevronRight className={cn(
          "w-4 h-4 text-slate-400 transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-2 ml-6 pl-6 border-l-2 border-purple-200 dark:border-purple-800 space-y-4 py-4">
          {status === "not_linked" ? (
            <div className="text-center py-6 text-slate-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              <p className="font-medium">Not Linked to ClickUp</p>
              <p className="text-sm">Email not found in ClickUp workspace</p>
            </div>
          ) : status === "error" ? (
            <div className="text-center py-6 text-slate-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="font-medium">Error</p>
              <p className="text-sm">{error || "Failed to fetch tasks"}</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <ListChecks className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p>No tasks match filters</p>
            </div>
          ) : (
            <>
              {/* Priority Summary Bar */}
              <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-xs text-slate-500">Priority:</span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">🔥 {priorityStats.urgent} urgent</span>
                <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">⬆️ {priorityStats.high} high</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">▶️ {priorityStats.normal} normal</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">⬇️ {priorityStats.low} low</span>
              </div>

              {/* Grouped Tasks */}
              {groupedTasks.map(([date, dateTasks]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      {date === "No Date" ? date : format(new Date(date), "EEEE, MMM dd")}
                    </span>
                    <span className="text-xs text-slate-400">({dateTasks.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {dateTasks.slice(0, 8).map((task) => (
                      <CompactTaskCard key={task.id} task={task} />
                    ))}
                  </div>
                  {dateTasks.length > 8 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">+{dateTasks.length - 8} more</p>
                  )}
                </div>
              ))}

              {/* View All Link */}
              {clickUpUser && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <a
                    href={`https://app.clickup.com/9009178151/v/li?assignees[]=${clickUpUser.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                  >
                    View all {taskCount} tasks in ClickUp <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// === MAIN COMPONENT ===
export default function AdminTargetBoard() {
  const { toast } = useToast();

  // State
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [activeDepartment, setActiveDepartment] = useState<"bd" | "dev">("bd");
  const [targetDialog, setTargetDialog] = useState<TargetDialogState>({
    open: false,
    employee: null,
    currentTarget: null,
  });
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    statuses: [],
    sources: [],
    clientTypes: [],
    priorities: [],
    dateRange: { from: null, to: null },
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.types.length) count++;
    if (filters.statuses.length) count++;
    if (filters.sources.length) count++;
    if (filters.clientTypes.length) count++;
    if (filters.priorities.length) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      types: [], statuses: [], sources: [], clientTypes: [], priorities: [],
      dateRange: { from: null, to: null },
    });
  };

  // Month options
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ value: format(date, "yyyy-MM"), label: format(date, "MMM yyyy") });
    }
    return options;
  }, []);

  // Fetch BD Data
  const { data: bdData, isLoading: bdLoading, refetch: refetchBD } = useQuery<BDSummaryResponse>({
    queryKey: ["/api/admin/targets/summary", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/admin/targets/summary?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch BD targets");
      return res.json();
    },
    staleTime: 60000,
  });

  // Fetch Dev Data
  const { data: devData, isLoading: devLoading, refetch: refetchDev } = useQuery<DevDataResponse>({
    queryKey: ["/api/admin/clickup/all-tasks", selectedMonth],
    queryFn: async () => {
      const res = await fetch(`/api/admin/clickup/all-tasks?month=${selectedMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch dev tasks");
      return res.json();
    },
    staleTime: 60000,
    enabled: activeDepartment === "dev",
  });

  // Mutations
  const verifyMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/targets/items/${itemId}/verify`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targets/summary"] });
      toast({ title: "✓ Verified", description: "Entry verified successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/targets/items/${itemId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targets/summary"] });
      toast({ title: "Entry Rejected", description: "The entry has been rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setTargetMutation = useMutation({
    mutationFn: async (data: { userId: string; month: string; meetingTarget: number; orderTarget: number }) => {
      const res = await apiRequest("POST", "/api/admin/targets", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/targets/summary"] });
      toast({ title: "Targets Updated", description: "Monthly targets have been saved successfully." });
      setTargetDialog({ open: false, employee: null, currentTarget: null });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openTargetDialog = (employee: SafeUser, target: TargetType | null) => {
    setTargetDialog({ open: true, employee, currentTarget: target });
  };

  const handleVerify = async (itemId: string) => {
    setVerifyingId(itemId);
    try { await verifyMutation.mutateAsync(itemId); } 
    finally { setVerifyingId(null); }
  };

  const handleReject = async (itemId: string) => {
    if (window.confirm("Reject this entry?")) {
      setVerifyingId(itemId);
      try { await rejectMutation.mutateAsync(itemId); } 
      finally { setVerifyingId(null); }
    }
  };

  // Filter employees
  const filteredBDEmployees = useMemo(() => {
    if (!bdData?.employees) return [];
    return bdData.employees.filter((emp) => {
      if (searchQuery) {
        const fullName = `${emp.employee.firstName} ${emp.employee.lastName}`.toLowerCase();
        if (!fullName.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [bdData?.employees, searchQuery]);

  const filteredDevEmployees = useMemo(() => {
    if (!devData?.employees) return [];
    return devData.employees.filter((emp) => {
      if (searchQuery) {
        const fullName = `${emp.employee.firstName} ${emp.employee.lastName}`.toLowerCase();
        if (!fullName.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [devData?.employees, searchQuery]);

  const toggleEmployee = (employeeId: string) => {
    const newExpanded = new Set(expandedEmployees);
    newExpanded.has(employeeId) ? newExpanded.delete(employeeId) : newExpanded.add(employeeId);
    setExpandedEmployees(newExpanded);
  };

  const expandAll = () => {
    const employees = activeDepartment === "bd" ? filteredBDEmployees : filteredDevEmployees;
    setExpandedEmployees(new Set(employees.map((e) => e.employee.id)));
  };

  // Stats
  const bdStats = bdData?.totals || { 
    totalMeetings: 0, verifiedMeetings: 0, rejectedMeetings: 0,
    totalOrders: 0, verifiedOrders: 0, rejectedOrders: 0, totalEmployees: 0 
  };

  const devStats = useMemo(() => {
    if (!devData?.employees) return { totalTasks: 0, thisWeekTasks: 0, linkedEmployees: 0, totalEmployees: 0 };
    let totalTasks = 0, thisWeekTasks = 0;
    devData.employees.forEach((emp) => {
      totalTasks += emp.taskCount;
      thisWeekTasks += calculateThisWeekTasks(emp.tasks);
    });
    return {
      totalTasks, thisWeekTasks,
      linkedEmployees: devData.totals?.linkedEmployees || 0,
      totalEmployees: devData.totals?.totalEmployees || 0,
    };
  }, [devData]);

  const isLoading = activeDepartment === "bd" ? bdLoading : devLoading;

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
        {/* Compact Header */}
        <div className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 z-50">
          <div className="px-4 py-2">
            <div className="flex items-center gap-3">
              {/* Department Tabs */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveDepartment("bd")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    activeDepartment === "bd" 
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  )}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span className="hidden sm:inline">BD</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{bdStats.totalEmployees}</Badge>
                </button>
                <button
                  onClick={() => setActiveDepartment("dev")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                    activeDepartment === "dev" 
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  )}
                >
                  <Code className="w-4 h-4" />
                  <span className="hidden sm:inline">Dev</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{devStats.totalEmployees}</Badge>
                </button>
              </div>

              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-slate-50 dark:bg-slate-800 border-slate-200/50"
                />
              </div>

              {/* Month Selector */}
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[120px] h-9 bg-slate-50 dark:bg-slate-800">
                  <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filters */}
              <FilterPanel 
                filters={filters} 
                setFilters={setFilters} 
                onClear={clearFilters}
                activeCount={activeFilterCount}
                department={activeDepartment}
              />

              {/* Actions */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={expandAll}>
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Expand All</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setExpandedEmployees(new Set())}>
                      <List className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Collapse All</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => activeDepartment === "bd" ? refetchBD() : refetchDev()}>
                      <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
              {activeDepartment === "bd" ? (
                <>
                  <MiniStat icon={TrendingUp} value={bdStats.totalMeetings} label="meetings" color="blue" />
                  <MiniStat icon={DollarSign} value={bdStats.totalOrders} label="orders" color="emerald" />
                  <MiniStat icon={CheckCircle} value={bdStats.verifiedMeetings + bdStats.verifiedOrders} label="verified" color="emerald" />
                  <MiniStat icon={Clock} value={(bdStats.totalMeetings - bdStats.verifiedMeetings - bdStats.rejectedMeetings) + (bdStats.totalOrders - bdStats.verifiedOrders - bdStats.rejectedOrders)} label="pending" color="amber" />
                  <MiniStat icon={XCircle} value={bdStats.rejectedMeetings + bdStats.rejectedOrders} label="rejected" color="rose" />
                </>
              ) : (
                <>
                  <MiniStat icon={ListChecks} value={devStats.totalTasks} label="tasks" color="purple" />
                  <MiniStat icon={Zap} value={devStats.thisWeekTasks} label="this week" color="cyan" />
                  <MiniStat icon={Code} value={devStats.linkedEmployees} label="linked" color="purple" />
                </>
              )}

              {/* Active Filters */}
              {activeFilterCount > 0 && (
                <>
                  <Separator orientation="vertical" className="h-5" />
                  <div className="flex items-center gap-1">
                    {filters.types.map(t => <FilterChip key={t} label={t} onRemove={() => setFilters(p => ({ ...p, types: p.types.filter(x => x !== t) }))} />)}
                    {filters.statuses.map(s => <FilterChip key={s} label={s} onRemove={() => setFilters(p => ({ ...p, statuses: p.statuses.filter(x => x !== s) }))} />)}
                    {filters.clientTypes.map(c => <FilterChip key={c} label={c} onRemove={() => setFilters(p => ({ ...p, clientTypes: p.clientTypes.filter(x => x !== c) }))} />)}
                    {filters.sources.length > 0 && <FilterChip label={`${filters.sources.length} sources`} onRemove={() => setFilters(p => ({ ...p, sources: [] }))} />}
                    {filters.priorities.length > 0 && <FilterChip label={`${filters.priorities.length} priorities`} onRemove={() => setFilters(p => ({ ...p, priorities: [] }))} />}
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500" onClick={clearFilters}>
                      Clear all
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 max-w-[1800px] mx-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-700" />
                    <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" />
                  </div>
                  <p className="text-sm text-slate-500">Loading...</p>
                </div>
              </div>
            ) : activeDepartment === "bd" ? (
              filteredBDEmployees.length > 0 ? (
                <div className="space-y-2">
                  {filteredBDEmployees.map((empData) => (
                    <BDEmployeeRow
                      key={empData.employee.id}
                      data={empData}
                      isExpanded={expandedEmployees.has(empData.employee.id)}
                      onToggle={() => toggleEmployee(empData.employee.id)}
                      onVerify={handleVerify}
                      onReject={handleReject}
                      onSetTarget={() => openTargetDialog(empData.employee, empData.target)}
                      verifyingId={verifyingId}
                      filters={filters}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">No BD Employees</h3>
                  <p className="text-sm text-slate-500">No business development data for this month</p>
                </div>
              )
            ) : (
              filteredDevEmployees.length > 0 ? (
                <div className="space-y-2">
                  {filteredDevEmployees.map((empData) => (
                    <DevEmployeeRow
                      key={empData.employee.id}
                      data={empData}
                      isExpanded={expandedEmployees.has(empData.employee.id)}
                      onToggle={() => toggleEmployee(empData.employee.id)}
                      searchQuery={searchQuery}
                      filters={filters}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <Code className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">No Dev Employees</h3>
                  <p className="text-sm text-slate-500">No development data for this month</p>
                </div>
              )
            )}
          </div>
        </ScrollArea>

        {/* Minimal Footer */}
        <div className="shrink-0 px-4 py-1.5 bg-white/50 dark:bg-slate-900/50 backdrop-blur border-t border-slate-200/30 dark:border-slate-800/30">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {activeDepartment === "bd" 
                ? `${filteredBDEmployees.length} employees`
                : `${filteredDevEmployees.length} employees`
              }
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live • {format(new Date(), "h:mm a")}
            </span>
          </div>
        </div>
      </div>

      {/* Set Target Dialog */}
      <SetTargetDialog
        state={targetDialog}
        onClose={() => setTargetDialog({ open: false, employee: null, currentTarget: null })}
        onSave={(data) => setTargetMutation.mutate(data)}
        selectedMonth={selectedMonth}
        isSaving={setTargetMutation.isPending}
      />
    </TooltipProvider>
  );
}