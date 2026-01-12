import { useQuery } from "@tanstack/react-query";
import { ActivityLog } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Bell,
    CheckCircle,
    Clock,
    AlertTriangle,
    LogIn,
    LogOut,
    Coffee,
    FileText,
    UserPlus
} from "lucide-react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

// Configuration for different notification actions
const ACTION_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    clock_in: { icon: LogIn, color: "text-green-500", label: "Clock In" },
    clock_out: { icon: LogOut, color: "text-orange-500", label: "Clock Out" },
    break_start: { icon: Coffee, color: "text-blue-500", label: "Break Start" },
    break_end: { icon: CheckCircle, color: "text-green-500", label: "Break End" },
    report_submitted: { icon: FileText, color: "text-purple-500", label: "Report Submitted" },
    report_reminder_sent: { icon: Bell, color: "text-amber-500", label: "Shift Reminder" },
    late_arrival: { icon: Clock, color: "text-red-500", label: "Late Arrival" },
    default: { icon: Bell, color: "text-gray-500", label: "Notification" }
};

export default function NotificationsPage() {
    const { data: notifications, isLoading } = useQuery<ActivityLog[]>({
        queryKey: ["/api/notifications"],
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Deduplicate notifications if needed or just display all
    const sortedNotifications = notifications?.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return (
        <div className="container mx-auto py-8 space-y-8">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-4">
                            {sortedNotifications?.length === 0 ? (
                                <div className="text-center text-muted-foreground py-8">
                                    No notifications found.
                                </div>
                            ) : (
                                sortedNotifications?.map((notification) => {
                                    const config = ACTION_CONFIG[notification.action] || ACTION_CONFIG.default;
                                    const Icon = config.icon;

                                    // Parse metadata if available
                                    let metaContent = null;
                                    if (notification.metadata && typeof notification.metadata === 'object') {
                                        const meta = notification.metadata as any;
                                        if (meta.shiftType) {
                                            metaContent = (
                                                <div className="mt-1 text-xs text-muted-foreground bg-muted/50 p-2 rounded-md border">
                                                    <p><strong>Shift Type:</strong> {meta.shiftType}</p>
                                                    {meta.requiredHours && <p><strong>Required Hours:</strong> {meta.requiredHours}</p>}
                                                    {meta.shiftEnd && <p><strong>Shift End:</strong> {meta.shiftEnd}</p>}
                                                </div>
                                            );
                                        }
                                    }

                                    return (
                                        <div
                                            key={notification.id}
                                            className="flex items-start gap-4 p-4 rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-muted/50 transition-colors"
                                        >
                                            <div className={`mt-1 p-2 rounded-full bg-background border ${config.color}`}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-medium leading-none">{config.label}</p>
                                                    <span className="text-xs text-muted-foreground">
                                                        {format(new Date(notification.timestamp), "PPp")}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {typeof notification.details === "string" ? notification.details : ""}
                                                </p>
                                                {metaContent}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}
