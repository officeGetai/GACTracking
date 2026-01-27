// client/src/pages/admin/special-requests.tsx
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Send,
  MessageSquare,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  Check,
  X,
  FileText,
  Search,
  Building2,
  SlidersHorizontal,
  MoreHorizontal,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
  Circle,
  Calendar,
  CalendarDays,
  User,
  Plus,
  Trash2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Get current month in LOCAL time
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Generate month options (last 24 months)
function getMonthOptions() {
  const options = [];
  const now = new Date();

  for (let i = -2; i < 24; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: format(date, "yyyy-MM"),
      label: format(date, "MMMM yyyy"),
    });
  }
  return options;
}

// Status configuration
const statusConfig: Record<string, {
  label: string;
  shortLabel: string;
  color: string;
  icon: any;
  bg: string;
  dot: string;
}> = {
  sent_for_approval: {
    label: "Pending Approval",
    shortLabel: "Pending",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500",
    dot: "bg-blue-500",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    shortLabel: "Approved",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500",
    dot: "bg-emerald-500",
    icon: CheckCircle,
  },
  not_approved: {
    label: "Rejected",
    shortLabel: "Rejected",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500",
    dot: "bg-red-500",
    icon: XCircle,
  },
  revision: {
    label: "Revision Requested",
    shortLabel: "Revision",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500",
    dot: "bg-amber-500",
    icon: RotateCcw,
  },
  resolved: {
    label: "Resolved",
    shortLabel: "Resolved",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500",
    dot: "bg-slate-400",
    icon: CheckCircle2,
  },
};

// Helpers
function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";
}

function getAvatarGradient(name: string) {
  const gradients = [
    "from-violet-500 to-purple-500",
    "from-blue-500 to-cyan-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-blue-500",
  ];
  const index = (name?.charCodeAt(0) || 0) % gradients.length;
  return gradients[index];
}

// Mini Stat Pill Component
function StatPill({
  label,
  value,
  dotColor,
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  dotColor: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
        "hover:scale-105 active:scale-95",
        isActive
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-lg"
          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
      )}
    >
      <span className={cn("w-2 h-2 rounded-full", dotColor)} />
      <span>{label}</span>
      <span className={cn(
        "font-bold",
        isActive ? "text-white dark:text-slate-900" : "text-slate-900 dark:text-white"
      )}>
        {value}
      </span>
    </button>
  );
}

// Request List Item
function RequestItem({
  request,
  isSelected,
  onClick
}: {
  request: any;
  isSelected: boolean;
  onClick: () => void;
}) {
  const config = statusConfig[request.status] || statusConfig.sent_for_approval;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl transition-all duration-200",
        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        isSelected && "bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 shadow-sm"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar className="h-9 w-9">
            <AvatarFallback className={cn(
              "text-[11px] font-bold text-white bg-gradient-to-br",
              getAvatarGradient(request.user?.firstName || "")
            )}>
              {getInitials(request.user?.firstName || "", request.user?.lastName || "")}
            </AvatarFallback>
          </Avatar>
          <span className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900",
            config.dot
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {request.user?.firstName} {request.user?.lastName}
            </p>
            <span className="text-[10px] text-slate-400 shrink-0">
              {format(new Date(request.createdAt), "MMM d")}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate mb-1">
            {request.title}
          </p>
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-medium", config.color)}>
              {config.shortLabel}
            </span>
            {request.user?.department && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-[10px] text-slate-400 truncate">
                  {request.user.department}
                </span>
              </>
            )}
          </div>
        </div>

        {isSelected && (
          <ArrowUpRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </div>
    </button>
  );
}

// Main Component
export default function AdminSpecialRequestsPage() {
  const { toast } = useToast();

  // Use local time for current month
  const currentMonth = getCurrentMonth();

  // States
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [responseComment, setResponseComment] = useState("");
  const [responseStatus, setResponseStatus] = useState("");

  // New: Edited request dates for admin to modify before approval
  const [editedRequestDates, setEditedRequestDates] = useState<Array<{ date: string, shiftType: string }>>([]);
  const [newDateInput, setNewDateInput] = useState("");
  const [newShiftTypeInput, setNewShiftTypeInput] = useState("");

  // Get shift label helper
  const getShiftLabel = (shiftType: string) => {
    switch (shiftType) {
      case "morning": return "Morning Shift";
      case "evening": return "Evening Shift";
      case "both": return "Both Shifts";
      case "complete": return "Complete Shift";
      case "single": return "Complete Shift";
      default: return shiftType;
    }
  };

  // Get shift options based on employee's shift type
  const getShiftOptionsForEmployee = (employee: any) => {
    if (!employee) return [{ value: "complete", label: "Complete Shift" }];

    switch (employee.shiftType) {
      case "open_shift":
        return [{ value: "complete", label: "Complete Shift" }];
      case "one_shift":
        return [{ value: "single", label: "Complete Shift" }];
      case "two_shifts":
        return [
          { value: "morning", label: "Morning Shift" },
          { value: "evening", label: "Evening Shift" },
          { value: "both", label: "Both Shifts" },
        ];
      default:
        return [{ value: "complete", label: "Complete Shift" }];
    }
  };

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/employees");
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json();
    },
  });

  // Fetch requests
  const { data: rawRequests = [], isLoading, refetch: refetchRequests } = useQuery({
    queryKey: ["admin-requests", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/requests/special?month=${selectedMonth}`);
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
    refetchInterval: 1000,
  });

  // Fetch comments
  const { data: comments = [], refetch: refetchComments, isLoading: commentsLoading } = useQuery({
    queryKey: ["admin-request-comments", selectedRequestId],
    queryFn: async () => {
      if (!selectedRequestId) return [];
      const res = await apiRequest("GET", `/api/requests/special/${selectedRequestId}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedRequestId,
    refetchInterval: 1000,
  });

  // Departments
  const departments = useMemo(() => {
    const depts = new Set<string>();
    rawRequests.forEach((r: any) => {
      if (r.user?.department) depts.add(r.user.department);
    });
    return Array.from(depts).sort();
  }, [rawRequests]);

  // Get unique dates for selected month
  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    rawRequests.forEach((r: any) => {
      const date = new Date(r.createdAt).toISOString().split("T")[0];
      dateSet.add(date);
    });
    return Array.from(dateSet).sort().reverse();
  }, [rawRequests]);

  // Filtered & Sorted
  const filteredRequests = useMemo(() => {
    let filtered = [...rawRequests];

    if (selectedStatus !== "all") {
      filtered = filtered.filter((r: any) => r.status === selectedStatus);
    }

    if (selectedDepartment !== "all") {
      filtered = filtered.filter((r: any) => r.user?.department === selectedDepartment);
    }

    if (selectedEmployee !== "all") {
      filtered = filtered.filter((r: any) => r.userId === selectedEmployee);
    }

    if (selectedDate && selectedDate !== "all_dates") {
      filtered = filtered.filter((r: any) => {
        const requestDate = new Date(r.createdAt).toISOString().split("T")[0];
        return requestDate === selectedDate;
      });
    }

    if (searchQuery.trim()) {
      const queryTerms = searchQuery.toLowerCase().trim().split(/\s+/).filter(term => term.length > 0);

      filtered = filtered.filter((r: any) => {
        const searchableText = `
          ${r.title || ""} 
          ${r.details || ""} 
          ${r.user?.firstName || ""} 
          ${r.user?.lastName || ""} 
          ${r.user?.username || ""} 
          ${r.user?.department || ""}
        `.toLowerCase();

        return queryTerms.every(term => searchableText.includes(term));
      });
    }

    filtered.sort((a: any, b: any) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return filtered;
  }, [rawRequests, selectedStatus, selectedDepartment, selectedEmployee, selectedDate, searchQuery, sortBy]);

  const selectedRequest = filteredRequests.find((r: any) => r.id === selectedRequestId);

  // Stats
  const stats = useMemo(() => ({
    total: rawRequests.length,
    pending: rawRequests.filter((r: any) => r.status === "sent_for_approval").length,
    approved: rawRequests.filter((r: any) => r.status === "approved").length,
    rejected: rawRequests.filter((r: any) => r.status === "not_approved").length,
    revision: rawRequests.filter((r: any) => r.status === "revision").length,
  }), [rawRequests]);

  // Mutations
  const respondMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequestId) throw new Error("No request selected");
      const actualStatus = responseStatus && responseStatus !== "no_change" ? responseStatus : undefined;

      // If there's a status change, use PATCH endpoint with edited dates
      if (actualStatus) {
        const res = await apiRequest("PATCH", `/api/admin/requests/special/${selectedRequestId}`, {
          status: actualStatus,
          adminResponse: responseComment,
          requestDates: editedRequestDates.length > 0 ? editedRequestDates : undefined,
        });
        if (!res.ok) throw new Error(await res.text());
      }

      // Also add comment to conversation thread
      const commentRes = await apiRequest("POST", `/api/requests/special/${selectedRequestId}/comments`, {
        comment: responseComment,
        statusChange: actualStatus,
      });
      if (!commentRes.ok) throw new Error(await commentRes.text());
      return commentRes.json();
    },
    onSuccess: () => {
      toast({ title: "Sent!", description: "Your response has been delivered." });
      setResponseComment("");
      setResponseStatus("");
      refetchComments();
      refetchRequests();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const quickActionMutation = useMutation({
    mutationFn: async ({ status, comment }: { status: string; comment: string }) => {
      if (!selectedRequestId) throw new Error("No request selected");

      // Use PATCH endpoint to update status with admin response and edited dates
      const res = await apiRequest("PATCH", `/api/admin/requests/special/${selectedRequestId}`, {
        status,
        adminResponse: comment,
        requestDates: editedRequestDates.length > 0 ? editedRequestDates : undefined,
      });
      if (!res.ok) throw new Error(await res.text());

      // Also add a comment for the conversation thread
      await apiRequest("POST", `/api/requests/special/${selectedRequestId}/comments`, {
        comment,
        statusChange: status,
      });

      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({ title: "Done!", description: `Request ${statusConfig[variables.status]?.shortLabel}.` });
      refetchComments();
      refetchRequests();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Auto-select
  useEffect(() => {
    if (filteredRequests.length > 0 && (!selectedRequestId || !filteredRequests.find((r: any) => r.id === selectedRequestId))) {
      setSelectedRequestId(filteredRequests[0].id);
    }
  }, [filteredRequests, selectedRequestId]);

  // Sync edited dates when request changes
  useEffect(() => {
    if (selectedRequest?.requestDates && Array.isArray(selectedRequest.requestDates)) {
      setEditedRequestDates(selectedRequest.requestDates as Array<{ date: string, shiftType: string }>);
    } else {
      setEditedRequestDates([]);
    }
  }, [selectedRequest?.id, selectedRequest?.requestDates]);

  // Add date to edited list
  const addEditedDate = () => {
    if (!newDateInput || !newShiftTypeInput) return;
    const exists = editedRequestDates.some(d => d.date === newDateInput && d.shiftType === newShiftTypeInput);
    if (exists) {
      toast({ title: "Already exists", description: "This date/shift combination is already in the list.", variant: "destructive" });
      return;
    }
    setEditedRequestDates([...editedRequestDates, { date: newDateInput, shiftType: newShiftTypeInput }]);
    setNewDateInput("");
    setNewShiftTypeInput("");
  };

  // Remove date from edited list
  const removeEditedDate = (index: number) => {
    setEditedRequestDates(editedRequestDates.filter((_, i) => i !== index));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("all");
    setSelectedStatus("all");
    setSelectedEmployee("all");
    setSelectedDate("");
  };

  const hasActiveFilters = searchQuery || selectedDepartment !== "all" || selectedStatus !== "all" || selectedEmployee !== "all" || selectedDate;

  // Loading
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      {/* Compact Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatPill
            label="All"
            value={stats.total}
            dotColor="bg-slate-400"
            isActive={selectedStatus === "all"}
            onClick={() => setSelectedStatus("all")}
          />
          <StatPill
            label="Pending"
            value={stats.pending}
            dotColor="bg-blue-500"
            isActive={selectedStatus === "sent_for_approval"}
            onClick={() => setSelectedStatus("sent_for_approval")}
          />
          <StatPill
            label="Approved"
            value={stats.approved}
            dotColor="bg-emerald-500"
            isActive={selectedStatus === "approved"}
            onClick={() => setSelectedStatus("approved")}
          />
          <StatPill
            label="Rejected"
            value={stats.rejected}
            dotColor="bg-red-500"
            isActive={selectedStatus === "not_approved"}
            onClick={() => setSelectedStatus("not_approved")}
          />
          <StatPill
            label="Revision"
            value={stats.revision}
            dotColor="bg-amber-500"
            isActive={selectedStatus === "revision"}
            onClick={() => setSelectedStatus("revision")}
          />
        </div>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-slate-50 dark:bg-slate-800/50 border-0"
          />
        </div>

        {/* Month Filter */}
        <Select value={selectedMonth} onValueChange={(value) => {
          setSelectedMonth(value);
          setSelectedDate(""); // Reset date when month changes
        }}>
          <SelectTrigger className="h-8 w-[140px] text-xs bg-slate-50 dark:bg-slate-800/50 border-0">
            <CalendarDays className="h-3 w-3 mr-1.5 text-slate-400" />
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

        {/* Date Filter */}
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="h-8 w-[100px] text-xs bg-slate-50 dark:bg-slate-800/50 border-0">
            <Calendar className="h-3 w-3 mr-1.5 text-slate-400" />
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

        {/* Employee Filter */}
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="h-8 w-[140px] text-xs bg-slate-50 dark:bg-slate-800/50 border-0">
            <User className="h-3 w-3 mr-1.5 text-slate-400" />
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees
              .filter((e: any) => e.role !== 'admin' && e.role !== 'superadmin')
              .sort((a: any, b: any) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
              .map((emp: any) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Department */}
        <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
          <SelectTrigger className="h-8 w-[130px] text-xs bg-slate-50 dark:bg-slate-800/50 border-0">
            <Building2 className="h-3 w-3 mr-1.5 text-slate-400" />
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Depts</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetchRequests()}>
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
          <span className="font-semibold text-foreground">{filteredRequests.length}</span> requests
          {selectedDate && selectedDate !== "all_dates" && (
            <span> for {format(parseISO(selectedDate), "MMMM d, yyyy")}</span>
          )}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {filteredRequests.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-slate-400" />
              </div>
              <p className="font-medium text-slate-900 dark:text-white mb-1">No requests found</p>
              <p className="text-sm text-slate-500">
                {hasActiveFilters ? "Try adjusting your filters" : "No requests for this period"}
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full grid grid-cols-12 gap-3">
            {/* Request List - Compact */}
            <div className="col-span-12 lg:col-span-4 xl:col-span-3 min-h-0">
              <Card className="h-full flex flex-col overflow-hidden border-0 shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">
                      {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""}
                    </span>
                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                      <SelectTrigger className="h-6 w-20 text-[10px] border-0 bg-transparent p-0 gap-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {filteredRequests.map((request: any) => (
                      <RequestItem
                        key={request.id}
                        request={request}
                        isSelected={selectedRequestId === request.id}
                        onClick={() => setSelectedRequestId(request.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            </div>

            {/* Conversation Panel */}
            <div className="col-span-12 lg:col-span-8 xl:col-span-9 min-h-0">
              {selectedRequest ? (
                <Card className="h-full flex flex-col overflow-hidden border-0 shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
                  {/* Header - Compact */}
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className={cn(
                            "text-xs font-bold text-white bg-gradient-to-br",
                            getAvatarGradient(selectedRequest.user?.firstName || "")
                          )}>
                            {getInitials(selectedRequest.user?.firstName || "", selectedRequest.user?.lastName || "")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                              {selectedRequest.title}
                            </h3>
                            {(() => {
                              const config = statusConfig[selectedRequest.status];
                              return (
                                <Badge variant="secondary" className={cn("text-[10px] font-medium shrink-0", config.color)}>
                                  <Circle className="w-1.5 h-1.5 mr-1 fill-current" />
                                  {config.shortLabel}
                                </Badge>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {selectedRequest.user?.firstName} {selectedRequest.user?.lastName}
                            {selectedRequest.user?.department && ` • ${selectedRequest.user.department}`}
                            {" • "}
                            {format(new Date(selectedRequest.createdAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                      </div>

                      {/* Quick Actions */}
                      {selectedRequest.status === "sent_for_approval" && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                                onClick={() => quickActionMutation.mutate({
                                  status: "approved",
                                  comment: "Your request has been approved. ✓"
                                })}
                                disabled={quickActionMutation.isPending}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Approve</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 px-3 shadow-sm"
                                onClick={() => quickActionMutation.mutate({
                                  status: "not_approved",
                                  comment: "Your request has been rejected."
                                })}
                                disabled={quickActionMutation.isPending}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reject</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 border-amber-300 text-amber-600 hover:bg-amber-50"
                                onClick={() => quickActionMutation.mutate({
                                  status: "revision",
                                  comment: "Please provide more details."
                                })}
                                disabled={quickActionMutation.isPending}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Request Revision</TooltipContent>
                          </Tooltip>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => quickActionMutation.mutate({
                                status: "resolved",
                                comment: "This request has been resolved."
                              })}>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Mark Resolved
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                      {/* Original Request */}
                      <div className="flex gap-3">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className={cn(
                            "text-[10px] font-bold text-white bg-gradient-to-br",
                            getAvatarGradient(selectedRequest.user?.firstName || "")
                          )}>
                            {getInitials(selectedRequest.user?.firstName || "", selectedRequest.user?.lastName || "")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-slate-900 dark:text-white">
                              {selectedRequest.user?.firstName} {selectedRequest.user?.lastName}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {format(new Date(selectedRequest.createdAt), "h:mm a")}
                            </span>
                          </div>
                          <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-tl-md px-4 py-3">
                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {selectedRequest.details}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Request Dates Section - Always show if dates exist or request is pending */}
                      {(editedRequestDates.length > 0 || selectedRequest.status === "sent_for_approval" || (selectedRequest.requestDates && Array.isArray(selectedRequest.requestDates) && selectedRequest.requestDates.length > 0)) && (
                        <div className={cn(
                          "rounded-xl p-4 border",
                          selectedRequest.status === "approved"
                            ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                            : selectedRequest.status === "not_approved"
                              ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                              : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        )}>
                          <div className="flex items-center gap-2 mb-3">
                            <CalendarDays className={cn(
                              "h-4 w-4",
                              selectedRequest.status === "approved"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : selectedRequest.status === "not_approved"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-blue-600 dark:text-blue-400"
                            )} />
                            <span className={cn(
                              "text-sm font-medium",
                              selectedRequest.status === "approved"
                                ? "text-emerald-900 dark:text-emerald-100"
                                : selectedRequest.status === "not_approved"
                                  ? "text-red-900 dark:text-red-100"
                                  : "text-blue-900 dark:text-blue-100"
                            )}>
                              {selectedRequest.status === "approved"
                                ? "Approved Leave Dates"
                                : selectedRequest.status === "not_approved"
                                  ? "Rejected Leave Dates"
                                  : "Requested Leave Dates"}
                            </span>
                            {selectedRequest.status === "sent_for_approval" && (
                              <Badge variant="secondary" className="text-[10px] ml-auto">
                                Editable
                              </Badge>
                            )}
                            {selectedRequest.status === "approved" && (
                              <Badge className="text-[10px] ml-auto bg-emerald-500">
                                Approved
                              </Badge>
                            )}
                          </div>

                          {/* Display dates list */}
                          {(() => {
                            // Use editedRequestDates for pending, or the original requestDates for approved/rejected
                            const datesToShow = selectedRequest.status === "sent_for_approval"
                              ? editedRequestDates
                              : (selectedRequest.requestDates && Array.isArray(selectedRequest.requestDates)
                                ? selectedRequest.requestDates as Array<{ date: string, shiftType: string }>
                                : []);

                            return datesToShow.length > 0 ? (
                              <div className="space-y-2 mb-3">
                                {datesToShow.map((item, index) => (
                                  <div
                                    key={index}
                                    className={cn(
                                      "flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border",
                                      selectedRequest.status === "approved"
                                        ? "border-emerald-100 dark:border-emerald-800"
                                        : selectedRequest.status === "not_approved"
                                          ? "border-red-100 dark:border-red-800"
                                          : "border-blue-100 dark:border-blue-800"
                                    )}
                                  >
                                    <div className="flex items-center gap-2 text-sm">
                                      <Calendar className={cn(
                                        "w-3.5 h-3.5",
                                        selectedRequest.status === "approved"
                                          ? "text-emerald-500"
                                          : selectedRequest.status === "not_approved"
                                            ? "text-red-500"
                                            : "text-blue-500"
                                      )} />
                                      <span className="font-medium">{format(parseISO(item.date), "MMM d, yyyy")}</span>
                                      <span className="text-slate-400">-</span>
                                      <Badge variant="outline" className="text-xs">
                                        {getShiftLabel(item.shiftType)}
                                      </Badge>
                                    </div>
                                    {selectedRequest.status === "sent_for_approval" && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-red-500"
                                        onClick={() => removeEditedDate(index)}
                                        data-testid={`button-remove-admin-date-${index}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500 mb-3">No dates specified</p>
                            );
                          })()}

                          {/* Add new date (only for pending requests) */}
                          {selectedRequest.status === "sent_for_approval" && (
                            <div className="flex items-end gap-2 pt-2 border-t border-blue-200 dark:border-blue-700">
                              <div className="flex-1">
                                <label className="text-[10px] text-slate-500 mb-1 block">Date</label>
                                <Input
                                  type="date"
                                  value={newDateInput}
                                  onChange={(e) => setNewDateInput(e.target.value)}
                                  className="h-8 text-xs"
                                  data-testid="input-admin-new-date"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] text-slate-500 mb-1 block">Shift</label>
                                <Select value={newShiftTypeInput} onValueChange={setNewShiftTypeInput}>
                                  <SelectTrigger className="h-8 text-xs" data-testid="select-admin-shift-type">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getShiftOptionsForEmployee(selectedRequest.user).map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={addEditedDate}
                                disabled={!newDateInput || !newShiftTypeInput}
                                data-testid="button-admin-add-date"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Comments */}
                      {commentsLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="text-center py-8">
                          <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-400">Be the first to respond</p>
                        </div>
                      ) : (
                        comments.map((comment: any) => (
                          <div key={comment.id} className={cn("flex gap-3", comment.isAdminComment && "flex-row-reverse")}>
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarFallback className={cn(
                                "text-[10px] font-bold",
                                comment.isAdminComment
                                  ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-white"
                                  : cn("text-white bg-gradient-to-br", getAvatarGradient(comment.user?.firstName || ""))
                              )}>
                                {comment.isAdminComment ? "AD" : getInitials(comment.user?.firstName || "", comment.user?.lastName || "")}
                              </AvatarFallback>
                            </Avatar>
                            <div className={cn("flex-1 min-w-0", comment.isAdminComment && "flex flex-col items-end")}>
                              <div className={cn("flex items-center gap-2 mb-1", comment.isAdminComment && "flex-row-reverse")}>
                                <span className="text-xs font-medium text-slate-900 dark:text-white">
                                  {comment.isAdminComment ? "You" : `${comment.user?.firstName} ${comment.user?.lastName}`}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                                </span>
                              </div>
                              <div className={cn(
                                "rounded-2xl px-4 py-3 max-w-[85%]",
                                comment.isAdminComment
                                  ? "rounded-tr-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white"
                                  : "rounded-tl-md bg-slate-100 dark:bg-slate-800"
                              )}>
                                <p className={cn(
                                  "text-sm whitespace-pre-wrap leading-relaxed",
                                  comment.isAdminComment ? "text-white" : "text-slate-700 dark:text-slate-300"
                                )}>
                                  {comment.comment}
                                </p>

                                {comment.statusChange && (
                                  <div className={cn(
                                    "mt-2 pt-2 border-t flex items-center gap-1.5",
                                    comment.isAdminComment ? "border-white/20" : "border-slate-200 dark:border-slate-700"
                                  )}>
                                    {(() => {
                                      const config = statusConfig[comment.statusChange];
                                      const Icon = config?.icon || Circle;
                                      return (
                                        <>
                                          <Icon className="h-3 w-3" />
                                          <span className="text-[10px] font-medium">
                                            {config?.label || comment.statusChange}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>

                  {/* Response Input */}
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
                    {selectedRequest.status === "resolved" ? (
                      <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
                        <CheckCircle2 className="h-4 w-4" />
                        Request resolved
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <div className="flex-1 relative">
                          <Textarea
                            value={responseComment}
                            onChange={(e) => setResponseComment(e.target.value)}
                            placeholder="Type your response..."
                            rows={1}
                            className="min-h-[40px] max-h-[120px] resize-none pr-24 text-sm bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey && responseComment.trim()) {
                                e.preventDefault();
                                respondMutation.mutate();
                              }
                            }}
                          />
                          <div className="absolute right-2 bottom-2 flex items-center gap-1">
                            <Select value={responseStatus} onValueChange={setResponseStatus}>
                              <SelectTrigger className="h-6 w-6 p-0 border-0 bg-transparent">
                                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectItem value="no_change">No status change</SelectItem>
                                <SelectItem value="approved">
                                  <span className="flex items-center gap-2">
                                    <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
                                    Approve
                                  </span>
                                </SelectItem>
                                <SelectItem value="not_approved">
                                  <span className="flex items-center gap-2">
                                    <Circle className="h-2 w-2 fill-red-500 text-red-500" />
                                    Reject
                                  </span>
                                </SelectItem>
                                <SelectItem value="revision">
                                  <span className="flex items-center gap-2">
                                    <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                                    Revision
                                  </span>
                                </SelectItem>
                                <SelectItem value="resolved">
                                  <span className="flex items-center gap-2">
                                    <Circle className="h-2 w-2 fill-slate-500 text-slate-500" />
                                    Resolved
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => respondMutation.mutate()}
                          disabled={respondMutation.isPending || !responseComment.trim()}
                          className="h-10 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                        >
                          {respondMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                <Card className="h-full flex items-center justify-center border-0 shadow-sm bg-white/80 dark:bg-slate-900/80">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500">Select a request</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}