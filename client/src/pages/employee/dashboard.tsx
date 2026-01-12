import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, differenceInSeconds } from "date-fns";
import {
  Clock,
  Coffee,
  Play,
  Square,
  LogIn,
  LogOut,
  Utensils,
  Timer,
  FileText,
  Send,
  Loader2,
  Sun,
  Moon,
  Zap,
  Activity,
  CheckCircle,
  Circle,
  Pause,
  Target as TargetIcon,
  AlertTriangle,
  Lock,
  Unlock,
  FileCheck,
  AlertCircle,
  TrendingUp,
  Plus,
  ExternalLink,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  MoreHorizontal,
  Trash2,
  Edit3,
  Star,
  Award,
  Sparkles,
  Users,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  Search,
  RefreshCw,
  Video,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useClickUpTasks, type ClickUpTask } from "@/hooks/useClickUpTasks";
import type { Shift, Break, TargetItem, Target as TargetType } from "@shared/schema";
import { cn } from "@/lib/utils";

// --- Types ---
interface TodayStatus {
  shift: Shift | null;
  breaks: Break[];
  breakCounts: { prayer: number; meal: number; urgent: number };
  activeBreak: Break | null;
  hasSubmittedReport: boolean;
}

// === LOOM URL VALIDATION ===
function isValidLoomUrl(url: string): { valid: boolean; error: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: "URL cannot be empty" };
  }

  const trimmedUrl = url.trim();

  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    return { valid: false, error: "URL must start with https://" };
  }

  try {
    const urlObj = new URL(trimmedUrl);
    const hostname = urlObj.hostname.toLowerCase();
    const isLoomDomain =
      hostname === "loom.com" ||
      hostname === "www.loom.com" ||
      hostname.endsWith(".loom.com");

    if (!isLoomDomain) {
      return {
        valid: false,
        error: "URL must be from loom.com (e.g., https://www.loom.com/share/...)",
      };
    }

    const pathname = urlObj.pathname.toLowerCase();
    const validPath =
      pathname.startsWith("/share/") || pathname.startsWith("/embed/");

    if (!validPath) {
      return {
        valid: false,
        error: "URL must be a Loom share or embed link",
      };
    }

    const pathParts = pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || !pathParts[1]) {
      return { valid: false, error: "Invalid Loom URL - missing video ID" };
    }

    return { valid: true, error: "" };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

// --- Helper Functions ---
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDurationShort(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// --- Live Timer Component ---
const LiveDuration = ({
  start,
  deductSeconds = 0,
  className = "",
}: {
  start: string | null | undefined;
  deductSeconds?: number;
  className?: string;
}) => {
  const [time, setTime] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    if (!start) return;

    const updateTime = () => {
      const now = new Date();
      const startTime = new Date(start);
      let totalSeconds = differenceInSeconds(now, startTime) - deductSeconds;
      if (totalSeconds < 0) totalSeconds = 0;

      setTime({
        h: Math.floor(totalSeconds / 3600),
        m: Math.floor((totalSeconds % 3600) / 60),
        s: totalSeconds % 60,
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [start, deductSeconds]);

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {String(time.h).padStart(2, "0")}:{String(time.m).padStart(2, "0")}:
      {String(time.s).padStart(2, "0")}
    </span>
  );
};

// --- Status Pill Component ---
const StatusPill = ({
  status,
  isOnBreak,
}: {
  status: "idle" | "active" | "completed" | "break";
  isOnBreak: boolean;
}) => {
  const styles = {
    idle: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400",
    break: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400",
  };

  const actualStatus = isOnBreak ? "break" : status;

  return (
    <div className={cn("inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold", styles[actualStatus])}>
      <span className={cn(
        "w-2 h-2 rounded-full",
        actualStatus === "idle" && "bg-slate-400",
        actualStatus === "active" && "bg-emerald-500 animate-pulse",
        actualStatus === "completed" && "bg-blue-500",
        actualStatus === "break" && "bg-orange-500 animate-pulse"
      )} />
      {actualStatus === "idle" && "Ready to Start"}
      {actualStatus === "active" && "Shift Active"}
      {actualStatus === "completed" && "Shift Completed"}
      {actualStatus === "break" && "On Break"}
    </div>
  );
};

// --- Break Type Card ---
const BreakTypeCard = ({
  type,
  icon: Icon,
  used,
  max,
  isActive,
  onSelect,
  disabled,
}: {
  type: string;
  icon: any;
  used: number;
  max: number;
  isActive?: boolean;
  onSelect: () => void;
  disabled: boolean;
}) => {
  const remaining = max - used;
  const isMaxed = remaining <= 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || isMaxed}
      className={cn(
        "relative p-4 rounded-xl border-2 transition-all duration-200 text-left w-full",
        "hover:scale-[1.02] active:scale-[0.98]",
        isActive
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300",
        (disabled || isMaxed) && "opacity-50 cursor-not-allowed hover:scale-100"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          "p-2 rounded-lg",
          isActive ? "bg-blue-500 text-white" : "bg-slate-100 dark:bg-slate-800"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        <Badge variant="outline" className={cn("text-xs", isMaxed && "bg-red-50 text-red-600")}>
          {remaining} left
        </Badge>
      </div>
      <p className="font-semibold text-slate-900 dark:text-white capitalize">{type}</p>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full", i < used ? "bg-blue-500" : "bg-slate-200")} />
        ))}
      </div>
    </button>
  );
};

// === MAIN DASHBOARD COMPONENT ===
export default function EmployeeDashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"morning" | "evening">("morning");
  const [selectedBreakType, setSelectedBreakType] = useState<string>("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [loomLinks, setLoomLinks] = useState("");
  const [loomLinkError, setLoomLinkError] = useState("");
  const [references, setReferences] = useState("");
  const [notes, setNotes] = useState("");
  const [existingReportId, setExistingReportId] = useState<string | null>(null);
  const [endShiftDialogOpen, setEndShiftDialogOpen] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();

  const isOpenShiftUser = user?.shiftType === "open";
  const isTwoShiftUser = user?.shiftType === "two_shifts";

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: todayStatus, isLoading } = useQuery<TodayStatus>({
    queryKey: ["/api/employee/today"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const shift = todayStatus?.shift;
  const breaks = todayStatus?.breaks || [];
  const activeBreak = todayStatus?.activeBreak;
  const isOnBreak = !!activeBreak;
  const hasSubmittedReport = todayStatus?.hasSubmittedReport || false;

  // === SHIFT AVAILABILITY LOGIC ===
  const shiftAvailability = useMemo(() => {
    if (isOpenShiftUser) {
      return {
        isMorningUnlocked: true,
        isEveningUnlocked: true,
        isMorningLocked: false,
        isEveningLocked: false,
        morningMessage: "",
        eveningMessage: "",
        morningLockReason: null as "not_started" | "ended" | null,
        eveningLockReason: null as "not_started" | "ended" | null,
      };
    }

    if (!isTwoShiftUser) {
      return {
        isMorningUnlocked: true,
        isEveningUnlocked: false,
        isMorningLocked: false,
        isEveningLocked: true,
        morningMessage: "",
        eveningMessage: "Evening shift not enabled",
        morningLockReason: null,
        eveningLockReason: "not_started" as const,
      };
    }

    const now = currentTime;

    const parseTime = (timeStr: string | undefined): Date | null => {
      if (!timeStr) return null;
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    };

    const morningStart = parseTime(user?.morningShiftStart);
    const morningEnd = parseTime(user?.morningShiftEnd);
    const eveningStart = parseTime(user?.eveningShiftStart);
    const eveningEnd = parseTime(user?.eveningShiftEnd);

    let isMorningUnlocked = false;
    let isEveningUnlocked = false;
    let isMorningLocked = false;
    let isEveningLocked = false;
    let morningMessage = "";
    let eveningMessage = "";
    let morningLockReason: "not_started" | "ended" | null = null;
    let eveningLockReason: "not_started" | "ended" | null = null;

    // Morning shift logic
    if (morningStart && now < morningStart) {
      isMorningLocked = true;
      morningLockReason = "not_started";
      morningMessage = `Unlocks at ${format(morningStart, "hh:mm a")}`;
    } else if (morningStart && morningEnd && now >= morningStart && now < morningEnd) {
      isMorningUnlocked = true;
    } else if (morningEnd && now >= morningEnd) {
      if (shift?.morningClockIn && !shift?.morningClockOut) {
        isMorningUnlocked = true;
        morningMessage = "Overtime - please end your shift";
      } else {
        isMorningLocked = true;
        morningLockReason = "ended";
        morningMessage = "Morning shift time ended";
      }
    }

    // Evening shift logic
    if (eveningStart && now < eveningStart) {
      isEveningLocked = true;
      eveningLockReason = "not_started";
      eveningMessage = `Unlocks at ${format(eveningStart, "hh:mm a")}`;
    } else if (eveningStart && eveningEnd && now >= eveningStart && now < eveningEnd) {
      isEveningUnlocked = true;
    } else if (eveningEnd && now >= eveningEnd) {
      if (shift?.eveningClockIn && !shift?.eveningClockOut) {
        isEveningUnlocked = true;
        eveningMessage = "Overtime - please end your shift";
      } else {
        isEveningLocked = true;
        eveningLockReason = "ended";
        eveningMessage = "Evening shift time ended";
      }
    }

    return {
      isMorningUnlocked,
      isEveningUnlocked,
      isMorningLocked,
      isEveningLocked,
      morningMessage,
      eveningMessage,
      morningLockReason,
      eveningLockReason,
    };
  }, [user, currentTime, shift, isOpenShiftUser, isTwoShiftUser]);

  const {
    isMorningUnlocked,
    isEveningUnlocked,
    isMorningLocked,
    isEveningLocked,
    morningMessage,
    eveningMessage,
    morningLockReason,
    eveningLockReason
  } = shiftAvailability;

  // Auto-switch tabs based on availability
  useEffect(() => {
    if (activeTab === "morning" && isMorningLocked && isEveningUnlocked) {
      setActiveTab("evening");
    } else if (activeTab === "evening" && isEveningLocked && isMorningUnlocked) {
      setActiveTab("morning");
    }
  }, [isMorningUnlocked, isEveningUnlocked, isMorningLocked, isEveningLocked, activeTab]);

  // Fetch existing report when dialog opens
  useEffect(() => {
    if (reportDialogOpen && hasSubmittedReport && shift?.id) {
      const fetchReport = async () => {
        try {
          const res = await fetch(`/api/reports/daily/shift/${shift.id}`);
          if (res.ok) {
            const report = await res.json();
            if (report) {
              setExistingReportId(report.id);
              setReportContent(report.workDetails || "");
              setNotes(report.notes || "");

              // Parse references
              try {
                if (report.references) {
                  const refs = JSON.parse(report.references);
                  setReferences(Array.isArray(refs) ? refs[0] || "" : report.references);
                }
              } catch {
                setReferences(report.references || "");
              }

              // Parse loom videos
              try {
                if (report.loomVideos) {
                  const looms = JSON.parse(report.loomVideos);
                  setLoomLinks(Array.isArray(looms) ? looms[0] || "" : report.loomVideos);
                }
              } catch {
                setLoomLinks(report.loomVideos || "");
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch existing report:", error);
        }
      };
      fetchReport();
    } else if (!reportDialogOpen) {
      // Reset form when dialog closes
      if (!hasSubmittedReport) {
        setExistingReportId(null);
        setReportContent("");
        setNotes("");
        setReferences("");
        setLoomLinks("");
      }
      setLoomLinkError("");
    }
  }, [reportDialogOpen, hasSubmittedReport, shift?.id]);

  // Calculate break time
  const totalBreakSeconds = useMemo(() => {
    return breaks.reduce((acc, b) => {
      if (b.endTime) {
        return acc + differenceInSeconds(new Date(b.endTime), new Date(b.startTime));
      } else if (b.startTime) {
        return acc + differenceInSeconds(currentTime, new Date(b.startTime));
      }
      return acc;
    }, 0);
  }, [breaks, currentTime]);

  // Current shift times based on active tab
  const currentStart = activeTab === "morning" ? shift?.morningClockIn : shift?.eveningClockIn;
  const currentEnd = activeTab === "morning" ? shift?.morningClockOut : shift?.eveningClockOut;
  const isStarted = !!currentStart;
  const isEnded = !!currentEnd;
  const isActive = isStarted && !isEnded;

  // Calculate worked time
  const grossWorkedSeconds = useMemo(() => {
    if (!currentStart) return 0;
    const startTime = new Date(currentStart);
    const endTime = currentEnd ? new Date(currentEnd) : currentTime;
    return differenceInSeconds(endTime, startTime);
  }, [currentStart, currentEnd, currentTime]);

  const netWorkedSeconds = useMemo(() => {
    const net = grossWorkedSeconds - totalBreakSeconds;
    return net > 0 ? net : 0;
  }, [grossWorkedSeconds, totalBreakSeconds]);

  const getShiftStatus = (): "idle" | "active" | "completed" => {
    if (isEnded) return "completed";
    if (isActive) return "active";
    return "idle";
  };

  // ============================================
  // KEY: Report required to end ANY active shift
  // ============================================
  const canEndShift = isActive && hasSubmittedReport && !isOnBreak;
  const needsReportToEnd = isActive && !hasSubmittedReport;

  const isCurrentShiftLocked = activeTab === "morning" ? isMorningLocked : isEveningLocked;
  const currentShiftMessage = activeTab === "morning" ? morningMessage : eveningMessage;
  const currentLockReason = activeTab === "morning" ? morningLockReason : eveningLockReason;

  const calculateProgress = () => {
    if (!currentStart) return 0;
    const targetHours = isOpenShiftUser ? parseFloat(user?.openShiftRequiredHours || "8") : 8;
    const targetSeconds = targetHours * 60 * 60;
    return Math.min(Math.round((netWorkedSeconds / targetSeconds) * 100), 100);
  };

  const calculateEfficiency = () => {
    if (!isStarted) return 0;
    if (isEnded) {
      const targetHours = isOpenShiftUser ? parseFloat(user?.openShiftRequiredHours || "8") : 8;
      const targetSeconds = targetHours * 60 * 60;
      return Math.min(Math.round((netWorkedSeconds / targetSeconds) * 100), 100);
    }
    if (grossWorkedSeconds === 0) return 100;
    return Math.round((netWorkedSeconds / grossWorkedSeconds) * 100);
  };

  // API handlers
  const handleMutation = async (promise: Promise<Response>, successMsg: string, onSuccess?: () => void) => {
    try {
      const res = await promise;
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message);
      }
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/employee/today"] });
      toast({ title: "Success", description: successMsg });
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const [isStartingShift, setIsStartingShift] = useState(false);
  const [isEndingShift, setIsEndingShift] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isStartingBreak, setIsStartingBreak] = useState(false);
  const [isEndingBreak, setIsEndingBreak] = useState(false);

  const startShift = async () => {
    setIsStartingShift(true);
    await handleMutation(
      apiRequest("POST", `/api/employee/shift/${activeTab}/start`),
      `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} shift started`
    );
    setIsStartingShift(false);
  };

  const endShift = async () => {
    // ============================================
    // ALWAYS CHECK FOR REPORT BEFORE ENDING
    // ============================================
    if (!hasSubmittedReport) {
      setReportDialogOpen(true);
      toast({
        title: "Report Required",
        description: "Please submit your daily report before ending your shift.",
        variant: "destructive"
      });
      return;
    }

    setIsEndingShift(true);
    await handleMutation(
      apiRequest("POST", `/api/employee/shift/${activeTab}/end`),
      `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} shift ended`,
      () => setEndShiftDialogOpen(false)
    );
    setIsEndingShift(false);
  };

  const startBreak = async () => {
    if (!selectedBreakType) {
      toast({ title: "Select Break Type", description: "Please select a break type first", variant: "destructive" });
      return;
    }
    setIsStartingBreak(true);
    await handleMutation(
      apiRequest("POST", "/api/employee/break/start", { type: selectedBreakType }),
      `${selectedBreakType.charAt(0).toUpperCase() + selectedBreakType.slice(1)} break started`,
      () => setSelectedBreakType("")
    );
    setIsStartingBreak(false);
  };

  const endBreak = async () => {
    setIsEndingBreak(true);
    await handleMutation(apiRequest("POST", "/api/employee/break/end"), "Break ended");
    setIsEndingBreak(false);
  };

  // Loom link validation
  const handleLoomLinkChange = (value: string) => {
    setLoomLinks(value);
    if (loomLinkError) setLoomLinkError("");
  };

  const validateLoomLinkOnBlur = () => {
    if (loomLinks.trim()) {
      const validation = isValidLoomUrl(loomLinks.trim());
      if (!validation.valid) {
        setLoomLinkError(validation.error);
      } else {
        setLoomLinkError("");
      }
    } else {
      setLoomLinkError("");
    }
  };

  // ============================================
  // SUBMIT REPORT - ONLY WORK DETAILS REQUIRED
  // ============================================
  const submitReport = async () => {
    // Only work details is required
    if (!reportContent.trim()) {
      toast({
        title: "Validation Error",
        description: "Work details are required",
        variant: "destructive"
      });
      return;
    }

    // Validate Loom URL only if provided
    if (loomLinks.trim()) {
      const validation = isValidLoomUrl(loomLinks.trim());
      if (!validation.valid) {
        setLoomLinkError(validation.error);
        toast({
          title: "Invalid Loom URL",
          description: validation.error,
          variant: "destructive"
        });
        return;
      }
    }

    setIsSubmittingReport(true);

    const reportData = {
      shiftId: shift?.id,
      workDetails: reportContent.trim(),
      loomVideos: loomLinks.trim() ? JSON.stringify([loomLinks.trim()]) : null,
      notes: notes.trim() || null,
      references: references.trim() ? JSON.stringify([references.trim()]) : null,
      date: format(new Date(), "yyyy-MM-dd"),
      month: format(new Date(), "yyyy-MM")
    };

    const method = existingReportId ? "PATCH" : "POST";
    const url = existingReportId ? `/api/reports/daily/${existingReportId}` : "/api/reports/daily";
    const successMsg = existingReportId ? "Report updated successfully" : "Report submitted successfully";

    await handleMutation(apiRequest(method, url, reportData), successMsg, () => {
      setReportDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/employee/today"] });
    });

    setIsSubmittingReport(false);
  };

  // Form validation - only work details required
  const isFormValid = () => {
    const hasRequiredFields = reportContent.trim().length > 0;
    const hasValidLoomLink = !loomLinks.trim() || isValidLoomUrl(loomLinks.trim()).valid;
    return hasRequiredFields && hasValidLoomLink && !loomLinkError;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="relative z-10 p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Welcome back, {user?.firstName}
              </h1>
              <p className="text-sm text-slate-500">
                {format(currentTime, "EEEE, MMMM do, yyyy")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border shadow-sm">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="font-mono text-lg font-semibold tabular-nums">
                {format(currentTime, "HH:mm:ss")}
              </span>
            </div>

            {/* Shift Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !isMorningLocked && setActiveTab("morning")}
                    disabled={isMorningLocked}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative",
                      activeTab === "morning"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                      isMorningLocked && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isMorningLocked ? <Lock className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    {isOpenShiftUser ? "Shift" : "Morning"}
                  </button>
                </TooltipTrigger>
                {morningMessage && (
                  <TooltipContent><p>{morningMessage}</p></TooltipContent>
                )}
              </Tooltip>

              {!isOpenShiftUser && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => !isEveningLocked && isEveningUnlocked && setActiveTab("evening")}
                      disabled={isEveningLocked || !isEveningUnlocked}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative",
                        activeTab === "evening"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                        (isEveningLocked || !isEveningUnlocked) && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isEveningLocked || !isEveningUnlocked ? <Lock className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      Evening
                    </button>
                  </TooltipTrigger>
                  {eveningMessage && (
                    <TooltipContent><p>{eveningMessage}</p></TooltipContent>
                  )}
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Report Required Alert */}
        {needsReportToEnd && (
          <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-400">
              Report Required
            </AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-500">
              You must submit a daily report before ending your {activeTab} shift.
              <Button
                variant="link"
                onClick={() => setReportDialogOpen(true)}
                className="ml-2 p-0 h-auto text-amber-700 underline"
              >
                Submit Report Now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Locked Shift Alert */}
        {isCurrentShiftLocked && !isStarted && !isOpenShiftUser && (
          <Alert className={cn(
            currentLockReason === "ended"
              ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"
              : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800"
          )}>
            <Lock className={cn(
              "h-4 w-4",
              currentLockReason === "ended" ? "text-red-600" : "text-blue-600"
            )} />
            <AlertTitle className={currentLockReason === "ended" ? "text-red-800" : "text-blue-800"}>
              {activeTab === "morning" ? "Morning" : "Evening"} Shift Locked
            </AlertTitle>
            <AlertDescription className={currentLockReason === "ended" ? "text-red-700" : "text-blue-700"}>
              {currentShiftMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Time Tracker Card */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl" />

              <CardContent className="relative z-10 p-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div className="space-y-4">
                    <StatusPill status={getShiftStatus()} isOnBreak={isOnBreak} />
                    <div>
                      <p className="text-sm text-slate-400 font-medium">
                        {isActive ? "Net Working Time" : isEnded ? "Total Net Time" : "Ready to Track"}
                      </p>
                      <div className="text-5xl md:text-6xl font-bold tracking-tight">
                        {isActive ? (
                          <LiveDuration start={currentStart?.toString()} deductSeconds={totalBreakSeconds} />
                        ) : isEnded ? (
                          formatDuration(netWorkedSeconds)
                        ) : (
                          "00:00:00"
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 max-w-md">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Progress</span>
                        <span>{calculateProgress()}% of {isOpenShiftUser ? (user?.openShiftRequiredHours || 8) : 8}h target</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000"
                          style={{ width: `${calculateProgress()}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-4">
                    {/* Start Button */}
                    {!isStarted && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="lg"
                            className={cn(
                              "h-24 w-24 rounded-full shadow-lg border-4 transition-all",
                              isCurrentShiftLocked && !isOpenShiftUser
                                ? "bg-gradient-to-br from-slate-400 to-slate-500 border-slate-300/30 cursor-not-allowed"
                                : "bg-gradient-to-br from-emerald-400 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 shadow-emerald-500/30 border-emerald-400/30 hover:scale-105"
                            )}
                            onClick={startShift}
                            disabled={isOnBreak || isStartingShift || (isCurrentShiftLocked && !isOpenShiftUser)}
                          >
                            {isStartingShift ? (
                              <Loader2 className="w-10 h-10 animate-spin" />
                            ) : (isCurrentShiftLocked && !isOpenShiftUser) ? (
                              <Lock className="w-10 h-10" />
                            ) : (
                              <Play className="w-10 h-10 fill-white" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        {isCurrentShiftLocked && !isOpenShiftUser && (
                          <TooltipContent><p>{currentShiftMessage}</p></TooltipContent>
                        )}
                      </Tooltip>
                    )}

                    {/* End Button - Shows report requirement */}
                    {isActive && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="lg"
                            className={cn(
                              "h-24 w-24 rounded-full shadow-lg border-4 transition-all",
                              canEndShift
                                ? "bg-gradient-to-br from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 shadow-red-500/30 border-red-400/30 hover:scale-105"
                                : "bg-gradient-to-br from-slate-500 to-slate-600 border-slate-400/30 cursor-pointer"
                            )}
                            onClick={() => {
                              if (!hasSubmittedReport) {
                                setReportDialogOpen(true);
                              } else {
                                setEndShiftDialogOpen(true);
                              }
                            }}
                            disabled={isOnBreak || isEndingShift}
                          >
                            {isEndingShift ? (
                              <Loader2 className="w-8 h-8 animate-spin" />
                            ) : hasSubmittedReport ? (
                              <Square className="w-8 h-8 fill-white" />
                            ) : (
                              <Lock className="w-8 h-8" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasSubmittedReport
                            ? (isOpenShiftUser ? "Close Shift" : "End Shift")
                            : "Submit report to unlock"
                          }
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Completed State */}
                    {isEnded && (
                      <div className="h-24 w-24 rounded-full bg-slate-700/50 flex items-center justify-center border-4 border-slate-600/30">
                        <CheckCircle className="w-10 h-10 text-emerald-400" />
                      </div>
                    )}

                    <p className="text-xs text-slate-400 font-medium text-center">
                      {!isStarted && !isCurrentShiftLocked && "Tap to clock in"}
                      {!isStarted && isCurrentShiftLocked && !isOpenShiftUser && currentShiftMessage}
                      {isActive && !hasSubmittedReport && "Submit report to end shift"}
                      {isActive && hasSubmittedReport && (isOpenShiftUser ? "Tap to close shift" : "Tap to clock out")}
                      {isEnded && "Shift completed"}
                    </p>
                  </div>
                </div>

                <Separator className="my-6 bg-slate-700" />

                {/* Shift Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <LogIn className="w-3 h-3" />Clock In
                    </p>
                    <p className="text-lg font-semibold">
                      {currentStart ? format(new Date(currentStart), "hh:mm a") : "--:--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <LogOut className="w-3 h-3" />{isOpenShiftUser ? "Closed" : "Clock Out"}
                    </p>
                    <p className="text-lg font-semibold">
                      {currentEnd ? format(new Date(currentEnd), "hh:mm a") : "--:--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Coffee className="w-3 h-3" />Break Time
                    </p>
                    <p className="text-lg font-semibold">{formatDurationShort(totalBreakSeconds)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" />Report
                    </p>
                    <p className="text-lg font-semibold flex items-center gap-2">
                      {hasSubmittedReport ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">Done</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-400">Pending</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <TargetIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Target</p>
                    <p className="text-lg font-bold">{isOpenShiftUser ? (user?.openShiftRequiredHours || 8) : 8}h</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Zap className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Efficiency</p>
                    <p className="text-lg font-bold">{isStarted ? `${calculateEfficiency()}%` : "--"}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <Coffee className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Breaks</p>
                    <p className="text-lg font-bold">
                      {(todayStatus?.breakCounts?.prayer || 0) +
                        (todayStatus?.breakCounts?.meal || 0) +
                        (todayStatus?.breakCounts?.urgent || 0)}/6
                    </p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <Activity className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Gross Time</p>
                    <p className="text-lg font-bold">{isStarted ? formatDurationShort(grossWorkedSeconds) : "--"}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Report Status Cards */}
            {isActive && !hasSubmittedReport && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/50">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Daily Report Required</CardTitle>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Submit your report to unlock {activeTab} shift ending
                        </p>
                      </div>
                    </div>
                    <Button onClick={() => setReportDialogOpen(true)} className="gap-2">
                      <FileCheck className="w-4 h-4" />Submit Report
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}

            {hasSubmittedReport && isActive && (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-emerald-800 dark:text-emerald-400">Report Submitted</p>
                      <p className="text-xs text-emerald-600">You can now end your {activeTab} shift</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportDialogOpen(true)}
                        className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                      >
                        <Edit3 className="w-3.5 h-3.5 mr-1" />Edit
                      </Button>
                      <Badge className="bg-emerald-500">
                        <Unlock className="w-3 h-3 mr-1" />Unlocked
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Break Management Sidebar */}
          <div className="flex flex-col gap-6 lg:h-full">
            {!isOpenShiftUser && (
              <Card className="overflow-hidden">
                <CardHeader className="pb-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50">
                        <Coffee className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Break Control</CardTitle>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isOnBreak ? "Break in progress" : "Manage your breaks"}
                        </p>
                      </div>
                    </div>
                    {isOnBreak && (
                      <Badge className="bg-orange-500 text-white animate-pulse">Active</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  {isOnBreak ? (
                    <div className="space-y-4">
                      <div className="text-center p-6 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200">
                        <div className="text-4xl font-bold text-orange-600 mb-2">
                          <LiveDuration start={activeBreak?.startTime?.toString()} />
                        </div>
                        <p className="text-sm text-slate-600 capitalize">{activeBreak?.type} Break</p>
                      </div>
                      <Button
                        className="w-full bg-orange-600 hover:bg-orange-700"
                        onClick={endBreak}
                        disabled={isEndingBreak}
                      >
                        {isEndingBreak ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Pause className="w-4 h-4 mr-2" />
                        )}
                        End Break
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3">
                        <BreakTypeCard
                          type="Prayer"
                          icon={Timer}
                          used={todayStatus?.breakCounts?.prayer || 0}
                          max={3}
                          isActive={selectedBreakType === "prayer"}
                          onSelect={() => setSelectedBreakType("prayer")}
                          disabled={!isActive}
                        />
                        <BreakTypeCard
                          type="Meal"
                          icon={Utensils}
                          used={todayStatus?.breakCounts?.meal || 0}
                          max={1}
                          isActive={selectedBreakType === "meal"}
                          onSelect={() => setSelectedBreakType("meal")}
                          disabled={!isActive}
                        />
                        <BreakTypeCard
                          type="Urgent"
                          icon={Zap}
                          used={todayStatus?.breakCounts?.urgent || 0}
                          max={2}
                          isActive={selectedBreakType === "urgent"}
                          onSelect={() => setSelectedBreakType("urgent")}
                          disabled={!isActive}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!selectedBreakType || !isActive || isStartingBreak}
                        onClick={startBreak}
                      >
                        {isStartingBreak ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Pause className="w-4 h-4 mr-2" />
                        )}
                        Start Break
                      </Button>
                      {!isActive && (
                        <p className="text-xs text-center text-slate-400">
                          Start your shift to take breaks
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Activity Timeline */}
            <Card className="flex-1 flex flex-col min-h-[250px]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                    <Activity className="w-4 h-4 text-cyan-600" />
                  </div>
                  <CardTitle className="text-base">Today's Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {currentStart && (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-emerald-100">
                          <LogIn className="w-3 h-3 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Clocked In</p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(currentStart), "hh:mm a")}
                          </p>
                        </div>
                      </div>
                    )}
                    {breaks.map((brk, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-orange-100">
                          <Coffee className="w-3 h-3 text-orange-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium capitalize">{brk.type} Break</p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(brk.startTime), "hh:mm a")}
                            {brk.endTime && ` - ${format(new Date(brk.endTime), "hh:mm a")}`}
                            {brk.durationMinutes && ` (${brk.durationMinutes}m)`}
                          </p>
                        </div>
                      </div>
                    ))}
                    {hasSubmittedReport && (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-purple-100">
                          <FileText className="w-3 h-3 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Report Submitted</p>
                          <p className="text-xs text-slate-400">Today</p>
                        </div>
                      </div>
                    )}
                    {currentEnd && (
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 rounded-full bg-blue-100">
                          <LogOut className="w-3 h-3 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {isOpenShiftUser ? "Closed Shift" : "Clocked Out"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(currentEnd), "hh:mm a")}
                          </p>
                        </div>
                      </div>
                    )}
                    {!currentStart && breaks.length === 0 && (
                      <div className="text-center py-8">
                        <Circle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400">No activity yet</p>
                        <p className="text-xs text-slate-400 mt-1">Start your shift to begin tracking</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ============================================ */}
        {/* REPORT DIALOG - ONLY WORK DETAILS REQUIRED */}
        {/* ============================================ */}
        <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                {existingReportId ? "Edit Daily Report" : "Submit Daily Report"}
              </DialogTitle>
              <DialogDescription>
                {existingReportId
                  ? "Update your work summary for today."
                  : `Submit your report to unlock ${activeTab} shift ending.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Work Details - REQUIRED */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Work Details <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  placeholder="What did you work on today? Describe your tasks, progress, and achievements..."
                  className="min-h-[120px] resize-none"
                  value={reportContent}
                  onChange={(e) => setReportContent(e.target.value)}
                />
              </div>

              {/* Loom Video Link - OPTIONAL */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Video className="w-4 h-4 text-red-500" />
                  Loom Video Link
                  <span className="text-muted-foreground font-normal text-xs">(Optional)</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only valid Loom URLs are accepted
                </p>
                <Input
                  placeholder="https://www.loom.com/share/..."
                  value={loomLinks}
                  onChange={(e) => handleLoomLinkChange(e.target.value)}
                  onBlur={validateLoomLinkOnBlur}
                  className={cn(loomLinkError && "border-red-500 focus-visible:ring-red-500")}
                />
                {loomLinkError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {loomLinkError}
                  </p>
                )}
              </div>

              {/* References - OPTIONAL */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  References
                  <span className="text-muted-foreground font-normal text-xs ml-2">(Optional)</span>
                </Label>
                <Input
                  placeholder="Links to PRs, docs, designs, etc."
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                />
              </div>

              {/* Additional Notes - OPTIONAL */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Additional Notes
                  <span className="text-muted-foreground font-normal text-xs ml-2">(Optional)</span>
                </Label>
                <Textarea
                  placeholder="Any blockers, questions, or notes for tomorrow..."
                  className="min-h-[80px] resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={submitReport}
                disabled={isSubmittingReport || !isFormValid()}
                className="gap-2"
              >
                {isSubmittingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : existingReportId ? (
                  <FileCheck className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {existingReportId ? "Update Report" : "Submit Report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================ */}
        {/* END SHIFT CONFIRMATION DIALOG */}
        {/* ============================================ */}
        <Dialog open={endShiftDialogOpen} onOpenChange={setEndShiftDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogOut className="w-5 h-5 text-red-500" />
                {isOpenShiftUser ? "Close Shift" : `End ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Shift`}
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to end your {activeTab} shift? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Clock In</span>
                  <span className="font-medium">
                    {currentStart ? format(new Date(currentStart), "hh:mm a") : "--:--"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross Time</span>
                  <span className="font-medium">{formatDurationShort(grossWorkedSeconds)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Break Time</span>
                  <span className="font-medium">{formatDurationShort(totalBreakSeconds)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Net Working Time</span>
                  <span className="font-bold text-emerald-600">{formatDurationShort(netWorkedSeconds)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Report Status</span>
                  <span className="font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Submitted
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEndShiftDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={endShift}
                disabled={isEndingShift}
                className="gap-2"
              >
                {isEndingShift ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                {isOpenShiftUser ? "Close Shift" : "End Shift"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}