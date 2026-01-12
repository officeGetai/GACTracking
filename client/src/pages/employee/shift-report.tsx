import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  FileText,
  Plus,
  X,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle,
  ChevronRight,
  Loader2,
  Send,
  Video,
  Link2,
  FileCheck,
  History,
  Eye,
  ExternalLink,
  RefreshCw,
  Sparkles,
  CalendarDays,
  Search,
  Edit3,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Shift } from "@shared/schema";

// Helper function to safely parse JSON or return array
function safeParseArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      return [value];
    } catch {
      if (value.trim()) {
        return [value];
      }
      return [];
    }
  }
  return [];
}

// Validation function for Loom URLs
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
        error: "URL must be a Loom share or embed link (e.g., https://www.loom.com/share/...)",
      };
    }

    const pathParts = pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || !pathParts[1]) {
      return {
        valid: false,
        error: "Invalid Loom URL - missing video ID",
      };
    }

    return { valid: true, error: "" };
  } catch (e) {
    return { valid: false, error: "Invalid URL format" };
  }
}

// Validation function for Reference URLs (optional - only validate format if provided)
function isValidUrl(url: string): { valid: boolean; error: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: "URL cannot be empty" };
  }

  const trimmedUrl = url.trim();

  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    return { valid: false, error: "URL must start with http:// or https://" };
  }

  try {
    new URL(trimmedUrl);
    return { valid: true, error: "" };
  } catch (e) {
    return { valid: false, error: "Invalid URL format" };
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getYearOptions() {
  const years = [];
  const currentYear = new Date().getFullYear();
  for (let year = currentYear + 1; year >= currentYear - 5; year--) {
    years.push(year);
  }
  return years;
}

function getMonthOptionsForYear(year: number) {
  const months = [];
  for (let month = 0; month < 12; month++) {
    const date = new Date(year, month, 1);
    months.push({
      value: String(month + 1).padStart(2, "0"),
      label: format(date, "MMMM"),
    });
  }
  return months;
}

function StatPill({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: any;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
        "bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700"
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="font-bold text-slate-900 dark:text-white">{value}</span>
      <span className="text-slate-500 hidden sm:inline">{label}</span>
    </div>
  );
}

function ReportCard({ report, onClick }: { report: any; onClick: () => void }) {
  const reportDate = parseISO(report.date);
  const videos = safeParseArray(report.loomVideos);
  const refs = safeParseArray(report.references);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all duration-200",
        "bg-white dark:bg-slate-900 hover:shadow-lg hover:border-primary/50",
        "hover:-translate-y-0.5 group"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex flex-col items-center justify-center shrink-0">
            <span className="text-lg font-bold text-primary leading-none">
              {format(reportDate, "d")}
            </span>
            <span className="text-[10px] text-primary/70 uppercase font-medium">
              {format(reportDate, "MMM")}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {format(reportDate, "EEEE")}
              </p>
              <span className="text-[10px] text-slate-400">
                {format(reportDate, "yyyy")}
              </span>
            </div>
            <p className="text-xs text-slate-500 line-clamp-2">
              {report.workDetails?.substring(0, 100)}...
            </p>
            <div className="flex items-center gap-2 mt-2">
              {videos.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                >
                  <Video className="h-2.5 w-2.5" />
                  {videos.length}
                </Badge>
              )}
              {refs.length > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {refs.length}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </button>
  );
}

export default function ShiftReportPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const today = getToday();
  const currentMonth = getCurrentMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;

  // States
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonthNum, setSelectedMonthNum] = useState(
    String(currentMonthNum).padStart(2, "0")
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("submit");

  const selectedMonth = `${selectedYear}-${selectedMonthNum}`;

  // Form state
  const [workDetails, setWorkDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [loomVideos, setLoomVideos] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [newVideoLink, setNewVideoLink] = useState("");
  const [newReference, setNewReference] = useState("");

  // Error states
  const [videoLinkError, setVideoLinkError] = useState("");
  const [referenceLinkError, setReferenceLinkError] = useState("");
  const [workDetailsError, setWorkDetailsError] = useState("");

  // Get today's status
  const { data: todayStatus, isLoading: statusLoading } = useQuery<{
    shift: Shift | null;
    hasSubmittedReport: boolean;
  }>({
    queryKey: ["/api/employee/today"],
    refetchInterval: 1000,
  });

  const todayShift = todayStatus?.shift;
  const hasSubmittedReport = todayStatus?.hasSubmittedReport;

  // Get all reports for selected month
  const {
    data: reports = [],
    isLoading: reportsLoading,
    refetch: refetchReports,
    error: reportsError,
  } = useQuery({
    queryKey: ["my-reports", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/reports/daily/my?month=${selectedMonth}`
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch reports");
      }
      return res.json();
    },
    staleTime: 0,
  });

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let filtered = [...reports];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r: any) =>
          r.workDetails?.toLowerCase().includes(query) ||
          r.notes?.toLowerCase().includes(query)
      );
    }

    if (selectedDate) {
      filtered = filtered.filter((r: any) => r.date === selectedDate);
    }

    return filtered.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [reports, searchQuery, selectedDate]);

  // Stats
  const stats = useMemo(() => {
    const total = reports.length;
    let totalVideos = 0;
    let totalRefs = 0;

    reports.forEach((r: any) => {
      totalVideos += safeParseArray(r.loomVideos).length;
      totalRefs += safeParseArray(r.references).length;
    });

    return { total, totalVideos, totalRefs };
  }, [reports]);

  const { data: currentMonthReports = [] } = useQuery({
    queryKey: ["my-reports", currentMonth],
    queryFn: async () => {
      if (selectedMonth === currentMonth) return reports;
      const res = await apiRequest(
        "GET",
        `/api/reports/daily/my?month=${currentMonth}`
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: selectedMonth !== currentMonth,
  });

  const currentMonthStats = useMemo(() => {
    const reportsToCount =
      selectedMonth === currentMonth ? reports : currentMonthReports;
    return { total: reportsToCount.length };
  }, [reports, currentMonthReports, selectedMonth, currentMonth]);

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { videos: string[]; refs: string[] }) => {
      const { videos, refs } = data;

      // Validate videos format (only if provided)
      for (const video of videos) {
        const validation = isValidLoomUrl(video);
        if (!validation.valid) {
          throw new Error(`Invalid Loom URL: ${validation.error}`);
        }
      }

      const url = editingReportId
        ? `/api/reports/daily/${editingReportId}`
        : "/api/reports/daily";
      const method = editingReportId ? "PATCH" : "POST";

      const res = await apiRequest(method, url, {
        shiftId: todayShift?.id,
        date: today,
        workDetails: workDetails.trim(),
        notes: notes.trim(),
        loomVideos: videos.length > 0 ? JSON.stringify(videos) : null,
        references: refs.length > 0 ? JSON.stringify(refs) : "",
        month: currentMonth,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to submit report");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: editingReportId ? "Report Updated!" : "Report Submitted!",
        description: editingReportId
          ? "Your daily shift report has been updated successfully."
          : "Your daily shift report has been saved successfully.",
      });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/employee/today"] });
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      refetchReports();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit report",
        variant: "destructive",
      });
    },
  });

  // Reset form helper
  const resetForm = () => {
    setWorkDetails("");
    setNotes("");
    setLoomVideos([]);
    setReferences([]);
    setEditingReportId(null);
    setVideoLinkError("");
    setReferenceLinkError("");
    setWorkDetailsError("");
    setNewVideoLink("");
    setNewReference("");
  };

  // Add video link
  const addVideoLink = () => {
    const trimmedUrl = newVideoLink.trim();

    if (!trimmedUrl) {
      setVideoLinkError("Please enter a URL");
      return;
    }

    const validation = isValidLoomUrl(trimmedUrl);
    if (!validation.valid) {
      setVideoLinkError(validation.error);
      toast({
        title: "Invalid Loom URL",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    if (loomVideos.includes(trimmedUrl)) {
      setVideoLinkError("This video link has already been added");
      toast({
        title: "Duplicate Link",
        description: "This video link has already been added.",
        variant: "destructive",
      });
      return;
    }

    setLoomVideos((prev) => [...prev, trimmedUrl]);
    setNewVideoLink("");
    setVideoLinkError("");

    toast({
      title: "Video Added",
      description: "Loom video link added successfully.",
    });
  };

  const removeVideoLink = (index: number) => {
    setLoomVideos((prev) => prev.filter((_, i) => i !== index));
  };

  // Add reference
  const addReference = () => {
    const trimmedRef = newReference.trim();

    if (!trimmedRef) {
      setReferenceLinkError("Please enter a reference link");
      toast({
        title: "Input Required",
        description: "Please enter a reference link before adding.",
        variant: "destructive",
      });
      return;
    }

    const validation = isValidUrl(trimmedRef);
    if (!validation.valid) {
      setReferenceLinkError(validation.error);
      toast({
        title: "Invalid URL",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    if (references.includes(trimmedRef)) {
      setReferenceLinkError("This reference has already been added");
      toast({
        title: "Duplicate Reference",
        description: "This reference link has already been added.",
        variant: "destructive",
      });
      return;
    }

    setReferences((prev) => [...prev, trimmedRef]);
    setNewReference("");
    setReferenceLinkError("");

    toast({
      title: "Reference Added",
      description: "Reference link added to list successfully.",
    });
  };

  const removeReference = (index: number) => {
    setReferences((prev) => prev.filter((_, i) => i !== index));
  };

  const viewReport = (report: any) => {
    setSelectedReport(report);
    setViewDialogOpen(true);
  };

  const handleEdit = (report: any) => {
    setEditingReportId(report.id);
    setWorkDetails(report.workDetails || "");
    setNotes(report.notes || "");
    setLoomVideos(safeParseArray(report.loomVideos));
    setReferences(safeParseArray(report.references));
    setViewDialogOpen(false);
    setActiveTab("submit");
    setVideoLinkError("");
    setReferenceLinkError("");
    setWorkDetailsError("");
    setNewVideoLink("");
    setNewReference("");

    toast({
      title: "Edit Mode",
      description:
        "You are now editing your report for " +
        format(parseISO(report.date), "MMM d, yyyy"),
    });
  };

  const cancelEdit = () => {
    resetForm();
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDate("");
  };

  const hasActiveFilters = searchQuery || selectedDate;

  const handleYearChange = (year: string) => {
    setSelectedYear(Number(year));
    setSelectedDate("");
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonthNum(month);
    setSelectedDate("");
  };

  const handleVideoLinkInputChange = (value: string) => {
    setNewVideoLink(value);
    if (videoLinkError) {
      setVideoLinkError("");
    }
  };

  const handleReferenceInputChange = (value: string) => {
    setNewReference(value);
    if (referenceLinkError) {
      setReferenceLinkError("");
    }
  };

  const handleWorkDetailsChange = (value: string) => {
    setWorkDetails(value);
    if (workDetailsError) {
      setWorkDetailsError("");
    }
  };

  // Form submission - ONLY Work Details is required
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let hasErrors = false;

    // 1. VALIDATE WORK DETAILS (REQUIRED)
    if (!workDetails.trim()) {
      setWorkDetailsError("Work details are required");
      toast({
        title: "Missing Work Details",
        description: "Please describe what you worked on today.",
        variant: "destructive",
      });
      hasErrors = true;
    }

    if (hasErrors) return;

    // 2. PROCESS LOOM VIDEOS (OPTIONAL - but validate format if provided)
    let finalVideos = [...loomVideos];
    const currentVideoInput = newVideoLink.trim();

    if (currentVideoInput) {
      const validation = isValidLoomUrl(currentVideoInput);

      if (!validation.valid) {
        setVideoLinkError(validation.error);
        toast({
          title: "Invalid Video Link",
          description: validation.error,
          variant: "destructive",
        });
        return;
      } else if (finalVideos.includes(currentVideoInput)) {
        setVideoLinkError("This video link has already been added");
        toast({
          title: "Duplicate Link",
          description: "This video has already been added.",
          variant: "destructive",
        });
        return;
      } else {
        finalVideos.push(currentVideoInput);
      }
    }

    // 3. PROCESS REFERENCES (OPTIONAL - but validate format if provided)
    let finalReferences = [...references];
    const currentRefInput = newReference.trim();

    if (currentRefInput) {
      const validation = isValidUrl(currentRefInput);

      if (!validation.valid) {
        setReferenceLinkError(validation.error);
        toast({
          title: "Invalid Reference URL",
          description: validation.error,
          variant: "destructive",
        });
        return;
      } else if (!finalReferences.includes(currentRefInput)) {
        finalReferences.push(currentRefInput);
      }
    }

    // 4. SUBMIT - No minimum requirements for videos or references
    submitMutation.mutate({ videos: finalVideos, refs: finalReferences });
  };

  if (statusLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="submit" className="gap-2 text-xs sm:text-sm">
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {editingReportId ? "Edit" : "Submit"}
                </span>{" "}
                Report
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 text-xs sm:text-sm">
                <History className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
            </TabsList>

            <Badge variant="outline" className="gap-1 hidden sm:flex">
              <CalendarIcon className="h-3 w-3" />
              {format(new Date(), "MMM d, yyyy")}
            </Badge>
          </div>

          {/* Submit Report Tab */}
          <TabsContent value="submit" className="space-y-4 mt-4">
            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500 text-white">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        Today's Shift
                      </p>
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                        {todayShift?.morningClockIn
                          ? format(new Date(todayShift.morningClockIn), "h:mm a")
                          : "Not Started"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "border-0 shadow-sm",
                  hasSubmittedReport
                    ? "bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/50 dark:to-emerald-900/30"
                    : "bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/50 dark:to-amber-900/30"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg text-white",
                        hasSubmittedReport ? "bg-emerald-500" : "bg-amber-500"
                      )}
                    >
                      {hasSubmittedReport ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p
                        className={cn(
                          "text-xs font-medium",
                          hasSubmittedReport
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        Today's Report
                      </p>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          hasSubmittedReport
                            ? "text-emerald-900 dark:text-emerald-100"
                            : "text-amber-900 dark:text-amber-100"
                        )}
                      >
                        {hasSubmittedReport ? "Submitted" : "Pending"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/50 dark:to-purple-900/30">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500 text-white">
                      <FileCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                        This Month
                      </p>
                      <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                        {currentMonthStats.total} Report
                        {currentMonthStats.total !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Report Form */}
            {!todayShift ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No active shift found for today. Please start your shift first
                  to submit a report.
                </AlertDescription>
              </Alert>
            ) : hasSubmittedReport && !editingReportId ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    Report Already Submitted
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    You have already submitted your daily report for today.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("history")}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View History
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {editingReportId ? "Edit" : "Submit"} Report
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {editingReportId
                          ? `Updating report for ${format(parseISO(selectedReport?.date || today), "EEEE, MMMM d, yyyy")}`
                          : format(new Date(), "EEEE, MMMM d, yyyy")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleFormSubmit} className="space-y-5">
                    {/* Work Details - REQUIRED */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="workDetails"
                        className="text-sm font-semibold"
                      >
                        Work Details <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="workDetails"
                        value={workDetails}
                        onChange={(e) => handleWorkDetailsChange(e.target.value)}
                        placeholder="What did you work on today? List your tasks, meetings, achievements..."
                        rows={5}
                        className={cn(
                          "resize-none",
                          workDetailsError &&
                          "border-red-500 focus-visible:ring-red-500"
                        )}
                      />
                      {workDetailsError && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {workDetailsError}
                        </p>
                      )}
                    </div>

                    {/* Notes - Optional */}
                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-sm font-semibold">
                        Additional Notes{" "}
                        <span className="text-muted-foreground font-normal text-xs">
                          (Optional)
                        </span>
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any blockers, questions, or notes..."
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    {/* Loom Videos - OPTIONAL */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Video className="h-4 w-4 text-red-500" />
                        Loom Video Links{" "}
                        <span className="text-muted-foreground font-normal text-xs">
                          (Optional)
                        </span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Only valid Loom URLs are accepted (e.g.,
                        https://www.loom.com/share/abc123)
                      </p>
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={newVideoLink}
                            onChange={(e) =>
                              handleVideoLinkInputChange(e.target.value)
                            }
                            placeholder="https://www.loom.com/share/..."
                            className={cn(
                              "text-sm",
                              videoLinkError &&
                              "border-red-500 focus-visible:ring-red-500"
                            )}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addVideoLink();
                              }
                            }}
                            onBlur={() => {
                              if (newVideoLink.trim()) {
                                const val = isValidLoomUrl(newVideoLink.trim());
                                if (!val.valid) setVideoLinkError(val.error);
                              }
                            }}
                          />
                          {videoLinkError && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {videoLinkError}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          onClick={addVideoLink}
                          size="icon"
                          variant="outline"
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {loomVideos.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-xs text-muted-foreground">
                            Added videos ({loomVideos.length}):
                          </p>
                          {loomVideos.map((video, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                            >
                              <Video className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              <a
                                href={video}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-red-700 dark:text-red-400 truncate flex-1 hover:underline"
                              >
                                {video}
                              </a>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeVideoLink(index)}
                                className="h-6 w-6 shrink-0 hover:bg-red-100 dark:hover:bg-red-900/40"
                              >
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* References - OPTIONAL */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-blue-500" />
                        Reference Links{" "}
                        <span className="text-muted-foreground font-normal text-xs">
                          (Optional)
                        </span>
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Add links to PRs, documents, designs, or any related
                        resources
                      </p>
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={newReference}
                            onChange={(e) =>
                              handleReferenceInputChange(e.target.value)
                            }
                            placeholder="https://github.com/... or https://docs.google.com/..."
                            className={cn(
                              "text-sm",
                              referenceLinkError &&
                              "border-red-500 focus-visible:ring-red-500"
                            )}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addReference();
                              }
                            }}
                            onBlur={() => {
                              if (newReference.trim()) {
                                const val = isValidUrl(newReference.trim());
                                if (!val.valid)
                                  setReferenceLinkError(val.error);
                              }
                            }}
                          />
                          {referenceLinkError && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {referenceLinkError}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          onClick={addReference}
                          size="icon"
                          variant="outline"
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {references.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-xs text-muted-foreground">
                            Added references ({references.length}):
                          </p>
                          {references.map((ref, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                            >
                              <Link2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <a
                                href={ref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-700 dark:text-blue-400 truncate flex-1 hover:underline"
                              >
                                {ref}
                              </a>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeReference(index)}
                                className="h-6 w-6 shrink-0 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                              >
                                <X className="h-3 w-3 text-blue-500" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {editingReportId ? "Updating..." : "Submitting..."}
                        </>
                      ) : (
                        <>
                          {editingReportId ? (
                            <FileCheck className="h-4 w-4 mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          {editingReportId ? "Update Report" : "Submit Report"}
                        </>
                      )}
                    </Button>

                    {editingReportId && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full mt-2"
                        onClick={cancelEdit}
                      >
                        Cancel Editing
                      </Button>
                    )}
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 mr-2">
                <StatPill
                  icon={FileText}
                  value={stats.total}
                  label="Reports"
                  color="text-slate-500"
                />
                {stats.totalVideos > 0 && (
                  <StatPill
                    icon={Video}
                    value={stats.totalVideos}
                    label="Videos"
                    color="text-red-500"
                  />
                )}
                {stats.totalRefs > 0 && (
                  <StatPill
                    icon={Link2}
                    value={stats.totalRefs}
                    label="Links"
                    color="text-blue-500"
                  />
                )}
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
              <div className="relative flex-1 min-w-[150px] max-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search reports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                />
              </div>
              <Select
                value={String(selectedYear)}
                onValueChange={handleYearChange}
              >
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
              <Select value={selectedMonthNum} onValueChange={handleMonthChange}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                  <CalendarIcon className="h-3 w-3 mr-1.5 text-slate-400" />
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 min-w-[110px] text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 justify-start"
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                    {selectedDate
                      ? format(parseISO(selectedDate), "MMM d")
                      : "All Days"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={
                      selectedDate ? parseISO(selectedDate) : undefined
                    }
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(format(date, "yyyy-MM-dd"));
                      } else {
                        setSelectedDate("");
                      }
                    }}
                    initialFocus
                    month={new Date(selectedYear, parseInt(selectedMonthNum) - 1)}
                    onMonthChange={() => { }}
                  />
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-1 ml-auto">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={clearFilters}
                  >
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
                      onClick={() => refetchReports()}
                      disabled={reportsLoading}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          reportsLoading && "animate-spin"
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {filteredReports.length}
                </span>{" "}
                reports
                {selectedDate && (
                  <span>
                    {" "}
                    for {format(parseISO(selectedDate), "MMMM d, yyyy")}
                  </span>
                )}
                {!selectedDate && (
                  <span>
                    {" "}
                    in {format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}
                  </span>
                )}
              </p>
            </div>
            {reportsError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    {(reportsError as Error).message || "Failed to load reports"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchReports()}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {reportsLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Loading reports...
                </p>
              </div>
            ) : filteredReports.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="py-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Reports Found</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {hasActiveFilters
                      ? "Try adjusting your filters"
                      : `No reports for ${format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}`}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      <X className="h-3 w-3 mr-1" />
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredReports.map((report: any) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    onClick={() => viewReport(report)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* View Report Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {selectedReport && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg">Daily Report</p>
                      <p className="text-sm text-muted-foreground font-normal">
                        {format(
                          parseISO(selectedReport.date),
                          "EEEE, MMMM d, yyyy"
                        )}
                      </p>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-4">
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
                  {selectedReport.notes && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">
                        Additional Notes
                      </h4>
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedReport.notes}
                        </p>
                      </div>
                    </div>
                  )}
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
                              className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors group"
                            >
                              <Video className="h-4 w-4 text-red-500 shrink-0" />
                              <span className="text-sm text-red-700 dark:text-red-400 truncate flex-1">
                                {video}
                              </span>
                              <ExternalLink className="h-3 w-3 text-red-400 group-hover:text-red-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
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
                              className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors group"
                            >
                              <Link2 className="h-4 w-4 text-blue-500 shrink-0" />
                              <span className="text-sm text-blue-700 dark:text-blue-400 truncate flex-1">
                                {ref}
                              </span>
                              <ExternalLink className="h-3 w-3 text-blue-400 group-hover:text-blue-600 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Submitted:{" "}
                      {format(
                        new Date(selectedReport.createdAt),
                        "MMM d, yyyy 'at' h:mm a"
                      )}
                    </span>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setViewDialogOpen(false)}
                      className="px-6"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={() => handleEdit(selectedReport)}
                      className="px-6 gap-2"
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit Report
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
}