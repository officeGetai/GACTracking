// client/src/pages/employee/attendance.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWeekend, isBefore, isToday, startOfDay } from "date-fns";
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sun,
  Moon,
  TrendingUp,
  Timer,
  CalendarDays,
  Loader2,
  RefreshCw,
  Sunrise,
  Sunset,
  Info,
  Filter,
  X,
  Search,
  ChevronDown,
  SlidersHorizontal,
  Coffee,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Shift, Break } from "@shared/schema";

// Grace period constant (should match server)
const GRACE_PERIOD_MINUTES = 15;

// Shift with breaks included
interface ShiftWithBreaks extends Shift {
  breaks?: Break[];
}

// Extended shift type that includes generated absent records
interface AttendanceRecord {
  id: string;
  date: string;
  status: "present" | "late" | "absent" | "half_day" | "incomplete" | "not_started" | "weekend" | "future";
  isGenerated: boolean; // true for absent/weekend/future records that don't exist in DB
  shift?: ShiftWithBreaks;
  morningClockIn?: Date | null;
  morningClockOut?: Date | null;
  eveningClockIn?: Date | null;
  eveningClockOut?: Date | null;
  morningLateMinutes?: number;
  eveningLateMinutes?: number;
  breakMinutes?: number;
}

/**
 * Format date/time specifically for Pakistani timezone (Asia/Karachi)
 */
function formatPakistaniTime(date: Date | string, formatStr: string = "h:mm a"): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

// Generate month options for the last 12 months
function getMonthOptions() {
  const options = [];
  const now = new Date();
  const pkNowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(now);
  const [pkYear, pkMonth] = pkNowStr.split('-').map(Number);

  for (let i = 0; i < 12; i++) {
    const date = new Date(pkYear, pkMonth - 1 - i, 1);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    });
  }
  return options;
}

function getStatusColor(status: string) {
  switch (status) {
    case "present":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "late":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "absent":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "half_day":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    case "not_started":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
    case "incomplete":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "weekend":
      return "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400";
    case "future":
      return "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500";
    default:
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "present":
      return <CheckCircle2 className="h-3 w-3" />;
    case "late":
      return <AlertCircle className="h-3 w-3" />;
    case "absent":
      return <XCircle className="h-3 w-3" />;
    case "half_day":
      return <Clock className="h-3 w-3" />;
    case "incomplete":
      return <AlertCircle className="h-3 w-3" />;
    case "weekend":
      return <Sun className="h-3 w-3" />;
    case "future":
      return <Calendar className="h-3 w-3" />;
    default:
      return <Clock className="h-3 w-3" />;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case "present":
      return "Present";
    case "late":
      return "Late";
    case "absent":
      return "Absent";
    case "half_day":
      return "Half Day";
    case "not_started":
      return "Not Started";
    case "incomplete":
      return "Incomplete";
    case "weekend":
      return "Weekend";
    case "future":
      return "Upcoming";
    default:
      return status;
  }
}

function calculateDuration(
  clockIn: string | Date | null,
  clockOut: string | Date | null
): { hours: number; minutes: number; formatted: string; isActive: boolean; isError: boolean } {
  if (!clockIn) return { hours: 0, minutes: 0, formatted: "-", isActive: false, isError: false };

  const startTime = new Date(clockIn);
  const isActive = !clockOut;
  const endTime = clockOut ? new Date(clockOut) : new Date();

  const diff = endTime.getTime() - startTime.getTime();

  if (diff < 0) {
    return { hours: 0, minutes: 0, formatted: "Invalid", isActive: false, isError: true };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    hours,
    minutes,
    formatted: isActive ? "Active" : `${hours}h ${minutes < 10 ? '0' + minutes : minutes}m`,
    isActive,
    isError: false,
  };
}

// Calculate total break minutes from shift breaks
function calculateBreakMinutes(shift: ShiftWithBreaks | undefined): number {
  if (!shift?.breaks || shift.breaks.length === 0) return 0;
  return shift.breaks.reduce((sum, brk) => sum + (brk.durationMinutes || 0), 0);
}

// Format duration in hours and minutes
function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Calculate GROSS work time (before subtracting breaks)
function calculateGrossWorkTime(shift: ShiftWithBreaks | undefined): number {
  if (!shift) return 0;

  let totalMinutes = 0;

  if (shift.morningClockIn) {
    const morningDuration = calculateDuration(
      shift.morningClockIn?.toString() || null,
      shift.morningClockOut?.toString() || null
    );
    totalMinutes += morningDuration.hours * 60 + morningDuration.minutes;
  }

  if (shift.eveningClockIn) {
    const eveningDuration = calculateDuration(
      shift.eveningClockIn?.toString() || null,
      shift.eveningClockOut?.toString() || null
    );
    totalMinutes += eveningDuration.hours * 60 + eveningDuration.minutes;
  }

  return totalMinutes;
}

// Calculate NET work time (after subtracting breaks)
function calculateTotalWorkTime(shift: ShiftWithBreaks | undefined): {
  hours: number;
  minutes: number;
  formatted: string;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
} {
  if (!shift) return { hours: 0, minutes: 0, formatted: "-", grossMinutes: 0, breakMinutes: 0, netMinutes: 0 };

  const grossMinutes = calculateGrossWorkTime(shift);
  const breakMinutes = calculateBreakMinutes(shift);
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);

  const hours = Math.floor(netMinutes / 60);
  const minutes = netMinutes % 60;

  return {
    hours,
    minutes,
    formatted: netMinutes > 0 ? `${hours}h ${minutes}m` : "-",
    grossMinutes,
    breakMinutes,
    netMinutes,
  };
}

function formatLateMinutes(lateMinutes: number | null | undefined): {
  text: string;
  fullText: string;
  color: string;
  isLate: boolean;
} {
  if (!lateMinutes || lateMinutes === 0) {
    return {
      text: "On time",
      fullText: `Arrived within ${GRACE_PERIOD_MINUTES}-minute grace period`,
      color: "text-emerald-600 dark:text-emerald-400",
      isLate: false,
    };
  }

  const hours = Math.floor(lateMinutes / 60);
  const mins = lateMinutes % 60;
  const text = hours > 0 ? `${hours}h ${mins < 10 ? '0' + mins : mins}m` : `${mins}m`;

  return {
    text,
    fullText: `${lateMinutes} minutes late from scheduled start`,
    color: lateMinutes > 30 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
    isLate: true,
  };
}

// Compact Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", color)}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold">{value}</span>
          {subtitle && <span className="text-[10px] opacity-70 truncate">{subtitle}</span>}
        </div>
        <p className="text-[10px] opacity-80 truncate">{title}</p>
      </div>
    </div>
  );
}

// Status Filter Options
const STATUS_FILTERS = [
  { value: "all", label: "All Status" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "incomplete", label: "Incomplete" },
  { value: "half_day", label: "Half Day" },
  { value: "weekend", label: "Weekend" },
];

export default function EmployeeAttendancePage() {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [hideWeekends, setHideWeekends] = useState(false);
  const [hideFuture, setHideFuture] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Fetch current user info
  const { data: user } = useQuery<any>({
    queryKey: ["/api/user"],
  });

  // Fetch shifts for the employee (now includes breaks)
  const {
    data: shifts = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery<ShiftWithBreaks[]>({
    queryKey: ["/api/employee/shifts"],
  });

  // Generate attendance records including absent days
  const attendanceRecords = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));
    const today = startOfDay(new Date());

    // Get all days in the month
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Create a map of existing shifts by date
    const shiftMap = new Map<string, ShiftWithBreaks>();
    shifts.forEach((shift) => {
      if (shift.date.startsWith(selectedMonth)) {
        shiftMap.set(shift.date, shift);
      }
    });

    // Get user's joining date if available
    const joiningDate = user?.createdAt ? startOfDay(new Date(user.createdAt)) : null;

    // Generate attendance records for each day
    const records: AttendanceRecord[] = allDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const existingShift = shiftMap.get(dateStr);
      const dayStart = startOfDay(day);
      const isFutureDay = isBefore(today, dayStart);
      const isWeekendDay = isWeekend(day);
      const isBeforeJoining = joiningDate && isBefore(dayStart, joiningDate);

      // If shift exists, use it
      if (existingShift) {
        return {
          id: existingShift.id,
          date: existingShift.date,
          status: existingShift.status as AttendanceRecord["status"],
          isGenerated: false,
          shift: existingShift,
          morningClockIn: existingShift.morningClockIn,
          morningClockOut: existingShift.morningClockOut,
          eveningClockIn: existingShift.eveningClockIn,
          eveningClockOut: existingShift.eveningClockOut,
          morningLateMinutes: existingShift.morningLateMinutes || 0,
          eveningLateMinutes: existingShift.eveningLateMinutes || 0,
        };
      }

      // Future day
      if (isFutureDay) {
        return {
          id: `future-${dateStr}`,
          date: dateStr,
          status: "future" as const,
          isGenerated: true,
        };
      }

      // Weekend
      if (isWeekendDay) {
        return {
          id: `weekend-${dateStr}`,
          date: dateStr,
          status: "weekend" as const,
          isGenerated: true,
        };
      }

      // Before joining date
      if (isBeforeJoining) {
        return {
          id: `pre-${dateStr}`,
          date: dateStr,
          status: "future" as const,
          isGenerated: true,
        };
      }

      // Working day with no shift = Absent
      return {
        id: `absent-${dateStr}`,
        date: dateStr,
        status: "absent" as const,
        isGenerated: true,
      };
    });

    return records;
  }, [shifts, selectedMonth, user]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    let filtered = [...attendanceRecords];

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Hide weekends
    if (hideWeekends) {
      filtered = filtered.filter((r) => r.status !== "weekend");
    }

    // Hide future days
    if (hideFuture) {
      filtered = filtered.filter((r) => r.status !== "future");
    }

    // Search by date
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => {
        const dateFormatted = format(parseISO(r.date), "EEEE, MMMM d, yyyy").toLowerCase();
        return dateFormatted.includes(query) || r.date.includes(query);
      });
    }

    // Sort by date descending
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceRecords, statusFilter, hideWeekends, hideFuture, searchQuery]);

  // Calculate statistics (excluding weekends and future days)
  const stats = useMemo(() => {
    const workingDayRecords = attendanceRecords.filter(
      (r) => r.status !== "weekend" && r.status !== "future"
    );

    const totalDays = workingDayRecords.length;
    const presentDays = workingDayRecords.filter((r) => r.status === "present").length;
    const lateDays = workingDayRecords.filter((r) => r.status === "late").length;
    const absentDays = workingDayRecords.filter((r) => r.status === "absent").length;
    const incompleteDays = workingDayRecords.filter((r) => r.status === "incomplete").length;
    const halfDays = workingDayRecords.filter((r) => r.status === "half_day").length;

    // Calculate total NET work hours (after subtracting breaks)
    let totalNetMinutes = 0;
    let totalBreakMinutes = 0;
    workingDayRecords.forEach((record) => {
      if (record.shift) {
        const workTime = calculateTotalWorkTime(record.shift);
        totalNetMinutes += workTime.netMinutes;
        totalBreakMinutes += workTime.breakMinutes;
      }
    });

    const totalHours = Math.floor(totalNetMinutes / 60);
    const remainingMinutes = totalNetMinutes % 60;

    // Calculate total late minutes
    let totalLateMinutes = 0;
    workingDayRecords.forEach((record) => {
      if (record.shift) {
        totalLateMinutes += (record.shift.morningLateMinutes || 0) + (record.shift.eveningLateMinutes || 0);
      }
    });

    const attendanceRate =
      totalDays > 0 ? Math.round(((presentDays + lateDays + halfDays) / totalDays) * 100) : 0;

    const avgWorkHours = totalDays > 0 ? (totalNetMinutes / totalDays / 60).toFixed(1) : "0";

    return {
      totalDays,
      presentDays,
      lateDays,
      absentDays,
      incompleteDays,
      halfDays,
      totalHours,
      remainingMinutes,
      totalLateMinutes,
      totalBreakMinutes,
      attendanceRate,
      avgWorkHours,
    };
  }, [attendanceRecords]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (hideWeekends) count++;
    if (!hideFuture) count++;
    if (searchQuery) count++;
    return count;
  }, [statusFilter, hideWeekends, hideFuture, searchQuery]);

  const clearFilters = () => {
    setStatusFilter("all");
    setHideWeekends(false);
    setHideFuture(true);
    setSearchQuery("");
  };

  return (
    <ScrollArea className="h-full">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="p-3 md:p-4 space-y-3 max-w-6xl mx-auto">
          {/* Compact Header with Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Month Selector */}
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[150px] h-9">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getMonthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.value !== "all" && (
                        <span className={cn("w-2 h-2 rounded-full", getStatusColor(option.value).split(" ")[0])} />
                      )}
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 min-w-[150px] max-w-[250px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* More Filters Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Display Options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={hideWeekends}
                  onCheckedChange={setHideWeekends}
                >
                  Hide Weekends
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={!hideFuture}
                  onCheckedChange={(checked) => setHideFuture(!checked)}
                >
                  Show Future Days
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-xs"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3 mr-2" />
                  Clear All Filters
                </Button>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>

            {/* Records Count */}
            <Badge variant="outline" className="h-9 px-3 font-mono text-xs">
              {filteredRecords.length} records
            </Badge>
          </div>

          {/* Compact Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <StatCard
              title="Present"
              value={stats.presentDays}
              subtitle={`/${stats.totalDays}`}
              icon={CheckCircle2}
              color="bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
            />
            <StatCard
              title="Late"
              value={stats.lateDays}
              subtitle={`${stats.totalLateMinutes}m`}
              icon={AlertCircle}
              color="bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400"
            />
            <StatCard
              title="Absent"
              value={stats.absentDays}
              icon={XCircle}
              color="bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"
            />
            <StatCard
              title="Net Hours"
              value={stats.totalHours}
              subtitle={`${stats.remainingMinutes}m`}
              icon={Timer}
              color="bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400"
            />
            <StatCard
              title="Break Time"
              value={formatDuration(stats.totalBreakMinutes)}
              icon={Coffee}
              color="bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-400"
            />
            <StatCard
              title="Rate"
              value={`${stats.attendanceRate}%`}
              icon={TrendingUp}
              color="bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-400"
            />
            <StatCard
              title="Avg/Day"
              value={`${stats.avgWorkHours}h`}
              icon={CalendarDays}
              color="bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-400"
            />
          </div>

          {/* Grace Period Info - Collapsible */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 dark:text-blue-400 gap-1.5 px-2">
                <Info className="h-3 w-3" />
                {GRACE_PERIOD_MINUTES}-min grace period policy
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-xs" align="start">
              <div className="space-y-2">
                <p className="font-medium">Attendance Policy</p>
                <p className="text-muted-foreground">
                  You are allowed a {GRACE_PERIOD_MINUTES}-minute grace period after your scheduled
                  start time. If you arrive within this window, you are marked on time.
                  If you arrive after the grace period, the full delay from your scheduled start is counted as late.
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium">Example:</span> If your shift starts at 9:00 AM and
                  you clock in at 9:20 AM, you'll be marked 20 minutes late.
                </p>
              </div>
            </PopoverContent>
          </Popover>

          {/* Attendance Table */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredRecords.length > 0 ? (
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-50/80">
                        <TableHead className="font-semibold h-10 text-xs">Date</TableHead>
                        <TableHead className="font-semibold h-10 text-xs">
                          <div className="flex items-center gap-1">
                            <Sunrise className="h-3 w-3 text-amber-500" />
                            {user?.shiftType === 'one_shift' ? 'Session' : 'Morning'}
                          </div>
                        </TableHead>
                        {user?.shiftType !== 'one_shift' && (
                          <TableHead className="font-semibold h-10 text-xs">
                            <div className="flex items-center gap-1">
                              <Moon className="h-3 w-3 text-blue-500" />
                              Evening
                            </div>
                          </TableHead>
                        )}
                        <TableHead className="font-semibold h-10 text-xs w-16">Total</TableHead>
                        <TableHead className="font-semibold h-10 text-xs w-16">Late</TableHead>
                        <TableHead className="font-semibold h-10 text-xs w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => {
                        const morningDuration = record.shift
                          ? calculateDuration(
                            record.shift.morningClockIn?.toString() || null,
                            record.shift.morningClockOut?.toString() || null
                          )
                          : null;
                        const eveningDuration = record.shift
                          ? calculateDuration(
                            record.shift.eveningClockIn?.toString() || null,
                            record.shift.eveningClockOut?.toString() || null
                          )
                          : null;
                        const totalWork = calculateTotalWorkTime(record.shift);
                        const totalLate =
                          (record.morningLateMinutes || 0) + (record.eveningLateMinutes || 0);
                        const lateInfo = formatLateMinutes(totalLate);

                        const isAbsentOrWeekend = record.status === "absent" || record.status === "weekend" || record.status === "future";

                        return (
                          <TableRow
                            key={record.id}
                            className={cn(
                              "hover:bg-slate-50/50 dark:hover:bg-slate-800/30",
                              record.status === "absent" && "bg-red-50/30 dark:bg-red-950/10",
                              record.status === "weekend" && "bg-blue-50/30 dark:bg-blue-950/10",
                              record.status === "future" && "bg-slate-50/50 dark:bg-slate-900/30 opacity-60"
                            )}
                          >
                            <TableCell className="py-2">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-9 h-9 rounded-lg flex flex-col items-center justify-center text-xs",
                                  record.status === "absent"
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                    : record.status === "weekend"
                                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                      : "bg-primary/10 text-primary"
                                )}>
                                  <span className="font-bold leading-none">
                                    {format(parseISO(record.date), "d")}
                                  </span>
                                  <span className="text-[8px] uppercase opacity-70">
                                    {format(parseISO(record.date), "MMM")}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {format(parseISO(record.date), "EEE")}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {format(parseISO(record.date), "MMM d")}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              {record.shift?.morningClockIn ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                      {formatPakistaniTime(record.shift.morningClockIn)}
                                    </span>
                                    {record.shift.morningClockOut && (
                                      <>
                                        <span className="text-[10px] text-muted-foreground">→</span>
                                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                          {formatPakistaniTime(record.shift.morningClockOut)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <p className={cn(
                                    "text-[10px]",
                                    morningDuration?.isActive ? "text-emerald-500 font-medium" : "text-muted-foreground"
                                  )}>
                                    {morningDuration?.formatted}
                                    {record.morningLateMinutes && record.morningLateMinutes > 0 && (
                                      <span className="text-amber-600 ml-1">+{record.morningLateMinutes}m</span>
                                    )}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {isAbsentOrWeekend ? "-" : "Not clocked"}
                                </span>
                              )}
                            </TableCell>
                            {user?.shiftType !== 'one_shift' && (
                              <TableCell className="py-2">
                                {record.shift?.eveningClockIn ? (
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">
                                        {formatPakistaniTime(record.shift.eveningClockIn)}
                                      </span>
                                      {record.shift.eveningClockOut && (
                                        <>
                                          <span className="text-[10px] text-muted-foreground">→</span>
                                          <span className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
                                            {formatPakistaniTime(record.shift.eveningClockOut)}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                    <p className={cn(
                                      "text-[10px]",
                                      eveningDuration?.isActive ? "text-blue-500 font-medium" : "text-muted-foreground"
                                    )}>
                                      {eveningDuration?.formatted}
                                      {record.eveningLateMinutes && record.eveningLateMinutes > 0 && (
                                        <span className="text-amber-600 ml-1">+{record.eveningLateMinutes}m</span>
                                      )}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">
                                    {isAbsentOrWeekend ? "-" : "Not clocked"}
                                  </span>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="py-2">
                              <span
                                className={cn(
                                  "text-xs font-semibold",
                                  totalWork.hours >= 8
                                    ? "text-emerald-600"
                                    : totalWork.hours >= 4
                                      ? "text-amber-600"
                                      : "text-slate-400"
                                )}
                              >
                                {isAbsentOrWeekend ? "-" : totalWork.formatted}
                              </span>
                            </TableCell>
                            <TableCell className="py-2">
                              {!isAbsentOrWeekend && record.shift ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        variant="secondary"
                                        className={cn(
                                          "text-[10px] px-1.5 py-0",
                                          lateInfo.isLate
                                            ? totalLate > 30
                                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        )}
                                      >
                                        {lateInfo.text}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">{lateInfo.fullText}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge className={cn("gap-1 text-[10px] px-1.5 py-0 font-medium", getStatusColor(record.status))}>
                                {getStatusIcon(record.status)}
                                {getStatusLabel(record.status)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">No Records Found</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    {activeFilterCount > 0
                      ? "Try adjusting your filters to see more records."
                      : `No attendance records for ${format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}.`
                    }
                  </p>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Late Time Summary - Only show if there's late time */}
          {stats.totalLateMinutes > 0 && (
            <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Total late time: <strong>
                  {stats.totalLateMinutes >= 60
                    ? `${Math.floor(stats.totalLateMinutes / 60)}h ${stats.totalLateMinutes % 60}m`
                    : `${stats.totalLateMinutes}m`}
                </strong> across {stats.lateDays} day{stats.lateDays !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Absent Days Alert - Only show if there are absent days */}
          {stats.absentDays > 0 && (
            <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
              <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                You have <strong>{stats.absentDays}</strong> absent day{stats.absentDays !== 1 ? "s" : ""} this month.
              </span>
            </div>
          )}

          {/* Perfect Attendance */}
          {stats.totalDays > 0 && stats.totalLateMinutes === 0 && stats.absentDays === 0 && (
            <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Perfect attendance! 🎉 No late arrivals or absences this month.</span>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}