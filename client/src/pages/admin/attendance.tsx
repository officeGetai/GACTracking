// client/src/pages/admin/attendance.tsx
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isFuture,
  getDay,
  subMonths,
  addMonths,
  isSunday,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Building2,
  Code2,
  Megaphone,
  Palette,
  RefreshCw,
  LogIn,
  LogOut,
  Coffee,
  Timer,
  Zap,
  Sun,
  Moon,
  TrendingUp,
  TrendingDown,
  User,
  ChevronDown,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Award,
  Flame,
  Calendar,
  FileText,
  ArrowRight,
  Minus,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SafeUser, Shift, Break } from "@shared/schema";

// Types
interface ShiftWithBreaks extends Shift {
  breaks?: Break[];
}

interface DayRecord {
  date: Date;
  dateStr: string;
  shift: ShiftWithBreaks | null;
  status: "present" | "absent" | "late" | "weekend" | "future" | "half_day";
  morningIn: string | null;
  morningOut: string | null;
  eveningIn: string | null;
  eveningOut: string | null;
  lateMinutes: number;
  workMinutes: number;
  breakCount: number;
  breakMinutes: number;
}

interface MonthlyStats {
  totalWorkDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  totalLateMinutes: number;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  attendanceRate: number;
  avgWorkHoursPerDay: number;
  longestStreak: number;
  currentStreak: number;
}

// Department config
const DEPARTMENT_CONFIG: Record<string, { icon: any; gradient: string; color: string }> = {
  "Development": { icon: Code2, gradient: "from-violet-500 to-purple-600", color: "violet" },
  "Business Development": { icon: Megaphone, gradient: "from-blue-500 to-cyan-500", color: "blue" },
  "Designing Team": { icon: Palette, gradient: "from-rose-500 to-pink-500", color: "rose" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Helpers
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
  ];
  return gradients[(name?.charCodeAt(0) || 0) % gradients.length];
}

// Format time in Pakistan timezone (Asia/Karachi)
function formatTime(date: string | Date | null): string {
  if (!date) return "—";
  try {
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

// Get current date in Pakistan timezone (YYYY-MM-DD format)
function getTodayInPakistan(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
}

// Check if a date string matches today in Pakistan timezone
function isDateTodayInPakistan(dateStr: string): boolean {
  return dateStr === getTodayInPakistan();
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1) + "h";
}

function calculateWorkMinutes(shift: ShiftWithBreaks | null): number {
  if (!shift) return 0;
  let total = 0;

  if (shift.morningClockIn) {
    const start = new Date(shift.morningClockIn);
    const end = shift.morningClockOut ? new Date(shift.morningClockOut) : new Date();
    total += Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  }

  if (shift.eveningClockIn) {
    const start = new Date(shift.eveningClockIn);
    const end = shift.eveningClockOut ? new Date(shift.eveningClockOut) : new Date();
    total += Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  }

  return total;
}

function calculateBreakMinutes(shift: ShiftWithBreaks | null): number {
  if (!shift?.breaks) return 0;
  return shift.breaks.reduce((acc, b) => {
    if (b.startTime) {
      const start = new Date(b.startTime);
      const end = b.endTime ? new Date(b.endTime) : new Date();
      return acc + Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
    }
    return acc;
  }, 0);
}

function getDayStatus(shift: ShiftWithBreaks | null, date: Date): DayRecord["status"] {
  if (isFuture(date)) return "future";
  if (isSunday(date)) return "weekend";
  
  // No shift = absent
  if (!shift) return "absent";
  
  // Check if there are any actual clock-ins
  const hasMorningClockIn = !!shift.morningClockIn;
  const hasEveningClockIn = !!shift.eveningClockIn;
  
  // If no clock-ins at all, check if marked absent or just not started
  if (!hasMorningClockIn && !hasEveningClockIn) {
    return "absent";
  }
  
  // If there's at least one clock-in, employee is present (or half day)
  const lateMinutes = (shift.morningLateMinutes || 0) + (shift.eveningLateMinutes || 0);
  if (lateMinutes > 0) return "late";

  // Check for half day (only morning or only evening)
  if ((hasMorningClockIn && !hasEveningClockIn) || (!hasMorningClockIn && hasEveningClockIn)) {
    return "half_day";
  }

  return "present";
}

// Generate month options (last 12 months)
function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(now, i);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
      year: date.getFullYear(),
      month: date.getMonth(),
    });
  }
  return options;
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color,
  gradient,
  size = "normal",
}: {
  icon: any;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  gradient: string;
  size?: "normal" | "large";
}) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-4",
      "bg-gradient-to-br shadow-lg",
      gradient,
      size === "large" && "p-5"
    )}>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
            <Icon className={cn("text-white", size === "large" ? "h-5 w-5" : "h-4 w-4")} />
          </div>
        </div>
        <p className={cn(
          "font-bold text-white",
          size === "large" ? "text-3xl" : "text-2xl"
        )}>{value}</p>
        <p className="text-xs text-white/80 mt-0.5">{label}</p>
        {subValue && (
          <p className="text-[10px] text-white/60 mt-1">{subValue}</p>
        )}
      </div>
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
      <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-white/5" />
    </div>
  );
}

// Mini Stat Row
function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded-lg", color)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}

// Calendar Day Cell
function DayCell({
  record,
  isSelected,
  onClick,
}: {
  record: DayRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  const dayNum = format(record.date, "d");
  const isToday = isDateTodayInPakistan(record.dateStr);

  const getBgColor = () => {
    switch (record.status) {
      case "present": return "bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700";
      case "late": return "bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700";
      case "absent": return "bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700";
      case "half_day": return "bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700";
      case "weekend": return "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700";
      case "future": return "bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800";
      default: return "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700";
    }
  };

  const getIndicator = () => {
    switch (record.status) {
      case "present": return <CheckCircle2 className="h-3 w-3 text-emerald-600" />;
      case "late": return <AlertTriangle className="h-3 w-3 text-orange-600" />;
      case "absent": return <XCircle className="h-3 w-3 text-red-600" />;
      case "half_day": return <Minus className="h-3 w-3 text-amber-600" />;
      default: return null;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            disabled={record.status === "future"}
            className={cn(
              "relative flex flex-col items-center justify-center p-1.5 rounded-lg border transition-all",
              "hover-elevate disabled:opacity-40 disabled:cursor-not-allowed",
              getBgColor(),
              isToday && "ring-2 ring-primary ring-offset-1",
              isSelected && "ring-2 ring-violet-500 ring-offset-1"
            )}
            style={{ aspectRatio: "1" }}
          >
            <span className={cn(
              "text-sm font-bold",
              record.status === "weekend" ? "text-slate-400" : "text-slate-700 dark:text-slate-200"
            )}>
              {dayNum}
            </span>
            {record.status !== "weekend" && record.status !== "future" && (
              <div className="mt-0.5">
                {getIndicator()}
              </div>
            )}
            {record.lateMinutes > 0 && (
              <span className="text-[8px] text-orange-600 font-medium">
                {record.lateMinutes}m
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-3">
          <div className="space-y-1.5">
            <p className="font-semibold">{format(record.date, "EEEE, MMMM d")}</p>
            {record.status !== "weekend" && record.status !== "future" && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <Badge className={cn(
                    "text-[10px]",
                    record.status === "present" && "bg-emerald-500",
                    record.status === "late" && "bg-orange-500",
                    record.status === "absent" && "bg-red-500",
                  )}>
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </Badge>
                </div>
                {record.shift && (
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                    <div>🌅 In: {formatTime(record.morningIn)}</div>
                    <div>🌅 Out: {formatTime(record.morningOut)}</div>
                    <div>🌙 In: {formatTime(record.eveningIn)}</div>
                    <div>🌙 Out: {formatTime(record.eveningOut)}</div>
                  </div>
                )}
                <div className="flex gap-3 text-[11px] pt-1 border-t">
                  <span>⏱ {formatDuration(record.workMinutes)}</span>
                  {record.lateMinutes > 0 && <span className="text-orange-600">⏰ {record.lateMinutes}m late</span>}
                  {record.breakCount > 0 && <span>☕ {record.breakCount} breaks</span>}
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to extract time from datetime
function extractTimeValue(datetime: string | null): string {
  if (!datetime) return "";
  try {
    return format(new Date(datetime), "HH:mm");
  } catch {
    return "";
  }
}

// Calculate required shift hours in minutes for overtime calculation
// On Saturday (half day), required hours are capped at 5 hours (300 minutes)
function calculateRequiredMinutes(user: SafeUser | null, date?: Date): number {
  const isSaturdayDay = date ? date.getDay() === 6 : false;
  const saturdayMax = 5 * 60; // 300 minutes = 5 hours

  if (!user) {
    return isSaturdayDay ? saturdayMax : 8 * 60;
  }
  
  if (user.shiftType === "open_shift") {
    const normal = parseFloat(user.openShiftRequiredHours || "8") * 60;
    return isSaturdayDay ? Math.min(normal, saturdayMax) : normal;
  }
  
  if (user.shiftType === "one_shift" && user.shiftStartTime && user.shiftEndTime) {
    const start = new Date(`1970-01-01T${user.shiftStartTime}`);
    const end = new Date(`1970-01-01T${user.shiftEndTime}`);
    let diff = (end.getTime() - start.getTime()) / 60000;
    if (diff < 0) diff += 24 * 60;
    return isSaturdayDay ? Math.min(diff, saturdayMax) : diff;
  }
  
  if (user.shiftType === "two_shifts") {
    let total = 0;
    if (user.morningShiftStart && user.morningShiftEnd) {
      const start = new Date(`1970-01-01T${user.morningShiftStart}`);
      const end = new Date(`1970-01-01T${user.morningShiftEnd}`);
      let diff = (end.getTime() - start.getTime()) / 60000;
      if (diff < 0) diff += 24 * 60;
      if (diff > 0) total += diff;
    }
    if (user.eveningShiftStart && user.eveningShiftEnd) {
      const start = new Date(`1970-01-01T${user.eveningShiftStart}`);
      const end = new Date(`1970-01-01T${user.eveningShiftEnd}`);
      let diff = (end.getTime() - start.getTime()) / 60000;
      if (diff < 0) diff += 24 * 60;
      if (diff > 0) total += diff;
    }
    const result = total > 0 ? total : 8 * 60;
    return isSaturdayDay ? Math.min(result, saturdayMax) : result;
  }
  
  return isSaturdayDay ? saturdayMax : 8 * 60;
}

// Day Detail Panel
interface DayDetailPanelProps {
  record: DayRecord | null;
  onEdit?: (shiftId: string, data: any) => void;
  onDelete?: (shiftId: string) => void;
  isEditing?: boolean;
  isSaving?: boolean;
  employee?: SafeUser | null;
}

function DayDetailPanel({ record, onEdit, onDelete, isEditing, isSaving, employee }: DayDetailPanelProps) {
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editValues, setEditValues] = useState({
    morningClockIn: "",
    morningClockOut: "",
    eveningClockIn: "",
    eveningClockOut: "",
  });

  // Reset edit mode when record changes
  useEffect(() => {
    if (record?.shift) {
      setEditValues({
        morningClockIn: extractTimeValue(record.morningIn),
        morningClockOut: extractTimeValue(record.morningOut),
        eveningClockIn: extractTimeValue(record.eveningIn),
        eveningClockOut: extractTimeValue(record.eveningOut),
      });
    }
    setEditMode(false);
  }, [record?.dateStr]);

  if (!record || record.status === "weekend" || record.status === "future") {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        <div className="text-center">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a day to view details</p>
        </div>
      </div>
    );
  }

  const netWorkMinutes = record.workMinutes - record.breakMinutes;
  
  // Calculate overtime: Net Work Minutes - Required Minutes (only positive = overtime)
  const requiredMinutes = calculateRequiredMinutes(employee ?? null, record.date);
  const overtimeMinutes = netWorkMinutes > requiredMinutes ? netWorkMinutes - requiredMinutes : 0;

  const handleSave = () => {
    if (!record.shift?.id || !onEdit) return;
    
    // Helper to build full datetime from date + time
    const buildDateTime = (timeStr: string) => {
      if (!timeStr || timeStr.trim() === "") return null;
      const [hours, minutes] = timeStr.split(":").map(Number);
      const date = new Date(record.date);
      date.setHours(hours, minutes, 0, 0);
      return date.toISOString();
    };

    // Always send all fields explicitly - null to clear, value to set
    const updateData: any = {
      morningClockIn: buildDateTime(editValues.morningClockIn),
      morningClockOut: buildDateTime(editValues.morningClockOut),
      eveningClockIn: buildDateTime(editValues.eveningClockIn),
      eveningClockOut: buildDateTime(editValues.eveningClockOut),
    };

    console.log("Saving shift update:", record.shift.id, updateData);
    onEdit(record.shift.id, updateData);
    setEditMode(false);
  };

  const handleDelete = () => {
    if (!record.shift?.id || !onDelete) return;
    onDelete(record.shift.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-slate-900 dark:text-white">
          {format(record.date, "EEEE, MMMM d")}
        </h4>
        <div className="flex items-center gap-2">
          <Badge className={cn(
            record.status === "present" && "bg-emerald-500",
            record.status === "late" && "bg-orange-500",
            record.status === "absent" && "bg-red-500",
          )}>
            {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
          </Badge>
          {record.shift && onEdit && !editMode && (
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7"
              onClick={() => setEditMode(true)}
              data-testid="button-edit-shift"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {record.shift && onDelete && !editMode && (
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-7 w-7"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="button-delete-shift"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {record.status !== "absent" && (
        <>
          {editMode ? (
            <div className="space-y-4">
              {/* Morning Shift Edit */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-3">
                  <Sun className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Morning Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Clock In</Label>
                    <Input
                      type="time"
                      value={editValues.morningClockIn}
                      onChange={(e) => setEditValues(prev => ({ ...prev, morningClockIn: e.target.value }))}
                      className="h-8"
                      data-testid="input-morning-clock-in"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Clock Out</Label>
                    <Input
                      type="time"
                      value={editValues.morningClockOut}
                      onChange={(e) => setEditValues(prev => ({ ...prev, morningClockOut: e.target.value }))}
                      className="h-8"
                      data-testid="input-morning-clock-out"
                    />
                  </div>
                </div>
              </div>

              {/* Evening Shift Edit */}
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-center gap-2 mb-3">
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Evening Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Clock In</Label>
                    <Input
                      type="time"
                      value={editValues.eveningClockIn}
                      onChange={(e) => setEditValues(prev => ({ ...prev, eveningClockIn: e.target.value }))}
                      className="h-8"
                      data-testid="input-evening-clock-in"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Clock Out</Label>
                    <Input
                      type="time"
                      value={editValues.eveningClockOut}
                      onChange={(e) => setEditValues(prev => ({ ...prev, eveningClockOut: e.target.value }))}
                      className="h-8"
                      data-testid="input-evening-clock-out"
                    />
                  </div>
                </div>
              </div>

              {/* Edit Actions */}
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="button-save-shift"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setEditMode(false)}
                  disabled={isSaving}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Morning Shift */}
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2 mb-2">
                  <Sun className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Morning Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <LogIn className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-slate-600 dark:text-slate-400">In:</span>
                    <span className="font-mono font-medium">{formatTime(record.morningIn)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LogOut className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-slate-600 dark:text-slate-400">Out:</span>
                    <span className="font-mono font-medium">{formatTime(record.morningOut)}</span>
                  </div>
                </div>
              </div>

              {/* Evening Shift */}
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Evening Shift</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <LogIn className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-slate-600 dark:text-slate-400">In:</span>
                    <span className="font-mono font-medium">{formatTime(record.eveningIn)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LogOut className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-slate-600 dark:text-slate-400">Out:</span>
                    <span className="font-mono font-medium">{formatTime(record.eveningOut)}</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center">
                  <Timer className="h-4 w-4 mx-auto text-slate-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDuration(netWorkMinutes)}</p>
                  <p className="text-[10px] text-slate-500">Net Work</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center">
                  <Coffee className="h-4 w-4 mx-auto text-amber-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{record.breakCount}</p>
                  <p className="text-[10px] text-slate-500">Breaks</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-center">
                  <AlertTriangle className="h-4 w-4 mx-auto text-orange-500 mb-1" />
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{record.lateMinutes}m</p>
                  <p className="text-[10px] text-slate-500">Late</p>
                </div>
                <div className={cn(
                  "p-2 rounded-lg text-center",
                  overtimeMinutes > 0 
                    ? "bg-purple-100 dark:bg-purple-950/50" 
                    : "bg-slate-100 dark:bg-slate-800"
                )}>
                  <Zap className={cn("h-4 w-4 mx-auto mb-1", overtimeMinutes > 0 ? "text-purple-600" : "text-slate-400")} />
                  <p className={cn(
                    "text-sm font-bold",
                    overtimeMinutes > 0 ? "text-purple-700 dark:text-purple-300" : "text-slate-400 dark:text-slate-500"
                  )} data-testid="text-overtime-admin">
                    {overtimeMinutes > 0 ? formatDuration(overtimeMinutes) : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">Overtime</p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {record.status === "absent" && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-center">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          {record.shift?.status === "absent" ? (
            <>
              <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                Marked as Absent
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">
                {record.shift.notes || "Auto-marked due to no clock-in"}
              </p>
              {onDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-absent"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Remove Absent Record
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">No attendance record for this day</p>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {record.shift?.status === "absent" ? "Remove Absent Record" : "Delete Shift Record"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {record.shift?.status === "absent" ? (
                <>
                  Are you sure you want to remove the absent record for {format(record.date, "MMMM d, yyyy")}?
                  <br /><br />
                  This will allow the employee to clock in for this day.
                </>
              ) : (
                <>
                  Are you sure you want to delete this shift record for {format(record.date, "MMMM d, yyyy")}? 
                  This action cannot be undone and will remove all clock in/out times and associated data.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {record.shift?.status === "absent" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Attendance Bar Chart (simple horizontal bars)
function AttendanceBarChart({ stats }: { stats: MonthlyStats }) {
  const total = stats.totalWorkDays;
  if (total === 0) return null;

  const data = [
    { label: "Present", value: stats.presentDays - stats.lateDays, color: "bg-emerald-500", percent: ((stats.presentDays - stats.lateDays) / total) * 100 },
    { label: "Late", value: stats.lateDays, color: "bg-orange-500", percent: (stats.lateDays / total) * 100 },
    { label: "Absent", value: stats.absentDays, color: "bg-red-500", percent: (stats.absentDays / total) * 100 },
  ];

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
            <span className="font-bold text-slate-900 dark:text-white">{item.value} days</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", item.color)}
              style={{ width: `${item.percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Component
export default function AttendancePage() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedDayRecord, setSelectedDayRecord] = useState<DayRecord | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const monthOptions = getMonthOptions();

  // Parse selected month
  const [year, month] = selectedMonth.split("-").map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Fetch employees
  const { data: employees = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/employees");
      return res.json();
    },
    select: (data) => data.filter(emp => emp.role === "employee" && emp.status === "active"),
  });

  // Filter employees by department
  const filteredEmployees = useMemo(() => {
    if (selectedDepartment === "all") return employees;
    return employees.filter(e => e.department === selectedDepartment);
  }, [employees, selectedDepartment]);

  // Selected employee
  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  // Fetch shifts for all days in the month for selected employee
  const { data: monthShifts = [], isLoading, refetch } = useQuery<ShiftWithBreaks[]>({
    queryKey: ["/api/admin/employee-shifts", selectedEmployeeId, selectedMonth],
    queryFn: async () => {
      if (!selectedEmployeeId) return [];

      const shifts: ShiftWithBreaks[] = [];

      // Fetch shifts for each day in the month
      for (const day of daysInMonth) {
        if (isFuture(day)) continue;

        try {
          const dateStr = format(day, "yyyy-MM-dd");
          const res = await apiRequest("GET", `/api/admin/shifts?date=${dateStr}`);
          const data = await res.json();
          const dayShifts = Array.isArray(data) ? data : data.shifts || [];

          // Find shift for selected employee
          const employeeShift = dayShifts.find((s: any) => String(s.userId) === selectedEmployeeId);
          if (employeeShift) {
            shifts.push(employeeShift);
          }
        } catch (e) {
          console.error("Error fetching shifts for day:", day, e);
        }
      }

      return shifts;
    },
    enabled: !!selectedEmployeeId,
    staleTime: 60000,
  });

  // Edit shift mutation
  const editShiftMutation = useMutation({
    mutationFn: async ({ shiftId, data }: { shiftId: string; data: any }) => {
      console.log("[editShiftMutation] Sending PATCH to /api/admin/shifts/" + shiftId, data);
      const res = await apiRequest("PATCH", `/api/admin/shifts/${shiftId}`, data);
      const result = await res.json();
      console.log("[editShiftMutation] Response:", result);
      return result;
    },
    onSuccess: (data) => {
      console.log("[editShiftMutation] Success:", data);
      toast({ title: "Success", description: "Shift record updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employee-shifts", selectedEmployeeId, selectedMonth] });
      setSelectedDayRecord(null);
    },
    onError: (error: any) => {
      console.error("[editShiftMutation] Error:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update shift record", 
        variant: "destructive" 
      });
    },
  });

  // Delete shift mutation (for regular shifts)
  const deleteShiftMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/shifts/${shiftId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Shift record deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employee-shifts", selectedEmployeeId, selectedMonth] });
      setSelectedDayRecord(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete shift record", 
        variant: "destructive" 
      });
    },
  });

  // Delete absent record mutation (for absent-only records)
  const deleteAbsentMutation = useMutation({
    mutationFn: async (shiftId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/shifts/${shiftId}/absent`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "Absent record removed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/employee-shifts", selectedEmployeeId, selectedMonth] });
      setSelectedDayRecord(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to remove absent record", 
        variant: "destructive" 
      });
    },
  });

  // Handler functions for edit and delete
  const handleEditShift = (shiftId: string, data: any) => {
    console.log("[handleEditShift] Called with shiftId:", shiftId, "data:", data);
    console.log("[handleEditShift] Calling mutation.mutate now...");
    editShiftMutation.mutate({ shiftId, data });
    console.log("[handleEditShift] Mutation.mutate called");
  };

  const handleDeleteShift = (shiftId: string) => {
    // Check if this is an absent record to use the correct endpoint
    const shift = selectedDayRecord?.shift;
    if (shift?.status === "absent") {
      deleteAbsentMutation.mutate(shiftId);
    } else {
      deleteShiftMutation.mutate(shiftId);
    }
  };

  // Create shift map by date
  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftWithBreaks>();
    monthShifts.forEach(s => {
      if (s.date) map.set(s.date, s);
    });
    return map;
  }, [monthShifts]);

  // Generate day records
  const dayRecords = useMemo((): DayRecord[] => {
    return daysInMonth.map(date => {
      const dateStr = format(date, "yyyy-MM-dd");
      const shift = shiftMap.get(dateStr) || null;
      const status = getDayStatus(shift, date);
      const lateMinutes = (shift?.morningLateMinutes || 0) + (shift?.eveningLateMinutes || 0);
      const workMinutes = calculateWorkMinutes(shift);
      const breakMinutes = calculateBreakMinutes(shift);

      return {
        date,
        dateStr,
        shift,
        status,
        morningIn: shift?.morningClockIn ? String(shift.morningClockIn) : null,
        morningOut: shift?.morningClockOut ? String(shift.morningClockOut) : null,
        eveningIn: shift?.eveningClockIn ? String(shift.eveningClockIn) : null,
        eveningOut: shift?.eveningClockOut ? String(shift.eveningClockOut) : null,
        lateMinutes,
        workMinutes,
        breakCount: shift?.breaks?.length || 0,
        breakMinutes,
      };
    });
  }, [daysInMonth, shiftMap]);

  // Calculate monthly stats
  const monthlyStats = useMemo((): MonthlyStats => {
    const workDayRecords = dayRecords.filter(r => r.status !== "weekend" && r.status !== "future");
    const presentRecords = workDayRecords.filter(r => r.status === "present" || r.status === "late");
    const lateRecords = workDayRecords.filter(r => r.status === "late");
    const absentRecords = workDayRecords.filter(r => r.status === "absent");

    const totalLateMinutes = dayRecords.reduce((acc, r) => acc + r.lateMinutes, 0);
    const totalWorkMinutes = dayRecords.reduce((acc, r) => acc + r.workMinutes, 0);
    const totalBreakMinutes = dayRecords.reduce((acc, r) => acc + r.breakMinutes, 0);

    // Calculate streaks
    let longestStreak = 0;
    let currentStreak = 0;
    let tempStreak = 0;

    workDayRecords.forEach(r => {
      if (r.status === "present" || r.status === "late") {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    });

    // Current streak (count backwards from most recent work day)
    for (let i = workDayRecords.length - 1; i >= 0; i--) {
      if (workDayRecords[i].status === "present" || workDayRecords[i].status === "late") {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      totalWorkDays: workDayRecords.length,
      presentDays: presentRecords.length,
      absentDays: absentRecords.length,
      lateDays: lateRecords.length,
      halfDays: 0,
      totalLateMinutes,
      totalWorkMinutes,
      totalBreakMinutes,
      attendanceRate: workDayRecords.length > 0 ? Math.round((presentRecords.length / workDayRecords.length) * 100) : 0,
      avgWorkHoursPerDay: presentRecords.length > 0 ? totalWorkMinutes / presentRecords.length / 60 : 0,
      longestStreak,
      currentStreak,
    };
  }, [dayRecords]);

  // Build calendar grid
  const calendarWeeks = useMemo(() => {
    const weeks: DayRecord[][] = [];
    const firstDayOfWeek = getDay(monthStart);

    // Add empty slots for days before month start
    let currentWeek: DayRecord[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null as any);
    }

    dayRecords.forEach((record, index) => {
      currentWeek.push(record);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    // Fill remaining days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null as any);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [dayRecords, monthStart]);

  // Export handler
  const handleExport = () => {
    if (!selectedEmployee) return;

    const headers = ["Date", "Day", "Status", "Morning In", "Morning Out", "Evening In", "Evening Out", "Late (min)", "Work Hours", "Breaks"];
    const rows = dayRecords
      .filter(r => r.status !== "weekend" && r.status !== "future")
      .map(r => [
        r.dateStr,
        format(r.date, "EEE"),
        r.status,
        formatTime(r.morningIn),
        formatTime(r.morningOut),
        formatTime(r.eveningIn),
        formatTime(r.eveningOut),
        r.lateMinutes,
        formatDuration(r.workMinutes),
        r.breakCount,
      ]);

    // Add summary
    rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Total Work Days", monthlyStats.totalWorkDays]);
    rows.push(["Present Days", monthlyStats.presentDays]);
    rows.push(["Absent Days", monthlyStats.absentDays]);
    rows.push(["Late Days", monthlyStats.lateDays]);
    rows.push(["Total Late", formatDuration(monthlyStats.totalLateMinutes)]);
    rows.push(["Total Work Hours", formatHours(monthlyStats.totalWorkMinutes)]);
    rows.push(["Attendance Rate", monthlyStats.attendanceRate + "%"]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${selectedEmployee.firstName}-${selectedEmployee.lastName}-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Exported", description: `Attendance report for ${selectedEmployee.firstName}` });
  };

  // Reset employee when department changes
  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setSelectedEmployeeId("");
    setSelectedDayRecord(null);
  };

  // Reset day record when employee changes
  const handleEmployeeChange = (value: string) => {
    setSelectedEmployeeId(value);
    setSelectedDayRecord(null);
  };

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950 overflow-hidden">
        {/* Header with Filters */}
        <div className="shrink-0 px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Month Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Month</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px] bg-white dark:bg-slate-800 shadow-sm">
                  <CalendarIcon className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Department</label>
              <Select value={selectedDepartment} onValueChange={handleDepartmentChange}>
                <SelectTrigger className="w-[200px] bg-white dark:bg-slate-800 shadow-sm">
                  <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {Object.keys(DEPARTMENT_CONFIG).map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Employee Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Employee</label>
              <Select value={selectedEmployeeId} onValueChange={handleEmployeeChange}>
                <SelectTrigger className="w-[220px] bg-white dark:bg-slate-800 shadow-sm">
                  <User className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {filteredEmployees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            {selectedEmployeeId && (
              <>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
                <Button variant="default" size="sm" onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export Report
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-hidden">
          {!selectedEmployeeId ? (
            // Empty State
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <Users className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  Select an Employee
                </h2>
                <p className="text-slate-500 mb-6">
                  Choose a month, department, and employee to view their complete attendance report with detailed analytics.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800">1. Select Month</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800">2. Choose Department</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800">3. Pick Employee</span>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            // Loading State
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 animate-spin" />
                </div>
                <p className="text-sm text-slate-500">Loading attendance data...</p>
              </div>
            </div>
          ) : (
            // Main Content Grid
            <div className="h-full grid grid-cols-12 gap-6">
              {/* Left Column - Employee Info & Stats */}
              <div className="col-span-3 flex flex-col gap-4 overflow-y-auto">
                {/* Employee Card */}
                {selectedEmployee && (
                  <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 shadow-lg border border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={cn(
                        "h-14 w-14 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-bold text-lg shadow-lg",
                        getAvatarGradient(selectedEmployee.firstName)
                      )}>
                        {getInitials(selectedEmployee.firstName, selectedEmployee.lastName)}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                          {selectedEmployee.firstName} {selectedEmployee.lastName}
                        </h3>
                        <p className="text-sm text-slate-500">{selectedEmployee.department}</p>
                      </div>
                    </div>

                    {/* Attendance Rate Circle */}
                    <div className="flex items-center justify-center py-4">
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200 dark:text-slate-700" />
                          <circle
                            cx="50" cy="50" r="45" fill="none" strokeWidth="8"
                            strokeDasharray={`${monthlyStats.attendanceRate * 2.83} 283`}
                            strokeLinecap="round"
                            className={cn(
                              monthlyStats.attendanceRate >= 90 ? "text-emerald-500" :
                                monthlyStats.attendanceRate >= 70 ? "text-amber-500" :
                                  "text-red-500"
                            )}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-slate-900 dark:text-white">{monthlyStats.attendanceRate}%</span>
                          <span className="text-xs text-slate-500">Attendance</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    icon={CheckCircle2}
                    label="Present Days"
                    value={monthlyStats.presentDays}
                    subValue={`of ${monthlyStats.totalWorkDays} work days`}
                    color="emerald"
                    gradient="from-emerald-500 to-teal-600"
                  />
                  <StatCard
                    icon={XCircle}
                    label="Absent Days"
                    value={monthlyStats.absentDays}
                    color="red"
                    gradient="from-red-500 to-rose-600"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Late Days"
                    value={monthlyStats.lateDays}
                    subValue={`${formatDuration(monthlyStats.totalLateMinutes)} total`}
                    color="orange"
                    gradient="from-orange-500 to-amber-600"
                  />
                  <StatCard
                    icon={Timer}
                    label="Work Hours"
                    value={formatHours(monthlyStats.totalWorkMinutes)}
                    subValue={`~${monthlyStats.avgWorkHoursPerDay.toFixed(1)}h/day avg`}
                    color="blue"
                    gradient="from-blue-500 to-indigo-600"
                  />
                </div>

                {/* Extra Stats */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 shadow-lg border border-slate-200/60 dark:border-slate-800/60">
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-violet-500" />
                    More Insights
                  </h4>
                  <MiniStat icon={Flame} label="Current Streak" value={`${monthlyStats.currentStreak} days`} color="bg-orange-500" />
                  <MiniStat icon={Award} label="Longest Streak" value={`${monthlyStats.longestStreak} days`} color="bg-violet-500" />
                  <MiniStat icon={Coffee} label="Total Breaks" value={formatDuration(monthlyStats.totalBreakMinutes)} color="bg-amber-500" />
                  <MiniStat icon={Clock} label="Total Late" value={formatDuration(monthlyStats.totalLateMinutes)} color="bg-red-500" />
                </div>
              </div>

              {/* Center - Calendar */}
              <div className="col-span-6 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200/60 dark:border-slate-800/60 overflow-hidden">
                {/* Calendar Header */}
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-violet-500" />
                      {format(monthDate, "MMMM yyyy")}
                    </h3>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-500" />
                        <span>Present</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-orange-500" />
                        <span>Late</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-red-500" />
                        <span>Absent</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 px-4 py-2 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800">
                  {WEEKDAYS.map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-slate-500 py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="flex-1 p-4">
                  <div className="grid grid-cols-7 gap-2 h-full">
                    {calendarWeeks.flat().map((record, index) => (
                      record ? (
                        <DayCell
                          key={record.dateStr}
                          record={record}
                          isSelected={selectedDayRecord?.dateStr === record.dateStr}
                          onClick={() => setSelectedDayRecord(record)}
                        />
                      ) : (
                        <div key={`empty-${index}`} />
                      )
                    ))}
                  </div>
                </div>

                {/* Attendance Bar Chart */}
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
                  <AttendanceBarChart stats={monthlyStats} />
                </div>
              </div>

              {/* Right Column - Day Details */}
              <div className="col-span-3 flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200/60 dark:border-slate-800/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-5 w-5 text-violet-500" />
                    Day Details
                  </h3>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                  <DayDetailPanel 
                    record={selectedDayRecord} 
                    onEdit={handleEditShift}
                    onDelete={handleDeleteShift}
                    isSaving={editShiftMutation.isPending || deleteShiftMutation.isPending || deleteAbsentMutation.isPending}
                    employee={selectedEmployee}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}