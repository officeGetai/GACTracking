// client/src/pages/admin/daily-reports.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  FileText,
  Search,
  Building2,
  Calendar,
  RefreshCw,
  Eye,
  Video,
  Link2,
  Clock,
  User,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Filter,
  X,
  CheckCircle,
  FileCheck,
  Users,
  TrendingUp,
  BarChart3,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Safe JSON parse helper
function safeParseArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      return [value];
    } catch {
      if (value.trim()) return [value];
      return [];
    }
  }
  return [];
}

// FIX: Use local time for current month calculation
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Generate month options (last 24 months for history)
function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    });
  }
  return options;
}

// Helpers
function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
}

function getAvatarGradient(name: string) {
  const gradients = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-blue-600",
  ];
  return gradients[(name?.charCodeAt(0) || 0) % gradients.length];
}

// Mini Stat Pill
function StatPill({
  icon: Icon,
  value,
  label,
  color
}: {
  icon: any;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
      "bg-white dark:bg-slate-800 shadow-sm"
    )}>
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="font-bold text-slate-900 dark:text-white">{value}</span>
      <span className="text-slate-500 hidden sm:inline">{label}</span>
    </div>
  );
}

// Report Card Component
function ReportCard({
  report,
  onClick
}: {
  report: any;
  onClick: () => void;
}) {
  const videos = safeParseArray(report.loomVideos);
  const refs = safeParseArray(report.references);
  const reportDate = parseISO(report.date);

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left p-4 rounded-2xl transition-all duration-300",
        "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800",
        "hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50",
        "hover:-translate-y-1 hover:border-slate-200 dark:hover:border-slate-700"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 ring-2 ring-white dark:ring-slate-900 shadow-md shrink-0">
          <AvatarFallback className={cn(
            "text-xs font-bold text-white bg-gradient-to-br",
            getAvatarGradient(report.user?.firstName || "")
          )}>
            {getInitials(report.user?.firstName || "", report.user?.lastName || "")}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                {report.user?.firstName} {report.user?.lastName}
              </h3>
              {report.user?.department && (
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Building2 className="h-2.5 w-2.5" />
                  {report.user.department}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </div>
      </div>

      {/* Date Badge */}
      <div className="flex items-center gap-2 mt-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800">
          <Calendar className="h-3 w-3 text-slate-400" />
          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
            {format(reportDate, "EEE, MMM d")}
          </span>
        </div>
        
        {videos.length > 0 && (
          <Badge variant="secondary" className="text-[9px] gap-1 px-1.5 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <Video className="h-2.5 w-2.5" />
            {videos.length}
          </Badge>
        )}
        
        {refs.length > 0 && (
          <Badge variant="secondary" className="text-[9px] gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
            <Link2 className="h-2.5 w-2.5" />
            {refs.length}
          </Badge>
        )}
      </div>

      {/* Preview */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed">
        {report.workDetails?.substring(0, 120)}...
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-[10px] text-slate-400">
          {format(new Date(report.createdAt), "h:mm a")}
        </span>
        <div className="flex items-center gap-1 text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View Details
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </button>
  );
}

// Department Group Component
function DepartmentGroup({
  department,
  reports,
  onViewReport
}: {
  department: string;
  reports: any[];
  onViewReport: (report: any) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Department Header */}
      <div className="flex items-center gap-2 sticky top-0 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm py-2 z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            {department}
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary">
            {reports.length}
          </Badge>
        </div>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {reports.map((report) => (
          <ReportCard 
            key={report.id} 
            report={report} 
            onClick={() => onViewReport(report)} 
          />
        ))}
      </div>
    </div>
  );
}

// Main Component
export default function AdminDailyReportsPage() {
  // FIX: Use local time for current month
  const currentMonth = getCurrentMonth();

  // States
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByDepartment, setGroupByDepartment] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Delete report function
  const handleDeleteReport = async () => {
    if (!selectedReport) return;
    
    setIsDeleting(true);
    try {
      const res = await apiRequest("DELETE", `/api/admin/reports/daily/${selectedReport.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete report");
      }
      
      toast({
        title: "Report Deleted",
        description: "The report has been successfully deleted.",
      });
      
      setDeleteConfirmOpen(false);
      setViewDialogOpen(false);
      setSelectedReport(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/daily"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete report",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Fetch employees for filter dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/employees");
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  // Fetch reports with improved error handling
  const { data: reports = [], isLoading, refetch, error } = useQuery({
    queryKey: ["admin-daily-reports", selectedMonth, selectedEmployee],
    queryFn: async () => {
      let url = `/api/admin/reports/daily?month=${selectedMonth}`;
      if (selectedEmployee !== "all") {
        url += `&userId=${selectedEmployee}`;
      }
      
      console.log("Fetching reports:", url);
      
      const res = await apiRequest("GET", url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch reports");
      }
      const data = await res.json();
      console.log("Received reports:", data.length);
      return data;
    },
  });

  // Get unique departments
  const departments = useMemo(() => {
    const depts = new Set<string>();
    reports.forEach((r: any) => {
      if (r.user?.department) depts.add(r.user.department);
    });
    return Array.from(depts).sort();
  }, [reports]);

  // Get unique dates for the selected month
  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    reports.forEach((r: any) => dateSet.add(r.date));
    return Array.from(dateSet).sort().reverse();
  }, [reports]);

  // Filter reports
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r: any) =>
        `${r.user?.firstName} ${r.user?.lastName}`.toLowerCase().includes(query) ||
        r.workDetails?.toLowerCase().includes(query) ||
        r.user?.department?.toLowerCase().includes(query)
      );
    }

    if (selectedDepartment !== "all") {
      filtered = filtered.filter((r: any) => r.user?.department === selectedDepartment);
    }

    if (selectedDate && selectedDate !== "all_dates") {
      filtered = filtered.filter((r: any) => r.date === selectedDate);
    }

    return filtered.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reports, searchQuery, selectedDepartment, selectedDate]);

  // Group by department
  const groupedReports = useMemo(() => {
    if (!groupByDepartment) return { "All Reports": filteredReports };

    const groups: Record<string, any[]> = {};
    filteredReports.forEach((report: any) => {
      const dept = report.user?.department || "Unassigned";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(report);
    });
    return groups;
  }, [filteredReports, groupByDepartment]);

  // Stats
  const stats = useMemo(() => {
    const uniqueEmployees = new Set(reports.map((r: any) => r.userId)).size;
    const withVideos = reports.filter((r: any) => safeParseArray(r.loomVideos).length > 0).length;
    const withRefs = reports.filter((r: any) => safeParseArray(r.references).length > 0).length;
    
    // Get today's date in local format
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const todayReports = reports.filter((r: any) => r.date === todayStr).length;

    return { 
      total: reports.length, 
      uniqueEmployees, 
      withVideos, 
      withRefs,
      todayReports 
    };
  }, [reports]);

  const viewReport = (report: any) => {
    setSelectedReport(report);
    setViewDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("all");
    setSelectedDate("");
    setSelectedEmployee("all");
  };

  const hasActiveFilters = searchQuery || selectedDepartment !== "all" || selectedDate || selectedEmployee !== "all";

  // Error display
  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <X className="h-6 w-6 text-red-500" />
          </div>
          <p className="font-medium text-slate-900 dark:text-white mb-1">Error loading reports</p>
          <p className="text-sm text-slate-500 mb-4">{(error as Error).message}</p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 p-2">
      {/* Compact Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Stats Pills */}
        <div className="flex items-center gap-1.5">
          <StatPill icon={FileText} value={stats.total} label="Reports" color="text-slate-500" />
          <StatPill icon={Users} value={stats.uniqueEmployees} label="Employees" color="text-blue-500" />
          <StatPill icon={Video} value={stats.withVideos} label="Videos" color="text-red-500" />
          <StatPill icon={CheckCircle} value={stats.todayReports} label="Today" color="text-emerald-500" />
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search reports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-white dark:bg-slate-800 border-0 shadow-sm"
          />
        </div>

        {/* Month Filter */}
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-8 w-[140px] text-xs bg-white dark:bg-slate-800 border-0 shadow-sm">
            <Calendar className="h-3 w-3 mr-1.5 text-slate-400" />
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

        {/* Employee Filter */}
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="h-8 w-[150px] text-xs bg-white dark:bg-slate-800 border-0 shadow-sm">
            <User className="h-3 w-3 mr-1.5 text-slate-400" />
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees
              .filter((e: any) => e.role !== 'admin')
              .map((emp: any) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Date Filter */}
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="h-8 w-[100px] text-xs bg-white dark:bg-slate-800 border-0 shadow-sm">
            <SelectValue placeholder="All Days" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_dates">All Days</SelectItem>
            {dates.map((date) => (
              <SelectItem key={date} value={date}>
                {format(parseISO(date), "MMM d")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Department Filter */}
        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger className="h-8 w-[130px] text-xs bg-white dark:bg-slate-800 border-0 shadow-sm">
            <Building2 className="h-3 w-3 mr-1.5 text-slate-400" />
            <SelectValue placeholder="All Depts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Group Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={groupByDepartment ? "default" : "ghost"}
              size="sm"
              className="h-8 px-2"
              onClick={() => setGroupByDepartment(!groupByDepartment)}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {groupByDepartment ? "Show all" : "Group by department"}
          </TooltipContent>
        </Tooltip>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Results Info */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{filteredReports.length}</span> reports
          {selectedDate && selectedDate !== "all_dates" && (
            <span> for {format(parseISO(selectedDate), "MMMM d, yyyy")}</span>
          )}
          {selectedEmployee !== "all" && (
            <span> from selected employee</span>
          )}
        </p>
      </div>

      {/* Reports Content */}
      <ScrollArea className="flex-1 -mx-2 px-2">
        {filteredReports.length === 0 ? (
          <div className="h-full flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-6 w-6 text-slate-400" />
              </div>
              <p className="font-medium text-slate-900 dark:text-white mb-1">No reports found</p>
              <p className="text-sm text-slate-500">
                {hasActiveFilters ? "Try adjusting your filters" : "No reports for this period"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        ) : groupByDepartment ? (
          <div className="space-y-6 pb-4">
            {Object.entries(groupedReports)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([department, deptReports]) => (
                <DepartmentGroup
                  key={department}
                  department={department}
                  reports={deptReports}
                  onViewReport={viewReport}
                />
              ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-4">
            {filteredReports.map((report: any) => (
              <ReportCard
                key={report.id}
                report={report}
                onClick={() => viewReport(report)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* View Report Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {selectedReport && (
            <>
              <DialogHeader className="shrink-0">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 ring-2 ring-primary/20 shadow-md">
                    <AvatarFallback className={cn(
                      "text-sm font-bold text-white bg-gradient-to-br",
                      getAvatarGradient(selectedReport.user?.firstName || "")
                    )}>
                      {getInitials(selectedReport.user?.firstName || "", selectedReport.user?.lastName || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <DialogTitle className="text-lg">
                      {selectedReport.user?.firstName} {selectedReport.user?.lastName}
                    </DialogTitle>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {selectedReport.user?.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {selectedReport.user.department}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(parseISO(selectedReport.date), "EEEE, MMMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-6 py-4">
                  {/* Work Details */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Work Details
                    </h4>
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {selectedReport.workDetails}
                      </p>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedReport.notes && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Additional Notes</h4>
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedReport.notes}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Videos */}
                  {(() => {
                    const videos = safeParseArray(selectedReport.loomVideos);
                    if (videos.length === 0) return null;
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Video className="h-4 w-4 text-red-500" />
                          Video Links ({videos.length})
                        </h4>
                        <div className="space-y-2">
                          {videos.map((video: string, i: number) => (
                            <a
                              key={i}
                              href={video}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors group"
                            >
                              <Video className="h-4 w-4 text-red-500 shrink-0" />
                              <span className="text-sm text-red-700 dark:text-red-400 truncate flex-1">
                                {video}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 text-red-400 group-hover:text-red-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* References */}
                  {(() => {
                    const refs = safeParseArray(selectedReport.references);
                    if (refs.length === 0) return null;
                    return (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-blue-500" />
                          Reference Links ({refs.length})
                        </h4>
                        <div className="space-y-2">
                          {refs.map((ref: string, i: number) => (
                            <a
                              key={i}
                              href={ref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                            >
                              <Link2 className="h-4 w-4 text-blue-500 shrink-0" />
                              <span className="text-sm text-blue-700 dark:text-blue-400 truncate flex-1">
                                {ref}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5 text-blue-400 group-hover:text-blue-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Metadata */}
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Submitted {format(new Date(selectedReport.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteConfirmOpen(true)}
                      data-testid="button-delete-report"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Report
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this report? This action cannot be undone.
            </p>
            {selectedReport && (
              <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm">
                <p><strong>Employee:</strong> {selectedReport.user?.firstName} {selectedReport.user?.lastName}</p>
                <p><strong>Date:</strong> {format(parseISO(selectedReport.date), "MMMM d, yyyy")}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteReport}
              disabled={isDeleting}
              data-testid="button-confirm-delete-report"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Report
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}