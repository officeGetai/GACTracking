import { storage } from "./storage";
import { getWasenderSettings, notifyBreakExceeded, notifyShiftOvertime, notifyAutoClosed } from "./wasender";
import { BREAK_LIMITS, type Shift } from "@shared/schema";
import { differenceInMinutes, isAfter, addDays } from "date-fns";

// Helper to parse "HH:MM" string to a Date object relative to a base date
function parseTime(timeStr: string, baseDateStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(baseDateStr);
    // Explicitly set hours to avoid timezone shifting issues if baseDateStr is just YYYY-MM-DD
    // But new Date("YYYY-MM-DD") is UTC. shifting to local hours might be tricky.
    // Better: parse YYYY-MM-DD parts.
    const [y, m, d] = baseDateStr.split('-').map(Number);
    const localDate = new Date(y, m - 1, d); // Local time
    localDate.setHours(hours, minutes, 0, 0);
    return localDate;
}

export function startScheduler() {
    console.log("Starting Monitoring Scheduler...");

    // Run checks every minute
    setInterval(async () => {
        try {
            await checkOverdueBreaks();
            await checkShiftOvertime();
            await runDailyCleanup();
        } catch (error) {
            console.error("Error in scheduler:", error);
        }
    }, 60 * 1000);
}

async function checkOverdueBreaks() {
    try {
        const activeBreaks = await storage.getAllMonitorableBreaks();
        const settings = await getWasenderSettings();

        for (const breakRecord of activeBreaks) {
            if (breakRecord.lateNotificationSent) continue;

            const limits = BREAK_LIMITS[breakRecord.type as keyof typeof BREAK_LIMITS];
            if (!limits || !limits.maxDuration) continue;

            const duration = differenceInMinutes(new Date(), new Date(breakRecord.startTime));

            if (duration > limits.maxDuration) {
                console.log(`Break overdue for user ${breakRecord.userId}. Duration: ${duration}m, Limit: ${limits.maxDuration}m`);

                // Send Notification
                const employeeForNotify = {
                    fullName: `${breakRecord.user.firstName} ${breakRecord.user.lastName}`,
                    department: breakRecord.user.department || "N/A",
                    phone: breakRecord.user.phone,
                    whatsappPreference: breakRecord.user.whatsappPreference
                };

                await notifyBreakExceeded(
                    employeeForNotify,
                    breakRecord.type,
                    duration - limits.maxDuration,
                    settings
                );

                // Mark as notified
                await storage.updateBreak(breakRecord.id, { lateNotificationSent: true });
            }
        }
    } catch (error) {
        console.error("Error checking overdue breaks:", error);
    }
}

async function checkShiftOvertime() {
    try {
        const activeShifts = await storage.getShiftsForOvertimeCheck();
        const settings = await getWasenderSettings();
        const now = new Date();

        for (const shift of activeShifts) {
            const user = shift.user;
            if (!user) continue;

            // Determine scheduled end time based on shift type
            let scheduledStart: Date | null = null;
            let scheduledEnd: Date | null = null;
            let shiftTypeStr = "";

            // Use scheduledDate if available (for cross-midnight shifts), otherwise use shift.date
            // scheduledDate contains the intended working date, which is correct for early morning shifts
            const baseDate = (shift as any).scheduledDate || shift.date;

            if (user.shiftType === "one_shift" && user.shiftEndTime && user.shiftStartTime) {
                scheduledStart = parseTime(user.shiftStartTime, baseDate);
                scheduledEnd = parseTime(user.shiftEndTime, baseDate);
                shiftTypeStr = "Shift";
            } else if (user.shiftType === "two_shifts") {
                if (shift.morningClockIn && !shift.morningClockOut && user.morningShiftEnd && user.morningShiftStart) {
                    scheduledStart = parseTime(user.morningShiftStart, baseDate);
                    scheduledEnd = parseTime(user.morningShiftEnd, baseDate);
                    shiftTypeStr = "Morning Shift";
                } else if (shift.eveningClockIn && !shift.eveningClockOut && user.eveningShiftEnd && user.eveningShiftStart) {
                    scheduledStart = parseTime(user.eveningShiftStart, baseDate);
                    scheduledEnd = parseTime(user.eveningShiftEnd, baseDate);
                    shiftTypeStr = "Evening Shift";
                }
            }

            // If no scheduled end (e.g. open shift), skip overtime checks
            if (!scheduledEnd || !scheduledStart) continue;

            // Handle Overnight Shifts: If End < Start, it implies End is the next day
            if (scheduledEnd < scheduledStart) {
                scheduledEnd = addDays(scheduledEnd, 1);
            }

            if (isAfter(now, scheduledEnd)) {
                const overtimeMinutes = differenceInMinutes(now, scheduledEnd);

                const employeeForNotify = {
                    fullName: `${user.firstName} ${user.lastName}`,
                    department: user.department || "N/A",
                    phone: user.phone,
                    whatsappPreference: user.whatsappPreference
                };

                // Force Close Condition: >= 2h (120 minutes) after shift end
                if (overtimeMinutes >= 120) {
                    console.log(`Force closing shift for ${user.username} - Overtime: ${overtimeMinutes}m`);

                    const updateData: Partial<Shift> = {};
                    if (shiftTypeStr === "Morning Shift") updateData.morningClockOut = now;
                    else if (shiftTypeStr === "Evening Shift") updateData.eveningClockOut = now;
                    else updateData.eveningClockOut = now; // Fallback for one_shift

                    await storage.updateShift(shift.id, updateData);
                    await storage.createActivityLog({
                        userId: user.id,
                        action: "auto_close_shift",
                        details: `Force closed ${shiftTypeStr} after 2h overtime`,
                        timestamp: now
                    });

                    // Notify User
                    await notifyAutoClosed(employeeForNotify, settings);
                }
            }
        }
    } catch (error) {
        console.error("Error checking shift overtime:", error);
    }
}

async function runDailyCleanup() {
    const now = new Date();
    // Run only at 09:00 AM
    if (now.getHours() === 9 && now.getMinutes() === 0) {
        console.log("Running 9 AM Daily Cleanup...");
        try {
            await storage.forceCloseActiveShiftsAndBreaks();
            console.log("Cleanup complete.");
        } catch (error) {
            console.error("Error during 9 AM cleanup:", error);
        }
    }
}
