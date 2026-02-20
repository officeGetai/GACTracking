// client/src/pages/admin/dashboard.tsx
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Users,
  Clock,
  Search,
  Coffee,
  LogIn,
  LogOut,
  ChevronDown,
  ChevronUp,
  Bell,
  Timer,
  X,
  Phone,
  MessageSquare,
  Zap,
  Eye,
  MoreHorizontal,
  CheckCircle2,
  Sun,
  Moon,
  Code2,
  Megaphone,
  Palette,
  Activity,
  RefreshCw,
  AlertTriangle,
  XCircle,
  AlertCircle,
  Bug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Shift, SafeUser, Break } from "@shared/schema";

const LATE_THRESHOLD_MINUTES = 30;

// Department configurations
const DEPARTMENT_CONFIG: Record<string, { icon: any; gradient: string; bgGradient: string; color: string }> = {
  "Development": {
    icon: Code2,
    gradient: "from-violet-500 to-purple-600",
    bgGradient: "from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40",
    color: "violet"
  },
  "Business Development": {
    icon: Megaphone,
    gradient: "from-blue-500 to-cyan-500",
    bgGradient: "from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/40",
    color: "blue"
  },
  "Designing Team": {
    icon: Palette,
    gradient: "from-rose-500 to-pink-500",
    bgGradient: "from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40",
    color: "rose"
  },
};

interface ShiftWithBreaks extends Shift {
  breaks?: Break[];
}

type StatusType = "working" | "on_break" | "completed" | "not_started" | "late";

interface StatusInfo {
  type: StatusType;
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
  icon: any;
  borderColor: string;
}

interface LateEmployee {
  employee: SafeUser;
  shift: ShiftWithBreaks | null;
  lateMinutes: number;
  scheduledStart: string;
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
}

function getAvatarGradient(name: string) {
  const gradients = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-amber-500 to-orange-500",
    "from-indigo-500 to-blue-500",
  ];
  return gradients[(name?.charCodeAt(0) || 0) % gradients.length];
}

// Status configuration
const STATUS_CONFIG: Record<StatusType, StatusInfo> = {
  working: {
    type: "working",
    label: "Working",
    color: "text-emerald-700 dark:text-emerald-300",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/50",
    dotColor: "bg-emerald-500",
    icon: Zap,
    borderColor: "border-emerald-300 dark:border-emerald-700"
  },
  on_break: {
    type: "on_break",
    label: "On Break",
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-100 dark:bg-amber-900/50",
    dotColor: "bg-amber-500",
    icon: Coffee,
    borderColor: "border-amber-300 dark:border-amber-700"
  },
  completed: {
    type: "completed",
    label: "Completed",
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-100 dark:bg-blue-900/50",
    dotColor: "bg-blue-500",
    icon: CheckCircle2,
    borderColor: "border-blue-300 dark:border-blue-700"
  },
  not_started: {
    type: "not_started",
    label: "Not Started",
    color: "text-slate-600 dark:text-slate-400",
    bgColor: "bg-slate-100 dark:bg-slate-800",
    dotColor: "bg-slate-400",
    icon: Clock,
    borderColor: "border-slate-300 dark:border-slate-700"
  },
  late: {
    type: "late",
    label: "Late",
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-100 dark:bg-orange-900/50",
    dotColor: "bg-orange-500",
    icon: Timer,
    borderColor: "border-orange-300 dark:border-orange-700"
  }
};

// Simple and reliable status detection based on shift data
function getStatus(shift: ShiftWithBreaks | null): StatusInfo {
  if (!shift) {
    return STATUS_CONFIG.not_started;
  }

  // Check for active break first
  const hasActiveBreak = shift.breaks?.some(b => b.startTime && !b.endTime);
  if (hasActiveBreak) {
    return STATUS_CONFIG.on_break;
  }

  // Check if currently working (clocked in but not out)
  const isWorkingMorning = shift.morningClockIn && !shift.morningClockOut;
  const isWorkingEvening = shift.eveningClockIn && !shift.eveningClockOut;

  if (isWorkingMorning || isWorkingEvening) {
    return STATUS_CONFIG.working;
  }

  // Check if completed (has clocked out)
  if (shift.morningClockOut || shift.eveningClockOut) {
    return STATUS_CONFIG.completed;
  }

  // Has clocked in at some point (but now out)
  if (shift.morningClockIn || shift.eveningClockIn) {
    return STATUS_CONFIG.completed;
  }

  return STATUS_CONFIG.not_started;
}

// Check if employee is late
function checkIfLate(employee: SafeUser, shift: ShiftWithBreaks | null): LateEmployee | null {
  // If already clocked in, not late
  if (shift?.morningClockIn || shift?.eveningClockIn) {
    return null;
  }

  // Skip if employee has "open" shift type
  if (employee.shiftType === "open") {
    return null;
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;

  // Helper to parse time string
  const parseTime = (timeStr: string): { startMinutes: number; endMinutes: number } | null => {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return { startMinutes: hours * 60 + minutes, endMinutes: hours * 60 + minutes };
  };

  // Check morning shift
  const morningStart = employee.morningShiftStart || employee.shiftStartTime;
  const morningEnd = employee.morningShiftEnd || employee.shiftEndTime;

  if (morningStart && morningEnd) {
    const startParsed = parseTime(morningStart);
    const endParsed = parseTime(morningEnd);

    if (startParsed && endParsed) {
      const [endHour, endMinute] = morningEnd.split(":").map(Number);
      const shiftEndMinutes = endHour * 60 + endMinute;

      if (currentTotalMinutes > startParsed.startMinutes && currentTotalMinutes <= shiftEndMinutes) {
        const lateMinutes = currentTotalMinutes - startParsed.startMinutes;
        if (lateMinutes >= LATE_THRESHOLD_MINUTES) {
          return {
            employee,
            shift,
            lateMinutes,
            scheduledStart: morningStart
          };
        }
      }
    }
  }

  // Check evening shift (only if two_shifts type)
  if (employee.shiftType === "two_shifts" && employee.eveningShiftStart && employee.eveningShiftEnd) {
    const startParsed = parseTime(employee.eveningShiftStart);

    if (startParsed) {
      const [endHour, endMinute] = employee.eveningShiftEnd.split(":").map(Number);
      const shiftEndMinutes = endHour * 60 + endMinute;

      if (currentTotalMinutes > startParsed.startMinutes && currentTotalMinutes <= shiftEndMinutes) {
        const lateMinutes = currentTotalMinutes - startParsed.startMinutes;
        if (lateMinutes >= LATE_THRESHOLD_MINUTES) {
          return {
            employee,
            shift,
            lateMinutes,
            scheduledStart: employee.eveningShiftStart
          };
        }
      }
    }
  }

  return null;
}

function getWorkHours(shift: ShiftWithBreaks | null): { total: number; formatted: string } {
  if (!shift) return { total: 0, formatted: "—" };

  let totalMinutes = 0;

  if (shift.morningClockIn) {
    const start = new Date(shift.morningClockIn);
    const end = shift.morningClockOut ? new Date(shift.morningClockOut) : new Date();
    totalMinutes += Math.floor((end.getTime() - start.getTime()) / 60000);
  }

  if (shift.eveningClockIn) {
    const start = new Date(shift.eveningClockIn);
    const end = shift.eveningClockOut ? new Date(shift.eveningClockOut) : new Date();
    totalMinutes += Math.floor((end.getTime() - start.getTime()) / 60000);
  }

  // Subtract break time
  if (shift.breaks && shift.breaks.length > 0) {
    shift.breaks.forEach(breakItem => {
      if (breakItem.startTime) {
        const breakStart = new Date(breakItem.startTime);
        const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : new Date();
        totalMinutes -= Math.floor((breakEnd.getTime() - breakStart.getTime()) / 60000);
      }
    });
  }

  if (totalMinutes <= 0) return { total: 0, formatted: "—" };

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return { total: totalMinutes, formatted: `${hours}h ${mins}m` };
}

function formatTime(date: string | Date | null): string {
  if (!date) return "—";
  try {
    return format(new Date(date), "h:mm a");
  } catch {
    return "—";
  }
}

function formatLateTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Status Card Component
function StatusCard({
  icon: Icon,
  count,
  label,
  bgColor,
  iconColor,
  textColor,
  pulse = false
}: {
  icon: any;
  count: number;
  label: string;
  bgColor: string;
  iconColor: string;
  textColor: string;
  pulse?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 hover:scale-105",
      bgColor,
      pulse && count > 0 && "animate-pulse"
    )}>
      <Icon className={cn("h-4 w-4 mb-0.5", iconColor)} />
      <span className={cn("text-lg font-bold leading-none", textColor)}>{count}</span>
      <span className={cn("text-[9px] font-medium mt-0.5 opacity-80", textColor)}>{label}</span>
    </div>
  );
}

// Department Late Warning Banner
function DepartmentLateWarning({ lateEmployees }: { lateEmployees: LateEmployee[] }) {
  if (lateEmployees.length === 0) return null;

  return (
    <div className="mx-2 mt-2 p-3 rounded-xl bg-gradient-to-r from-orange-50 via-red-50 to-orange-50 dark:from-orange-950/40 dark:via-red-950/40 dark:to-orange-950/40 border border-orange-200/80 dark:border-orange-800/50 shadow-lg shadow-orange-500/10">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="relative">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
            <AlertTriangle className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        </div>
        <div>
          <span className="text-xs font-bold text-orange-800 dark:text-orange-200">
            {lateEmployees.length} Employee{lateEmployees.length > 1 ? 's' : ''} Running Late
          </span>
          <p className="text-[10px] text-orange-600 dark:text-orange-400">
            Haven't clocked in yet
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {lateEmployees.map((item) => (
          <div
            key={item.employee.id}
            className={cn(
              "flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg transition-all",
              item.lateMinutes >= 60
                ? "bg-red-100/80 dark:bg-red-900/40 border border-red-200 dark:border-red-800"
                : "bg-orange-100/60 dark:bg-orange-900/30 border border-orange-200/60 dark:border-orange-800/40"
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-[10px] shadow-sm",
                getAvatarGradient(item.employee.firstName)
              )}>
                {getInitials(item.employee.firstName, item.employee.lastName)}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                  {item.employee.firstName} {item.employee.lastName}
                </p>
                <p className="text-[9px] text-slate-500 dark:text-slate-400">
                  Scheduled: {item.scheduledStart}
                </p>
              </div>
            </div>
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
              item.lateMinutes >= 60 ? "bg-red-500 text-white" : "bg-orange-500 text-white"
            )}>
              <Timer className="h-3 w-3" />
              {formatLateTime(item.lateMinutes)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper to get per-period status label
function getPeriodStatus(clockIn: string | Date | null, clockOut: string | Date | null): string {
  if (!clockIn) return "Not Started";
  if (clockIn && !clockOut) return "Working";
  return "Completed";
}

function getPeriodStatusColor(clockIn: string | Date | null, clockOut: string | Date | null) {
  if (!clockIn) return { text: "text-slate-400 dark:text-slate-500", bg: "bg-slate-100 dark:bg-slate-700/50", dot: "bg-slate-400" };
  if (clockIn && !clockOut) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", dot: "bg-emerald-500" };
  return { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", dot: "bg-blue-500" };
}

// Shift Period Detail Row (for two-shift employees)
function ShiftPeriodDetail({
  label,
  icon: Icon,
  iconColor,
  clockIn,
  clockOut,
  breaks,
}: {
  label: string;
  icon: any;
  iconColor: string;
  clockIn: string | Date | null;
  clockOut: string | Date | null;
  breaks: any[];
}) {
  const periodStatus = getPeriodStatus(clockIn, clockOut);
  const colors = getPeriodStatusColor(clockIn, clockOut);
  const totalBreakMins = breaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

  let workMinutes = 0;
  if (clockIn) {
    const start = new Date(clockIn);
    const end = clockOut ? new Date(clockOut) : new Date();
    workMinutes = Math.floor((end.getTime() - start.getTime()) / 60000) - totalBreakMins;
    if (workMinutes < 0) workMinutes = 0;
  }
  const hours = Math.floor(workMinutes / 60);
  const mins = workMinutes % 60;

  return (
    <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-500">
      <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded font-bold", colors.bg, colors.text)}>
        <Icon className={cn("h-3 w-3", iconColor)} />
        {label}: {periodStatus}
      </span>
      {clockIn && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
          <LogIn className="h-2.5 w-2.5 text-emerald-500" />
          <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatTime(clockIn)}</span>
        </span>
      )}
      {clockOut && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30">
          <LogOut className="h-2.5 w-2.5 text-blue-500" />
          <span className="font-mono text-blue-700 dark:text-blue-300">{formatTime(clockOut)}</span>
        </span>
      )}
      {clockIn && workMinutes > 0 && (
        <span className="font-semibold text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/50">
          {hours}h {mins}m
        </span>
      )}
      {breaks.length > 0 && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
          <Coffee className="h-2.5 w-2.5 text-amber-500" />
          <span className="text-amber-700 dark:text-amber-300">{breaks.length}</span>
        </span>
      )}
    </div>
  );
}

// Employee Row
function EmployeeRow({
  employee,
  shift,
  lateInfo,
}: {
  employee: SafeUser;
  shift: ShiftWithBreaks | null;
  lateInfo: LateEmployee | null;
}) {
  const baseStatus = getStatus(shift);
  const status = lateInfo ? STATUS_CONFIG.late : baseStatus;
  const statusLabel = lateInfo ? `${formatLateTime(lateInfo.lateMinutes)} Late` : status.label;

  const workHours = getWorkHours(shift);
  const isTwoShift = employee.shiftType === "two_shifts";

  const isLate = !!lateInfo;
  const isWorking = status.type === "working";
  const isOnBreak = status.type === "on_break";
  const isCompleted = status.type === "completed";

  const StatusIcon = status.icon;

  const morningBreaks = shift?.breaks?.filter(b => b.shiftPeriod === "morning") || [];
  const eveningBreaks = shift?.breaks?.filter(b => b.shiftPeriod === "evening") || [];

  const getCardBackground = () => {
    if (isWorking) return "bg-gradient-to-r from-emerald-50 to-teal-50/50 dark:from-emerald-950/30 dark:to-teal-950/20 border-emerald-200/60 dark:border-emerald-800/40";
    if (isOnBreak) return "bg-gradient-to-r from-amber-50 to-yellow-50/50 dark:from-amber-950/30 dark:to-yellow-950/20 border-amber-200/60 dark:border-amber-800/40";
    if (isLate) return "bg-gradient-to-r from-orange-50 to-red-50/50 dark:from-orange-950/30 dark:to-red-950/20 border-orange-200/60 dark:border-orange-800/40";
    if (isCompleted) return "bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 border-blue-200/60 dark:border-blue-800/40";
    return "bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700";
  };

  return (
    <TooltipProvider>
      <div className={cn(
        "group relative flex items-center gap-3 p-3 rounded-xl transition-all duration-300",
        "border shadow-sm hover:shadow-lg",
        getCardBackground(),
        isWorking && "ring-1 ring-emerald-400/30",
        isOnBreak && "ring-1 ring-amber-400/30",
        isLate && "ring-1 ring-orange-400/30"
      )}>
        {/* Status Indicator Bar */}
        <div className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-full", status.dotColor)} />

        {/* Avatar */}
        <div className="relative flex-shrink-0 ml-1">
          <div className={cn(
            "h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-sm shadow-md",
            getAvatarGradient(employee.firstName)
          )}>
            {getInitials(employee.firstName, employee.lastName)}
          </div>
          <div className={cn(
            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900",
            status.bgColor
          )}>
            <StatusIcon className={cn("h-2.5 w-2.5", status.color)} />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {employee.firstName} {employee.lastName}
            </p>
          </div>

          {/* Overall Status Badge */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold",
              status.bgColor, status.color, "border", status.borderColor,
              isLate && "animate-pulse"
            )}>
              <StatusIcon className={cn("h-3 w-3", isWorking && "animate-pulse")} />
              {statusLabel}
            </div>
            {workHours.total > 0 && (
              <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/50">
                {workHours.formatted}
              </span>
            )}
          </div>

          {/* Two-shift details: show morning and evening separately */}
          {isTwoShift ? (
            <div className="space-y-1">
              <ShiftPeriodDetail
                label="Morning"
                icon={Sun}
                iconColor="text-amber-500"
                clockIn={shift?.morningClockIn || null}
                clockOut={shift?.morningClockOut || null}
                breaks={morningBreaks}
              />
              <ShiftPeriodDetail
                label="Evening"
                icon={Moon}
                iconColor="text-indigo-500"
                clockIn={shift?.eveningClockIn || null}
                clockOut={shift?.eveningClockOut || null}
                breaks={eveningBreaks}
              />
            </div>
          ) : (
            /* One-shift / open shift: single row of details */
            <div className="flex items-center flex-wrap gap-2 text-[10px] text-slate-500">
              {(employee.shiftStartTime || employee.morningShiftStart) && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/50">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">
                    {employee.shiftStartTime || employee.morningShiftStart}
                  </span>
                </span>
              )}
              {(shift?.morningClockIn || shift?.eveningClockIn) && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
                  <LogIn className="h-3 w-3 text-emerald-500" />
                  <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatTime(shift?.morningClockIn || shift?.eveningClockIn)}</span>
                </span>
              )}
              {(shift?.morningClockOut || shift?.eveningClockOut) && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30">
                  <LogOut className="h-3 w-3 text-blue-500" />
                  <span className="font-mono text-blue-700 dark:text-blue-300">{formatTime(shift?.morningClockOut || shift?.eveningClockOut)}</span>
                </span>
              )}
              {shift?.breaks && shift.breaks.length > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
                  <Coffee className="h-3 w-3 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-300">{shift.breaks.length}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="text-xs"><Eye className="h-3 w-3 mr-2" />View Details</DropdownMenuItem>
            <DropdownMenuItem className="text-xs"><Phone className="h-3 w-3 mr-2" />Call</DropdownMenuItem>
            <DropdownMenuItem className="text-xs"><MessageSquare className="h-3 w-3 mr-2" />Message</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );
}

// Department Column
function DepartmentColumn({
  name,
  employees,
  config,
}: {
  name: string;
  employees: { employee: SafeUser; shift: ShiftWithBreaks | null; lateInfo: LateEmployee | null }[];
  config: { icon: any; gradient: string; bgGradient: string; color: string };
}) {
  const Icon = config.icon;

  const stats = useMemo(() => {
    let working = 0, onBreak = 0, late = 0, completed = 0;
    employees.forEach(({ shift, lateInfo }) => {
      if (lateInfo) {
        late++;
      } else {
        const type = getStatus(shift).type;
        if (type === "working") working++;
        else if (type === "on_break") onBreak++;
        else if (type === "completed") completed++;
      }
    });
    return { working, onBreak, late, completed, total: employees.length };
  }, [employees]);

  const lateEmployees = useMemo(() => {
    return employees
      .filter(({ lateInfo }) => lateInfo !== null)
      .map(({ lateInfo }) => lateInfo!)
      .sort((a, b) => b.lateMinutes - a.lateMinutes);
  }, [employees]);

  const sortedEmployees = useMemo(() => {
    const getOrder = (item: typeof employees[0]) => {
      if (item.lateInfo) return 2;
      const type = getStatus(item.shift).type;
      if (type === "working") return 0;
      if (type === "on_break") return 1;
      if (type === "completed") return 3;
      return 4;
    };
    return [...employees].sort((a, b) => getOrder(a) - getOrder(b));
  }, [employees]);

  const workingPercent = stats.total > 0 ? Math.round(((stats.working + stats.onBreak) / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-xl shadow-slate-200/20 dark:shadow-black/20 overflow-hidden">
      {/* Header */}
      <div className={cn("p-4 bg-gradient-to-br border-b border-slate-200/60 dark:border-slate-800/60", config.bgGradient)}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl bg-gradient-to-br shadow-lg", config.gradient)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{name}</h3>
              <p className="text-xs text-slate-500">{stats.total} team members</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{workingPercent}%</p>
            <p className="text-[10px] text-slate-500 font-medium">Active Rate</p>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-4 gap-1.5">
          <StatusCard icon={Zap} count={stats.working} label="Working" bgColor="bg-emerald-100/80 dark:bg-emerald-900/60" iconColor="text-emerald-600 dark:text-emerald-400" textColor="text-emerald-700 dark:text-emerald-300" />
          <StatusCard icon={Coffee} count={stats.onBreak} label="Break" bgColor="bg-amber-100/80 dark:bg-amber-900/60" iconColor="text-amber-600 dark:text-amber-400" textColor="text-amber-700 dark:text-amber-300" />
          <StatusCard icon={CheckCircle2} count={stats.completed} label="Done" bgColor="bg-blue-100/80 dark:bg-blue-900/60" iconColor="text-blue-600 dark:text-blue-400" textColor="text-blue-700 dark:text-blue-300" />
          <StatusCard icon={Timer} count={stats.late} label="Late" bgColor="bg-orange-100/80 dark:bg-orange-900/60" iconColor="text-orange-600 dark:text-orange-400" textColor="text-orange-700 dark:text-orange-300" pulse={true} />
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="h-2 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden flex shadow-inner">
            {stats.working > 0 && (
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500" style={{ width: `${(stats.working / stats.total) * 100}%` }} />
            )}
            {stats.onBreak > 0 && (
              <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500" style={{ width: `${(stats.onBreak / stats.total) * 100}%` }} />
            )}
            {stats.completed > 0 && (
              <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500" style={{ width: `${(stats.completed / stats.total) * 100}%` }} />
            )}
            {stats.late > 0 && (
              <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500" style={{ width: `${(stats.late / stats.total) * 100}%` }} />
            )}
          </div>
        </div>
      </div>

      {/* Late Warning */}
      <DepartmentLateWarning lateEmployees={lateEmployees} />

      {/* Employee List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedEmployees.length > 0 ? (
            sortedEmployees.map(({ employee, shift, lateInfo }) => (
              <EmployeeRow key={employee.id} employee={employee} shift={shift} lateInfo={lateInfo} />
            ))
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No employees</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Global Late Alert Banner
function LateAlertBanner({ lateEmployees, onDismiss }: { lateEmployees: LateEmployee[]; onDismiss: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (lateEmployees.length === 0) return null;

  const criticalCount = lateEmployees.filter(e => e.lateMinutes >= 60).length;

  return (
    <div className="rounded-xl overflow-hidden shadow-xl bg-gradient-to-r from-orange-500 via-red-500 to-rose-500">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="px-4 py-2 flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-3 group">
            <Bell className="h-4 w-4 text-white animate-bounce" />
            <span className="text-sm font-bold text-white">{lateEmployees.length} Employees Late</span>
            {criticalCount > 0 && (
              <Badge className="bg-red-900/50 text-white border-0 text-[10px] px-1.5 py-0">{criticalCount} critical</Badge>
            )}
            {isExpanded ? <ChevronUp className="h-3 w-3 text-white/70" /> : <ChevronDown className="h-3 w-3 text-white/70" />}
          </CollapsibleTrigger>
          <Button size="icon" variant="ghost" onClick={onDismiss} className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/20">
            <X className="h-3 w-3" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="px-4 pb-3 grid grid-cols-3 md:grid-cols-6 gap-2">
            {lateEmployees.slice(0, 6).map((item) => (
              <div key={item.employee.id} className={cn(
                "flex items-center gap-2 p-2 rounded-lg backdrop-blur-sm",
                item.lateMinutes >= 60 ? "bg-red-900/40" : "bg-white/10"
              )}>
                <div className={cn(
                  "h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white font-bold text-[10px]",
                  getAvatarGradient(item.employee.firstName)
                )}>
                  {getInitials(item.employee.firstName, item.employee.lastName)}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">{item.employee.firstName}</p>
                  <p className="text-[10px] text-white/70">{formatLateTime(item.lateMinutes)} late</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Debug Panel Component
function DebugPanel({
  employees,
  shifts,
  shiftMap
}: {
  employees: SafeUser[];
  shifts: ShiftWithBreaks[];
  shiftMap: Map<string, ShiftWithBreaks>;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setShow(!show)}
        className="bg-yellow-100 border-yellow-300 text-yellow-800 text-xs gap-1"
      >
        <Bug className="h-3 w-3" />
        Debug ({shifts.length} shifts)
      </Button>

      {show && (
        <div className="absolute bottom-10 right-0 w-[500px] max-h-96 overflow-auto bg-white dark:bg-slate-900 border rounded-lg shadow-xl p-4 text-xs font-mono">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-sm">Debug Panel</h4>
            <Button size="sm" variant="ghost" onClick={() => setShow(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="mb-4 p-2 bg-blue-50 dark:bg-blue-950 rounded">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Summary</p>
            <p>Employees: {employees.length}</p>
            <p>Shifts Today: {shifts.length}</p>
            <p>ShiftMap Size: {shiftMap.size}</p>
          </div>

          <div className="mb-4">
            <p className="font-semibold text-emerald-600 mb-2">Employees ({employees.length}):</p>
            <div className="max-h-32 overflow-auto bg-slate-50 dark:bg-slate-800 rounded p-2">
              {employees.map(e => (
                <div key={e.id} className="text-slate-600 dark:text-slate-300 mb-1">
                  • {e.firstName} {e.lastName}
                  <span className="text-slate-400 ml-2">ID: "{e.id}"</span>
                  <span className="text-purple-500 ml-2">Dept: {e.department || "None"}</span>
                  <span className="text-blue-500 ml-2">
                    Shift: {shiftMap.has(String(e.id)) ? "✅ Found" : "❌ Not Found"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-semibold text-blue-600 mb-2">Today's Shifts ({shifts.length}):</p>
            {shifts.length === 0 ? (
              <p className="text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">No shifts found for today!</p>
            ) : (
              <div className="max-h-32 overflow-auto bg-slate-50 dark:bg-slate-800 rounded p-2">
                {shifts.map(s => (
                  <div key={s.id} className="text-slate-600 dark:text-slate-300 mb-1 border-b border-slate-200 dark:border-slate-700 pb-1">
                    <div>UserID: "{s.userId}" | Date: {s.date}</div>
                    <div className="text-xs">
                      Morning: {s.morningClockIn ? `In: ${formatTime(s.morningClockIn)}` : "Not clocked in"}
                      {s.morningClockOut && ` | Out: ${formatTime(s.morningClockOut)}`}
                    </div>
                    <div className="text-xs">
                      Evening: {s.eveningClockIn ? `In: ${formatTime(s.eveningClockIn)}` : "Not clocked in"}
                      {s.eveningClockOut && ` | Out: ${formatTime(s.eveningClockOut)}`}
                    </div>
                    <div className="text-xs text-purple-500">Breaks: {s.breaks?.length || 0}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 p-2 bg-amber-50 dark:bg-amber-950 rounded">
            <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">ID Type Check:</p>
            {employees.slice(0, 3).map(e => {
              const empIdStr = String(e.id);
              const foundShift = shiftMap.get(empIdStr);
              return (
                <div key={e.id} className="text-xs">
                  Employee "{e.firstName}": ID={e.id} (type: {typeof e.id})
                  {foundShift ? (
                    <span className="text-emerald-500 ml-2">→ Matched with shift userId: {foundShift.userId}</span>
                  ) : (
                    <span className="text-red-500 ml-2">→ No match in shiftMap</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Dashboard
export default function AdminDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedLateAlert, setDismissedLateAlert] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch employees
  const { data: allEmployees = [], isLoading: loadingEmployees, error: employeesError } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/employees"],
    select: (data) => data.filter(emp => emp.role === "employee" && emp.status === "active"),
  });

  // Fetch today's shifts
  const { data: todayShifts = [], isLoading: loadingShifts, error: shiftsError, refetch } = useQuery<ShiftWithBreaks[]>({
    queryKey: ["/api/admin/shifts/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Create shift map - CRITICAL: Convert all IDs to strings for consistent matching
  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftWithBreaks>();

    console.log(`[Dashboard] Creating shiftMap from ${todayShifts.length} shifts`);

    todayShifts.forEach(shift => {
      // Always use string keys for consistent matching
      const key = String(shift.userId);
      map.set(key, shift);
      console.log(`[Dashboard] Mapped shift: userId="${key}", morningIn=${!!shift.morningClockIn}, eveningIn=${!!shift.eveningClockIn}`);
    });

    return map;
  }, [todayShifts]);

  // Combine employees with their shifts and late info
  const employeesWithData = useMemo(() => {
    console.log(`[Dashboard] Processing ${allEmployees.length} employees with ${shiftMap.size} shifts in map`);

    return allEmployees.map(employee => {
      // Always use string keys for consistent matching
      const employeeId = String(employee.id);
      const shift = shiftMap.get(employeeId) || null;

      if (shift) {
        console.log(`[Dashboard] ✅ Found shift for ${employee.firstName} (ID: ${employeeId})`);
      } else {
        console.log(`[Dashboard] ❌ No shift for ${employee.firstName} (ID: ${employeeId})`);
      }

      const lateInfo = checkIfLate(employee, shift);

      return { employee, shift, lateInfo };
    });
  }, [allEmployees, shiftMap, currentTime]);

  // Filter by search
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employeesWithData;

    // Normalize query: lowercase and trim
    const query = searchQuery.toLowerCase().trim();

    // Split query terms for multi-word matching
    const queryTerms = query.split(/\s+/).filter(term => term.length > 0);

    return employeesWithData.filter(({ employee }) => {
      // Create a searchable string containing all relevant info
      const searchableText = `
        ${employee.firstName} 
        ${employee.lastName} 
        ${employee.username} 
        ${employee.department || ""} 
        ${employee.position || ""}
      `.toLowerCase();

      // Check if ALL terms are present in the searchable text (AND logic)
      return queryTerms.every(term => searchableText.includes(term));
    });
  }, [employeesWithData, searchQuery]);

  // Group by department
  const byDepartment = useMemo(() => {
    const groups: Record<string, typeof filteredEmployees> = {
      "Development": [],
      "Business Development": [],
      "Designing Team": [],
    };

    filteredEmployees.forEach(item => {
      const dept = item.employee.department || "Development";
      if (groups[dept]) {
        groups[dept].push(item);
      } else {
        // Fallback to Development if department not found
        groups["Development"].push(item);
      }
    });

    return groups;
  }, [filteredEmployees]);

  // All late employees
  const allLateEmployees = useMemo(() => {
    return employeesWithData
      .filter(({ lateInfo }) => lateInfo !== null)
      .map(({ lateInfo }) => lateInfo!)
      .sort((a, b) => b.lateMinutes - a.lateMinutes);
  }, [employeesWithData]);

  // Overall stats
  const stats = useMemo(() => {
    let working = 0, onBreak = 0, completed = 0, late = 0;
    employeesWithData.forEach(({ shift, lateInfo }) => {
      if (lateInfo) {
        late++;
      } else {
        const type = getStatus(shift).type;
        if (type === "working") working++;
        else if (type === "on_break") onBreak++;
        else if (type === "completed") completed++;
      }
    });
    return { total: allEmployees.length, working, onBreak, completed, late };
  }, [employeesWithData, allEmployees]);

  const isLoading = loadingEmployees || loadingShifts;

  // Show errors if any
  if (employeesError || shiftsError) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col items-center gap-3 text-center p-6">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Error Loading Dashboard</h2>
          <p className="text-sm text-slate-500 max-w-md">
            {(employeesError as Error)?.message || (shiftsError as Error)?.message || "Failed to load data"}
          </p>
          <Button onClick={() => refetch()} variant="outline" className="mt-2">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-violet-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900" />
            <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
          </div>
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-gradient-to-br from-slate-100 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
        {/* Header */}
        <div className="shrink-0 px-4 py-2.5 flex items-center gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-none">Staff Monitor</h1>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{format(currentTime, "EEEE, MMM d • h:mm:ss a")}</p>
            </div>
          </div>

          <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 text-[10px] gap-1 px-2 py-0.5 shadow-lg shadow-emerald-500/25">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            Live
          </Badge>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg"
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-xs">Refresh</span>
          </Button>

          {/* Stats Summary */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/80">
            <div className="flex items-center gap-1 pr-2 border-r border-slate-300 dark:border-slate-600">
              <Users className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1 px-2 border-r border-slate-300 dark:border-slate-600">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-600">{stats.working}</span>
            </div>
            <div className="flex items-center gap-1 px-2 border-r border-slate-300 dark:border-slate-600">
              <Coffee className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-bold text-amber-600">{stats.onBreak}</span>
            </div>
            <div className="flex items-center gap-1 px-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-bold text-blue-600">{stats.completed}</span>
            </div>
            {stats.late > 0 && (
              <div className="flex items-center gap-1 px-2 ml-1 rounded-lg bg-orange-100 dark:bg-orange-900/50 animate-pulse">
                <Timer className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs font-bold text-orange-600">{stats.late}</span>
              </div>
            )}
          </div>

          {allLateEmployees.length > 0 && dismissedLateAlert && (
            <Button size="sm" onClick={() => setDismissedLateAlert(false)} className="h-7 text-[10px] bg-gradient-to-r from-orange-500 to-red-500 text-white gap-1.5">
              <Bell className="h-3 w-3 animate-bounce" />
              {allLateEmployees.length} Late
            </Button>
          )}
        </div>

        {/* Scrollable Content Area */}
        <ScrollArea className="flex-1 h-full">
          <div className="flex flex-col min-h-[850px] p-4">
            {/* Late Alert */}
            {!dismissedLateAlert && allLateEmployees.length > 0 && (
              <div className="shrink-0 mb-4">
                <LateAlertBanner lateEmployees={allLateEmployees} onDismiss={() => setDismissedLateAlert(true)} />
              </div>
            )}

            {/* Main Content Info */}
            <div className="flex-1 overflow-x-auto pb-2">
              <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4 min-w-[1024px] lg:min-w-0">
                <DepartmentColumn name="Development" employees={byDepartment["Development"]} config={DEPARTMENT_CONFIG["Development"]} />
                <DepartmentColumn name="Business Development" employees={byDepartment["Business Development"]} config={DEPARTMENT_CONFIG["Business Development"]} />
                <DepartmentColumn name="Designing Team" employees={byDepartment["Designing Team"]} config={DEPARTMENT_CONFIG["Designing Team"]} />
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Debug Panel */}
        <DebugPanel employees={allEmployees} shifts={todayShifts} shiftMap={shiftMap} />
      </div>
    </TooltipProvider>
  );
}