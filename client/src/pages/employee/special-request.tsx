// client/src/pages/employee/special-request.tsx
import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Send,
  MessageCircle,
  RefreshCw,
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  Calendar,
  CalendarDays,
  Search,
  X,
  Filter,
  ChevronRight,
  Sparkles,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

// Get current month in LOCAL time
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Generate year options
function getYearOptions() {
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let year = currentYear + 1; year >= currentYear - 5; year--) {
    years.push(year);
  }
  return years;
}

// Generate month options for a specific year
function getMonthOptionsForYear(year: number) {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (let month = 0; month < 12; month++) {
    if (year === currentYear && month > currentMonth + 1) continue;
    
    const date = new Date(year, month, 1);
    months.push({
      value: String(month + 1).padStart(2, '0'),
      label: format(date, "MMMM"),
    });
  }
  return months;
}

const statusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string; dotColor: string }> = {
  sent_for_approval: {
    label: "Pending",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    dotColor: "bg-blue-500",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    dotColor: "bg-green-500",
    icon: CheckCircle,
  },
  not_approved: {
    label: "Rejected",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    dotColor: "bg-red-500",
    icon: XCircle,
  },
  revision: {
    label: "Revision",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    dotColor: "bg-yellow-500",
    icon: RotateCcw,
  },
  resolved: {
    label: "Resolved",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
    dotColor: "bg-gray-500",
    icon: CheckCircle,
  },
};

// Stat Pill Component
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
          : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
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

export default function SpecialRequestPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Local time calculations
  const currentMonth = getCurrentMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;

  // Filter states
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonthNum, setSelectedMonthNum] = useState(String(currentMonthNum).padStart(2, '0'));
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Computed month string for API
  const selectedMonth = `${selectedYear}-${selectedMonthNum}`;

  // UI states
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  
  // New request date management
  const [requestDates, setRequestDates] = useState<Array<{date: string, shiftType: string}>>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedShiftType, setSelectedShiftType] = useState("");
  
  // Get shift type options based on user's shift configuration
  const getShiftTypeOptions = () => {
    if (!user) return [];
    
    switch (user.shiftType) {
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
  
  const shiftTypeOptions = getShiftTypeOptions();
  
  // Add date to list
  const addDateToList = () => {
    if (!selectedDate || !selectedShiftType) return;
    
    // Check if this date/shift combination already exists
    const exists = requestDates.some(
      d => d.date === selectedDate && d.shiftType === selectedShiftType
    );
    
    if (exists) {
      toast({
        title: "Already Added",
        description: "This date and shift combination is already in your list.",
        variant: "destructive",
      });
      return;
    }
    
    setRequestDates([...requestDates, { date: selectedDate, shiftType: selectedShiftType }]);
    setSelectedDate("");
    setSelectedShiftType("");
  };
  
  // Remove date from list
  const removeDateFromList = (index: number) => {
    setRequestDates(requestDates.filter((_, i) => i !== index));
  };
  
  // Reset form
  const resetRequestForm = () => {
    setTitle("");
    setDetails("");
    setRequestDates([]);
    setSelectedDate("");
    setSelectedShiftType("");
  };
  
  // Get shift label
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

  // Fetch requests for selected month
  const {
    data: myRequests = [],
    isLoading,
    refetch: refetchRequests,
    error: requestsError,
  } = useQuery({
    queryKey: ["my-special-requests", selectedMonth],
    queryFn: async () => {
      console.log("Employee: Fetching special requests for month:", selectedMonth);
      const res = await apiRequest("GET", `/api/requests/special/my?month=${selectedMonth}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to fetch requests:", errorData);
        throw new Error(errorData.error || "Failed to fetch requests");
      }
      const data = await res.json();
      console.log("Employee: Received requests:", data.length, data);
      return data;
    },
    staleTime: 0,
    refetchInterval: 1000,
  });

  // Filter and sort requests
  const filteredRequests = useMemo(() => {
    let filtered = [...myRequests];

    // Filter by status
    if (selectedStatus !== "all") {
      filtered = filtered.filter((r: any) => r.status === selectedStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((r: any) =>
        r.title?.toLowerCase().includes(query) ||
        r.details?.toLowerCase().includes(query)
      );
    }

    // Sort by date (newest first)
    return filtered.sort((a: any, b: any) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [myRequests, selectedStatus, searchQuery]);

  // Fetch comments for selected request
  const {
    data: comments = [],
    refetch: refetchComments,
    isLoading: commentsLoading,
  } = useQuery({
    queryKey: ["request-comments", selectedRequestId],
    queryFn: async () => {
      if (!selectedRequestId) return [];
      const res = await apiRequest("GET", `/api/requests/special/${selectedRequestId}/comments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedRequestId,
    refetchInterval: 1000,
  });

  const selectedRequest = filteredRequests.find((r: any) => r.id === selectedRequestId);

  // Stats for current selection
  const stats = useMemo(() => ({
    total: myRequests.length,
    pending: myRequests.filter((r: any) => r.status === "sent_for_approval").length,
    approved: myRequests.filter((r: any) => r.status === "approved").length,
    rejected: myRequests.filter((r: any) => r.status === "not_approved").length,
    revision: myRequests.filter((r: any) => r.status === "revision").length,
  }), [myRequests]);

  // Create request mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/requests/special", {
        title,
        details,
        month: currentMonth, // Always use current month for new requests
        requestDates: requestDates, // New: include the dates and shifts
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Request submitted successfully!" });
      resetRequestForm();
      setNewRequestOpen(false);
      // Reset to current month to see the new request
      setSelectedYear(currentYear);
      setSelectedMonthNum(String(currentMonthNum).padStart(2, '0'));
      queryClient.invalidateQueries({ queryKey: ["my-special-requests"] });
      refetchRequests();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequestId) throw new Error("No request selected");
      const res = await apiRequest("POST", `/api/requests/special/${selectedRequestId}/comments`, {
        comment: commentText,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Reply sent!" });
      setCommentText("");
      refetchComments();
      refetchRequests();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Auto-select first request when list changes
  useEffect(() => {
    if (filteredRequests.length > 0 && (!selectedRequestId || !filteredRequests.find((r: any) => r.id === selectedRequestId))) {
      setSelectedRequestId(filteredRequests[0].id);
    } else if (filteredRequests.length === 0) {
      setSelectedRequestId(null);
    }
  }, [filteredRequests, selectedRequestId]);

  // Clear filters
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedStatus("all");
  };

  const hasActiveFilters = searchQuery || selectedStatus !== "all";

  // Handle year/month change
  const handleYearChange = (year: string) => {
    setSelectedYear(Number(year));
    setSelectedRequestId(null);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonthNum(month);
    setSelectedRequestId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Compact Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
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
              dotColor="bg-green-500"
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
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Search */}
          <div className="relative flex-1 min-w-[150px] max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Year Filter */}
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="h-8 w-[90px] text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <CalendarDays className="h-3 w-3 mr-1.5 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getYearOptions().map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month Filter */}
          <Select value={selectedMonthNum} onValueChange={handleMonthChange}>
            <SelectTrigger className="h-8 w-[120px] text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <Calendar className="h-3 w-3 mr-1.5 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getMonthOptionsForYear(selectedYear).map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => refetchRequests()}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button size="sm" className="h-8" onClick={() => setNewRequestOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </div>
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredRequests.length}</span> requests
            {" in "}
            <span className="font-medium">{format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}</span>
          </p>
        </div>

        {/* Error State */}
        {requestsError && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{(requestsError as Error).message}</span>
              <Button variant="outline" size="sm" onClick={() => refetchRequests()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Main Content */}
        {filteredRequests.length === 0 ? (
          <Card className="py-12">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">No Requests Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : `No requests for ${format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}`}
              </p>
              <div className="flex items-center justify-center gap-2">
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    <X className="h-3 w-3 mr-1" />
                    Clear Filters
                  </Button>
                )}
                <Button onClick={() => setNewRequestOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Request
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Request List */}
            <div className="lg:col-span-4">
              <Card className="h-[550px] flex flex-col border-0 shadow-sm">
                <CardHeader className="pb-2 shrink-0 border-b">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Requests
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {filteredRequests.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-2 space-y-1">
                      {filteredRequests.map((request: any) => {
                        const config = statusConfig[request.status] || statusConfig.sent_for_approval;
                        const StatusIcon = config.icon;
                        const isSelected = selectedRequestId === request.id;
                        
                        return (
                          <button
                            key={request.id}
                            onClick={() => setSelectedRequestId(request.id)}
                            className={cn(
                              "w-full text-left p-3 rounded-lg transition-all duration-200",
                              "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                              isSelected && "bg-primary/5 border border-primary/20 shadow-sm"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className="relative shrink-0">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center",
                                  config.bgColor
                                )}>
                                  <StatusIcon className={cn("w-4 h-4", config.color)} />
                                </div>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <h4 className="font-medium text-sm truncate">
                                    {request.title}
                                  </h4>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {format(new Date(request.createdAt), "MMM d")}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-1 mb-1">
                                  {request.details}
                                </p>
                                <Badge 
                                  variant="secondary" 
                                  className={cn("text-[9px] px-1.5 py-0", config.bgColor, config.color)}
                                >
                                  {config.label}
                                </Badge>
                              </div>
                              
                              {isSelected && (
                                <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Conversation Thread */}
            <div className="lg:col-span-8">
              {selectedRequest ? (
                <Card className="h-[550px] flex flex-col border-0 shadow-sm">
                  {/* Header */}
                  <CardHeader className="pb-3 shrink-0 border-b">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{selectedRequest.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(selectedRequest.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      {(() => {
                        const config = statusConfig[selectedRequest.status];
                        const StatusIcon = config.icon;
                        return (
                          <Badge className={cn("shrink-0 text-xs", config.bgColor, config.color)}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {config.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </CardHeader>

                  {/* Messages */}
                  <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-4 space-y-4">
                        {/* Original Request */}
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary text-primary-foreground p-4">
                            <p className="text-xs font-medium opacity-80 mb-2 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              Your Request
                            </p>
                            <p className="text-sm whitespace-pre-wrap">{selectedRequest.details}</p>
                            <p className="text-xs opacity-60 mt-2 text-right">
                              {format(new Date(selectedRequest.createdAt), "h:mm a")}
                            </p>
                          </div>
                        </div>

                        {/* Request Dates - Always show if dates exist */}
                        {selectedRequest.requestDates && Array.isArray(selectedRequest.requestDates) && selectedRequest.requestDates.length > 0 && (
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
                              {selectedRequest.status === "approved" && (
                                <Badge className="text-[10px] ml-auto bg-emerald-500">
                                  Approved
                                </Badge>
                              )}
                            </div>
                            
                            <div className="space-y-2">
                              {(selectedRequest.requestDates as Array<{date: string, shiftType: string}>).map((item, index) => (
                                <div
                                  key={index}
                                  className={cn(
                                    "flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border text-sm",
                                    selectedRequest.status === "approved" 
                                      ? "border-emerald-100 dark:border-emerald-800"
                                      : selectedRequest.status === "not_approved"
                                      ? "border-red-100 dark:border-red-800"
                                      : "border-blue-100 dark:border-blue-800"
                                  )}
                                >
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
                                    {item.shiftType === "morning" ? "Morning Shift" 
                                      : item.shiftType === "evening" ? "Evening Shift"
                                      : item.shiftType === "both" ? "Both Shifts"
                                      : "Complete Shift"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Comments */}
                        {commentsLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : comments.length === 0 ? (
                          <div className="text-center py-8">
                            <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Waiting for response...
                            </p>
                          </div>
                        ) : (
                          comments.map((comment: any) => (
                            <div
                              key={comment.id}
                              className={cn("flex", comment.isAdminComment ? "justify-start" : "justify-end")}
                            >
                              <div
                                className={cn(
                                  "max-w-[85%] rounded-2xl p-4",
                                  comment.isAdminComment
                                    ? "rounded-tl-md bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/40 dark:to-indigo-900/40"
                                    : "rounded-tr-md bg-slate-100 dark:bg-slate-800"
                                )}
                              >
                                <p className={cn(
                                  "text-xs font-medium mb-2",
                                  comment.isAdminComment ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                                )}>
                                  {comment.isAdminComment ? "👔 Admin" : "You"}
                                </p>
                                <p className="text-sm whitespace-pre-wrap">{comment.comment}</p>
                                
                                {comment.statusChange && (
                                  <div className="mt-3 pt-2 border-t border-current/10">
                                    {(() => {
                                      const config = statusConfig[comment.statusChange];
                                      return (
                                        <Badge className={cn("text-[10px]", config?.bgColor, config?.color)}>
                                          Status: {config?.label || comment.statusChange}
                                        </Badge>
                                      );
                                    })()}
                                  </div>
                                )}
                                
                                <p className="text-[10px] text-muted-foreground mt-2 text-right">
                                  {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>

                  {/* Reply Input */}
                  <div className="p-3 border-t shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
                    {selectedRequest.status === "resolved" ? (
                      <Alert className="py-2">
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          This request has been resolved.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="flex gap-2">
                        <Textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Type your reply..."
                          rows={1}
                          className="flex-1 resize-none text-sm min-h-[40px] max-h-[80px]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                              e.preventDefault();
                              addCommentMutation.mutate();
                            }
                          }}
                        />
                        <Button
                          onClick={() => addCommentMutation.mutate()}
                          disabled={addCommentMutation.isPending || !commentText.trim()}
                          className="self-end h-10 px-4"
                        >
                          {addCommentMutation.isPending ? (
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
                <Card className="h-[550px] flex items-center justify-center border-0 shadow-sm">
                  <div className="text-center">
                    <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">Select a request to view conversation</p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* New Request Dialog */}
        <Dialog open={newRequestOpen} onOpenChange={(open) => {
          setNewRequestOpen(open);
          if (!open) resetRequestForm();
        }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                New Request
              </DialogTitle>
              <DialogDescription>
                Submit a request for leave, remote work, or other arrangements.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Date and Shift Selection */}
              <div className="space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Add Leave Dates
                </Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="request-date" className="text-xs text-muted-foreground">
                      Date
                    </Label>
                    <Input
                      id="request-date"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-9"
                      data-testid="input-request-date"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="shift-type" className="text-xs text-muted-foreground">
                      Shift Type
                    </Label>
                    <Select value={selectedShiftType} onValueChange={setSelectedShiftType}>
                      <SelectTrigger className="h-9" data-testid="select-shift-type">
                        <SelectValue placeholder="Select shift" />
                      </SelectTrigger>
                      <SelectContent>
                        {shiftTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addDateToList}
                  disabled={!selectedDate || !selectedShiftType}
                  data-testid="button-add-date"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Date
                </Button>
                
                {/* List of added dates */}
                {requestDates.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs text-muted-foreground">Added Dates ({requestDates.length})</Label>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {requestDates.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-3.5 h-3.5 text-primary" />
                            <span className="font-medium">{format(parseISO(item.date), "MMM d, yyyy")}</span>
                            <span className="text-muted-foreground">-</span>
                            <Badge variant="secondary" className="text-xs">
                              {getShiftLabel(item.shiftType)}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => removeDateFromList(index)}
                            data-testid={`button-remove-date-${index}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Leave Request - Family Event"
                  data-testid="input-request-title"
                />
              </div>

              {/* Details */}
              <div className="space-y-2">
                <Label htmlFor="details">
                  Details <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide reasons and any relevant information..."
                  rows={4}
                  data-testid="input-request-details"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRequestOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !title.trim() || !details.trim() || requestDates.length === 0}
                data-testid="button-submit-request"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}