// server/shiftScheduler.ts
import { storage } from "./storage";
import { notifyShiftReportReminder, type WasenderSettings } from "./wasender";

// Configuration
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const AUTO_CLOSE_DELAY_HOURS = 1; // Close 1 hour after shift end time

// Helper to get WASENDER settings
async function getWasenderSettings(): Promise<WasenderSettings> {
    const config = await storage.getWasenderConfig();
    return {
        apiToken: config?.apiToken || null,
        isActive: config?.isActive || false,
        requestsGroupId: config?.requestsGroupId || null,
        shiftReportsGroupId: config?.shiftReportsGroupId || null,
        trackingAlertsGroupId: config?.trackingAlertsGroupId || null,
    };
}

/**
 * Parse user's configured time string (HH:MM) and convert to Date for a specific date
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:MM or HH:MM:SS format
 * @returns Date object with the specified date and time
 */
function parseUserTime(dateStr: string, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(dateStr + 'T00:00:00');
    result.setHours(hours, minutes || 0, 0, 0);
    return result;
}

/**
 * Main scheduler function to check and auto-close shifts
 */
async function checkAndAutoCloseShifts() {
    const now = new Date();
    console.log(`[ShiftScheduler] Running check at ${now.toISOString()}...`);

    try {
        // 1. Get all active shifts (clocked in but not clocked out)
        const activeShifts = await storage.getActiveShiftsNeedingClosure();
        console.log(`[ShiftScheduler] Found ${activeShifts.length} active shifts to check.`);

        let closedCount = 0;
        const wasenderSettings = await getWasenderSettings();

        for (const shift of activeShifts) {
            const { user, date: shiftDate } = shift;

            // Skip if user info is missing
            if (!user) continue;

            // ============================================================
            // 1. SHIFT REPORT WHATSAPP REMINDER LOGIC
            // ============================================================

            let shouldSendReminder = false;
            let reminderMessage = "";

            // A. CHECK OPEN SHIFT (Based on Required Hours)
            if (user.shiftType === 'open') {
                const clockIn = shift.morningClockIn || shift.eveningClockIn; // Open shift usually uses morning columns
                if (clockIn) {
                    const elapsedHours = (now.getTime() - new Date(clockIn).getTime()) / (1000 * 60 * 60);
                    const requiredHours = parseFloat(user.openShiftRequiredHours || "8"); // Default to 8 if not set

                    // If they have worked their required hours
                    if (elapsedHours >= requiredHours) {
                        shouldSendReminder = true;
                        reminderMessage = `You have completed your required ${requiredHours} hours. Please submit your report and clock out.`;
                    }
                }
            }
            // B. CHECK FIXED SHIFTS (15 Minutes before End Time)
            else {
                let scheduledEndTime: string | null = null;

                // Determine relevant end time based on which shift is active
                if (shift.morningClockIn && !shift.morningClockOut) {
                    scheduledEndTime = user.shiftType === 'two_shifts' ? user.morningShiftEnd : user.shiftEndTime;
                } else if (shift.eveningClockIn && !shift.eveningClockOut) {
                    scheduledEndTime = user.eveningShiftEnd;
                }

                if (scheduledEndTime) {
                    const endTime = parseUserTime(shiftDate, scheduledEndTime);
                    const minutesUntilEnd = (endTime.getTime() - now.getTime()) / (1000 * 60);

                    // If we are within 15 minutes of the end (and not passed it significantly)
                    if (minutesUntilEnd > 0 && minutesUntilEnd <= 15) {
                        shouldSendReminder = true;
                        reminderMessage = `Your shift ends in ${Math.ceil(minutesUntilEnd)} minutes. Please submit your report.`;
                    }
                }
            }

            // PERFORM REMINDER SEND (If condition met and not already sent)
            if (shouldSendReminder && user.phone) {
                // Check if we already sent a reminder today to avoid spamming every 5 mins
                const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                const alreadyReminded = logs.some(log =>
                    log.action === "report_reminder_sent" &&
                    // Ensure it was sent recently (within last 12 hours) to apply to this specific shift
                    (now.getTime() - new Date(log.timestamp).getTime()) < (12 * 60 * 60 * 1000)
                );

                if (!alreadyReminded) {
                    console.log(`[ShiftScheduler] Sending report reminder to ${user.username}`);

                    // Send WhatsApp
                    try {
                        await notifyShiftReportReminder({
                            fullName: `${user.firstName} ${user.lastName}`,
                            phone: user.phone,
                            whatsappPreference: user.whatsappPreference
                        }, reminderMessage, wasenderSettings);

                        // Log it so we don't send again
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "report_reminder_sent",
                            details: `Sent WhatsApp reminder: ${reminderMessage}`,
                            timestamp: now,
                            metadata: user.shiftType === "open"
                                ? {
                                    shiftType: "Open",
                                    requiredHours: user.openShiftRequiredHours
                                }
                                : {
                                    shiftType: user.shiftType === "morning" ? "Morning" : "Evening",
                                    shiftEnd: user.shiftType === "morning" ? user.morningShiftEnd : user.eveningShiftEnd
                                }
                        });
                    } catch (err) {
                        console.error(`[ShiftScheduler] Failed to send reminder to ${user.username}:`, err);
                    }
                }
            }

            // ============================================================
            // 2. AUTO-CLOSE LOGIC (1 Hour after End Time)
            // ============================================================

            // Skip Auto-Close for Open Shifts (they close manually or via max-duration stale check)
            if (user.shiftType === 'open') {
                continue;
            }

            // --- CHECK MORNING SHIFT ---
            if (shift.morningClockIn && !shift.morningClockOut) {
                let scheduledEndTime: string | null = null;

                if (user.shiftType === 'one_shift') {
                    scheduledEndTime = user.shiftEndTime;
                } else if (user.shiftType === 'two_shifts') {
                    scheduledEndTime = user.morningShiftEnd;
                }

                if (scheduledEndTime) {
                    const endDate = parseUserTime(shiftDate, scheduledEndTime);
                    const autoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));

                    if (now >= autoCloseTime) {
                        console.log(`[ShiftScheduler] Auto-closing MORNING shift for ${user.username}`);

                        // 1. End active breaks
                        const activeBreak = await storage.getActiveBreakForDate(user.id, shiftDate);
                        if (activeBreak) {
                            const breakDuration = Math.floor((autoCloseTime.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
                            await storage.updateBreak(activeBreak.id, {
                                endTime: autoCloseTime,
                                durationMinutes: breakDuration > 0 ? breakDuration : 0
                            });
                        }

                        // 2. Set Morning Clock Out
                        await storage.updateShift(shift.id, {
                            morningClockOut: autoCloseTime,
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed 1h after shift end"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Morning shift auto-closed (1h after configured end time: ${scheduledEndTime})`,
                            timestamp: now
                        });

                        closedCount++;
                    }
                }
            }

            // --- CHECK EVENING SHIFT ---
            if (shift.eveningClockIn && !shift.eveningClockOut) {
                let scheduledEndTime: string | null = null;

                if (user.shiftType === 'two_shifts') {
                    scheduledEndTime = user.eveningShiftEnd;
                }

                if (scheduledEndTime) {
                    const endDate = parseUserTime(shiftDate, scheduledEndTime);
                    const autoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));

                    if (now >= autoCloseTime) {
                        console.log(`[ShiftScheduler] Auto-closing EVENING shift for ${user.username}`);

                        // 1. End active breaks
                        const activeBreak = await storage.getActiveBreakForDate(user.id, shiftDate);
                        if (activeBreak) {
                            const breakDuration = Math.floor((autoCloseTime.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
                            await storage.updateBreak(activeBreak.id, {
                                endTime: autoCloseTime,
                                durationMinutes: breakDuration > 0 ? breakDuration : 0
                            });
                        }

                        // 2. Set Evening Clock Out
                        await storage.updateShift(shift.id, {
                            eveningClockOut: autoCloseTime,
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed 1h after shift end"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Evening shift auto-closed (1h after configured end time: ${scheduledEndTime})`,
                            timestamp: now
                        });

                        closedCount++;
                    }
                }
            }
        }

        if (closedCount > 0) {
            console.log(`[ShiftScheduler] Successfully auto-closed ${closedCount} shifts.`);
        }

    } catch (error) {
        console.error("[ShiftScheduler] Error running check:", error);
    }
}

/**
 * Start the shift scheduler
 */
export function startShiftScheduler() {
    console.log(`[ShiftScheduler] Started - checking every ${SCHEDULER_INTERVAL_MS / 1000 / 60} minutes`);

    // Run immediately on startup
    checkAndAutoCloseShifts();

    // Schedule periodic runs
    setInterval(checkAndAutoCloseShifts, SCHEDULER_INTERVAL_MS);
}