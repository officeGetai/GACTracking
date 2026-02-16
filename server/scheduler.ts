import { storage } from "./storage";
import { getWasenderSettings, notifyBreakExceeded, notifyShiftOvertime, notifyAutoClosed } from "./wasender";
import { BREAK_LIMITS, BREAK_LIMITS_BY_SHIFT_TYPE, type Shift } from "@shared/schema";
import { differenceInMinutes, isAfter, addDays } from "date-fns";

// Helper to parse "HH:MM" string to a Date object relative to a base date in Pakistan timezone
function parseTime(timeStr: string, baseDateStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Create date in Pakistan timezone (UTC+5) using ISO format
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes || 0).padStart(2, '0');
    return new Date(`${baseDateStr}T${paddedHours}:${paddedMinutes}:00+05:00`);
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

const BREAK_EXCEED_REMINDER_INTERVAL = 5; // minutes between reminder notifications

async function checkOverdueBreaks() {
    try {
        const activeBreaks = await storage.getAllMonitorableBreaks();
        const settings = await getWasenderSettings();
        const now = new Date();

        for (const breakRecord of activeBreaks) {
            // Get shift-type-specific break limits for duration check
            const userShiftType = (breakRecord.user.shiftType || "one_shift") as keyof typeof BREAK_LIMITS_BY_SHIFT_TYPE;
            const shiftTypeLimits = BREAK_LIMITS_BY_SHIFT_TYPE[userShiftType] || BREAK_LIMITS_BY_SHIFT_TYPE.one_shift;
            const breakType = breakRecord.type as keyof typeof shiftTypeLimits;
            const limits = breakType in shiftTypeLimits ? (shiftTypeLimits as any)[breakType] : BREAK_LIMITS[breakRecord.type as keyof typeof BREAK_LIMITS];
            if (!limits || !limits.maxDuration) continue;

            const duration = differenceInMinutes(now, new Date(breakRecord.startTime));

            if (duration > limits.maxDuration) {
                const exceededBy = duration - limits.maxDuration;
                const notificationCount = breakRecord.exceedNotificationCount || 0;
                const lastNotifiedAt = breakRecord.lastExceedNotificationAt ? new Date(breakRecord.lastExceedNotificationAt) : null;

                let shouldNotify = false;

                if (!lastNotifiedAt) {
                    shouldNotify = true;
                } else {
                    const minutesSinceLastNotification = differenceInMinutes(now, lastNotifiedAt);
                    if (minutesSinceLastNotification >= BREAK_EXCEED_REMINDER_INTERVAL) {
                        shouldNotify = true;
                    }
                }

                if (shouldNotify) {
                    const newCount = notificationCount + 1;
                    console.log(`Break overdue for user ${breakRecord.userId}. Duration: ${duration}m, Limit: ${limits.maxDuration}m, Exceeded by: ${exceededBy}m, Reminder #${newCount}`);

                    const employeeForNotify = {
                        fullName: `${breakRecord.user.firstName} ${breakRecord.user.lastName}`,
                        department: breakRecord.user.department || "N/A",
                        phone: breakRecord.user.phone,
                        whatsappPreference: breakRecord.user.whatsappPreference
                    };

                    await notifyBreakExceeded(
                        employeeForNotify,
                        breakRecord.type,
                        exceededBy,
                        settings,
                        newCount
                    );

                    await storage.updateBreak(breakRecord.id, {
                        lateNotificationSent: true,
                        lastExceedNotificationAt: now,
                        exceedNotificationCount: newCount,
                    });
                }
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

// Helper to get Pakistan time (UTC+5)
function getPakistanTime(): Date {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcTime + (5 * 60 * 60000)); // UTC+5
}

async function runDailyCleanup() {
    const pakistanTime = getPakistanTime();
    const pakistanHour = pakistanTime.getHours();
    const pakistanMinute = pakistanTime.getMinutes();
    
    // Run only at 09:00 AM Pakistan time (within a 2-minute window to avoid missing it)
    if (pakistanHour === 9 && pakistanMinute <= 1) {
        console.log(`Running 9 AM Daily Cleanup (Pakistan time: ${pakistanTime.toISOString()})...`);
        try {
            const closedCount = await storage.forceCloseActiveShiftsAndBreaks();
            console.log(`Cleanup complete. Closed ${closedCount} shifts/breaks.`);
        } catch (error) {
            console.error("Error during 9 AM cleanup:", error);
        }
    }
}
