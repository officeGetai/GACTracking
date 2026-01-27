import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    Zap,
    Search,
    Filter,
    Play,
    RotateCcw,
    XSquare,
    Users,
    Clock,
    Sun,
    Sunrise,
    Calendar,
    AlertCircle,
    CheckCircle2,
    MoreVertical,
    Activity,
    History,
    Timer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shift, SafeUser, Break } from "@shared/schema";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Types
type ShiftWithUser = Shift & { user: SafeUser; breaks: Break[] };

const getPakistanTime = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (5 * 60 * 60000));
};

export default function AdminShiftControl() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const { toast } = useToast();

    const { data: shifts, isLoading, refetch } = useQuery<ShiftWithUser[]>({
        queryKey: ["/api/admin/shifts/today"], // Reusing the today shifts endpoint
        refetchInterval: 30000,
    });

    const { data: employees } = useQuery<SafeUser[]>({
        queryKey: ["/api/admin/employees"],
    });

    const controlMutation = useMutation({
        mutationFn: async ({ action, data }: { action: string, data: any }) => {
            const res = await apiRequest("POST", `/api/admin/shifts/control/${action}`, data);
            return res.json();
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/shifts/today"] });
            toast({
                title: "Action Successful",
                description: `Shift was successfully ${variables.action.replace("-", " ")}ed.`,
                className: "bg-emerald-500 text-white border-none shadow-emerald-500/20",
            });
        },
        onError: (error: Error) => {
            toast({
                title: "Action Failed",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleStartShift = (userId: string, period: "morning" | "evening") => {
        controlMutation.mutate({
            action: "start",
            data: { userId, period, timestamp: new Date().toISOString() }
        });
    };

    const handleResumeShift = (shiftId: string, period: "morning" | "evening") => {
        controlMutation.mutate({
            action: "resume",
            data: { shiftId, period }
        });
    };

    const handleForceClose = (shiftId: string, period: "morning" | "evening") => {
        controlMutation.mutate({
            action: "force-close",
            data: { shiftId, period, timestamp: new Date().toISOString() }
        });
    };

    // Combine employees and today's shifts
    const controlData = (employees || []).map(employee => {
        const shift = (shifts || []).find(s => s.userId === employee.id);
        return { employee, shift };
    });

    const filteredData = controlData.filter(item => {
        const query = searchQuery.toLowerCase().trim();

        // Search logic
        if (query) {
            const queryTerms = query.split(/\s+/).filter(term => term.length > 0);
            const searchableText = `
                ${item.employee.firstName} 
                ${item.employee.lastName} 
                ${item.employee.username} 
                ${item.employee.department || ""}
            `.toLowerCase();

            const matchesSearch = queryTerms.every(term => searchableText.includes(term));
            if (!matchesSearch) return false;
        }

        // Tab logic
        if (activeTab === "active") {
            return item.shift && (
                (item.shift.morningClockIn && !item.shift.morningClockOut) ||
                (item.shift.eveningClockIn && !item.shift.eveningClockOut) ||
                // Also include people on break as "active" in the shift context
                (item.shift.breaks && item.shift.breaks.some(b => !b.endTime))
            );
        }

        if (activeTab === "not_started") {
            // No shift record OR shift exists but no clock-ins yet
            return !item.shift || (!item.shift.morningClockIn && !item.shift.eveningClockIn);
        }

        return true;
    });


    return (
        <ScrollArea className="h-full">
            <div className="min-h-full p-6 space-y-8 bg-slate-50/50 dark:bg-slate-950/20 relative">
                {/* Background Orbs */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="space-y-1"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/20 animate-pulse-slow">
                                <Zap className="w-6 h-6 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-900 dark:from-white dark:via-blue-200 dark:to-indigo-400">
                                Shift Command Center
                            </h2>
                        </div>
                        <p className="text-muted-foreground flex items-center gap-2 pl-14">
                            <Timer className="w-4 h-4" />
                            Real-time administrative control over all employee shifts
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col sm:flex-row gap-3"
                    >
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                placeholder="Search employees..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 w-full sm:w-[300px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-slate-200 dark:border-slate-800 rounded-xl focus:ring-blue-500/20"
                            />
                        </div>
                    </motion.div>
                </div>

                {/* Controls & Filter */}
                <Tabs defaultValue="all" className="w-full relative z-10" onValueChange={setActiveTab}>
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <TabsList className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/50 p-1 rounded-2xl h-12 shadow-sm">
                            <TabsTrigger value="all" className="rounded-xl px-6 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-md transition-all">
                                All Members
                            </TabsTrigger>
                            <TabsTrigger value="active" className="rounded-xl px-6 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-md">
                                Working Now
                            </TabsTrigger>
                            <TabsTrigger value="not_started" className="rounded-xl px-6 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-md">
                                Not Started
                            </TabsTrigger>
                        </TabsList>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            className="rounded-xl h-10 px-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md"
                        >
                            <RotateCcw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
                            Real-time Refresh
                        </Button>
                    </div>

                    <TabsContent value={activeTab} className="mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <AnimatePresence mode="popLayout">
                                {filteredData.map((item, index) => (
                                    <EmployeeControlCard
                                        key={item.employee.id}
                                        data={item}
                                        index={index}
                                        onStart={handleStartShift}
                                        onResume={handleResumeShift}
                                        onClose={handleForceClose}
                                        isUpdating={controlMutation.isPending}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </ScrollArea>
    );
}

function EmployeeControlCard({ data, index, onStart, onResume, onClose, isUpdating }: {
    data: { employee: SafeUser, shift?: ShiftWithUser },
    index: number,
    onStart: (id: string, p: "morning" | "evening") => void,
    onResume: (id: string, p: "morning" | "evening") => void,
    onClose: (id: string, p: "morning" | "evening") => void,
    isUpdating: boolean
}) {
    const { employee, shift } = data;
    const fullName = `${employee.firstName} ${employee.lastName}`;

    // Calculate status
    let status = "Not Working";
    let statusColor = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
    let isWorking = false;

    if (shift) {
        const morningActive = shift.morningClockIn && !shift.morningClockOut;
        const eveningActive = shift.eveningClockIn && !shift.eveningClockOut;

        if (morningActive || eveningActive) {
            status = "Currently Working";
            statusColor = "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400";
            isWorking = true;
        } else if (shift.morningClockOut || shift.eveningClockOut) {
            status = "Shift Ended";
            statusColor = "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400";
        }
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
        >
            <Card className="group relative overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-slate-200/50 dark:border-slate-800/50 hover:shadow-2xl hover:shadow-blue-500/5 transition-all duration-300 rounded-3xl">
                <div className={cn(
                    "absolute top-0 left-0 w-1 h-full",
                    isWorking ? "bg-gradient-to-b from-blue-500 to-indigo-600" : "bg-slate-200 dark:bg-slate-800"
                )} />

                <CardHeader className="pb-3 border-b border-slate-100/50 dark:border-slate-800/50">
                    <div className="flex justify-between items-start">
                        <div className="flex gap-4">
                            <div className="relative">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center font-bold text-lg text-slate-600 dark:text-slate-300 uppercase shadow-inner">
                                    {employee.firstName[0]}{employee.lastName[0]}
                                </div>
                                {isWorking && (
                                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white dark:border-slate-900"></span>
                                    </span>
                                )}
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="font-bold text-lg tracking-tight group-hover:text-blue-500 transition-colors">
                                    {fullName}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px] h-5 rounded-md border-slate-200/50 bg-slate-50/50 dark:bg-slate-800/50">
                                        {employee.department || "General"}
                                    </Badge>
                                    <p className="text-[10px] text-slate-400 font-medium">@{employee.username}</p>
                                </div>
                            </div>
                        </div>

                        <Badge className={cn("rounded-full px-3 py-0.5 text-[10px] uppercase tracking-wider font-bold shadow-sm", statusColor)}>
                            {status}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                    {/* Shift Schedule Info */}
                    <div className="grid grid-cols-2 gap-3 pb-2">
                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100/50 dark:border-slate-800/50 space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Morning</p>
                            <div className="flex items-center gap-2">
                                <div className={cn("w-1.5 h-1.5 rounded-full", shift?.morningClockIn ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-slate-700")} />
                                <span className="text-xs font-semibold">
                                    {shift?.morningClockIn ? format(new Date(shift.morningClockIn), "h:mm a") : "—"}
                                </span>
                                {shift?.morningClockIn && !shift?.morningClockOut && <Timer className="w-3 h-3 text-emerald-500 animate-pulse" />}
                            </div>
                            <p className="text-[10px] text-slate-400">Out: {shift?.morningClockOut ? format(new Date(shift.morningClockOut), "h:mm a") : "—"}</p>
                        </div>

                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-100/50 dark:border-slate-800/50 space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Evening</p>
                            <div className="flex items-center gap-2">
                                <div className={cn("w-1.5 h-1.5 rounded-full", shift?.eveningClockIn ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-slate-700")} />
                                <span className="text-xs font-semibold">
                                    {shift?.eveningClockIn ? format(new Date(shift.eveningClockIn), "h:mm a") : "—"}
                                </span>
                                {shift?.eveningClockIn && !shift?.eveningClockOut && <Timer className="w-3 h-3 text-emerald-500 animate-pulse" />}
                            </div>
                            <p className="text-[10px] text-slate-400">Out: {shift?.eveningClockOut ? format(new Date(shift.eveningClockOut), "h:mm a") : "—"}</p>
                        </div>
                    </div>

                    {/* Action Center */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase pl-1">Command Center</span>
                            <Users className="w-3 h-3 text-slate-400" />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {!shift && (
                                <>
                                    <Button
                                        size="sm"
                                        onClick={() => onStart(employee.id, "morning")}
                                        disabled={isUpdating}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-4 h-9 shadow-lg shadow-emerald-500/20"
                                    >
                                        <Play className="w-3.5 h-3.5 mr-2" /> Start Morning
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => onStart(employee.id, "evening")}
                                        disabled={isUpdating}
                                        variant="outline"
                                        className="rounded-xl px-4 h-9 border-slate-200 dark:border-slate-800"
                                    >
                                        <Sun className="w-3.5 h-3.5 mr-2" /> Start Evening
                                    </Button>
                                </>
                            )}

                            {shift && (
                                <>
                                    {/* Morning Controls */}
                                    {shift.morningClockIn && !shift.morningClockOut && (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => onClose(shift.id, "morning")}
                                            className="rounded-xl h-9 px-4 shadow-lg shadow-red-500/20"
                                        >
                                            <XSquare className="w-3.5 h-3.5 mr-2" /> Force End Morning
                                        </Button>
                                    )}
                                    {shift.morningClockOut && (
                                        <Button
                                            size="sm"
                                            onClick={() => onResume(shift.id, "morning")}
                                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-9 px-4 shadow-lg shadow-blue-500/20"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 mr-2" /> Resume Morning
                                        </Button>
                                    )}

                                    {/* Evening Controls */}
                                    {shift.eveningClockIn && !shift.eveningClockOut && (
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => onClose(shift.id, "evening")}
                                            className="rounded-xl h-9 px-4 shadow-lg shadow-red-500/20"
                                        >
                                            <XSquare className="w-3.5 h-3.5 mr-2" /> Force End Evening
                                        </Button>
                                    )}
                                    {shift.eveningClockOut && (
                                        <Button
                                            size="sm"
                                            onClick={() => onResume(shift.id, "evening")}
                                            className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-9 px-4 shadow-lg shadow-purple-500/20"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5 mr-2" /> Resume Evening
                                        </Button>
                                    )}

                                    {/* If morning ended and evening not started */}
                                    {!shift.eveningClockIn && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => onStart(employee.id, "evening")}
                                            className="rounded-xl h-9 px-4"
                                        >
                                            <Play className="w-3.5 h-3.5 mr-2" /> Start Evening
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>

                {/* Subtle Decorative Elements */}
                <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-gradient-to-br from-blue-500/5 to-indigo-500/5 rounded-full blur-2xl group-hover:from-blue-500/10 group-hover:to-indigo-500/10 transition-all pointer-events-none" />
            </Card>
        </motion.div>
    );
}
