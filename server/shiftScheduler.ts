// server/shiftScheduler.ts
import { storage } from "./storage";
import { notifyShiftReportReminder, type WasenderSettings } from "./wasender";

// Configuration
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const AUTO_CLOSE_DELAY_HOURS = 2; // Close 2 hours after shift end time

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
 * @returns Date object with the specified date and time in Pakistan timezone (UTC+5)
 */
function parseUserTime(dateStr: string, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Create date in Pakistan timezone (UTC+5) using ISO format
    const paddedHours = String(hours).padStart(2, '0');
    const paddedMinutes = String(minutes || 0).padStart(2, '0');
    return new Date(`${dateStr}T${paddedHours}:${paddedMinutes}:00+05:00`);
}

/**
 * Calculate the correct end date/time for a shift, handling cross-midnight scenarios
 * 
 * This function uses the scheduledDate (if available) to determine the correct end time.
 * For legacy shifts without scheduledDate, it falls back to heuristic-based calculation.
 * 
 * @param shiftDate - The shift's recorded date (YYYY-MM-DD)
 * @param scheduledDate - The intended scheduled date (YYYY-MM-DD) - may be null for legacy records
 * @param startTimeStr - Scheduled start time (HH:MM)
 * @param endTimeStr - Scheduled end time (HH:MM)
 * @param clockInTime - Actual clock-in time
 * @returns Correct end Date object
 */
function calculateShiftEndDateTime(
    shiftDate: string,
    scheduledDate: string | null,
    startTimeStr: string | null,
    endTimeStr: string,
    clockInTime: Date
): Date {
    const [endHours, endMinutes] = endTimeStr.split(':').map(Number);
    const [startHours, startMinutes] = startTimeStr ? startTimeStr.split(':').map(Number) : [0, 0];
    
    // Use scheduledDate if available, otherwise fall back to shiftDate
    const baseDate = scheduledDate || shiftDate;
    
    // Create end date in Pakistan timezone (UTC+5)
    const paddedEndHours = String(endHours).padStart(2, '0');
    const paddedEndMinutes = String(endMinutes || 0).padStart(2, '0');
    let endDate = new Date(`${baseDate}T${paddedEndHours}:${paddedEndMinutes}:00+05:00`);
    
    const startMinutesTotal = startHours * 60 + (startMinutes || 0);
    const endMinutesTotal = endHours * 60 + (endMinutes || 0);
    
    // Case 1: Classic cross-midnight shift (e.g., 22:00 - 06:00)
    // Start is in evening (>= 12:00) and end is earlier than start (in morning)
    if (startTimeStr && endMinutesTotal < startMinutesTotal && startHours >= 12) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000); // Add one day
        return endDate;
    }
    
    // For legacy shifts without scheduledDate, apply fallback logic
    if (!scheduledDate) {
        // Fallback: if end time is more than 12 hours before clock-in, add a day
        if (endDate.getTime() < clockInTime.getTime()) {
            const gapHours = (clockInTime.getTime() - endDate.getTime()) / (1000 * 60 * 60);
            if (gapHours > 12) {
                endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
            }
        }
    }
    
    // Final safeguard: if computed end time is STILL before clock-in by more than 12 hours,
    // something is wrong - adjust the end time forward
    // This handles incorrectly populated scheduledDate values
    if (endDate.getTime() < clockInTime.getTime()) {
        const gapHours = (clockInTime.getTime() - endDate.getTime()) / (1000 * 60 * 60);
        if (gapHours > 12) {
            console.warn(`[ShiftScheduler] End time ${endDate.toISOString()} is ${gapHours.toFixed(1)}h before clock-in ${clockInTime.toISOString()}, adjusting forward`);
            endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        }
    }
    
    return endDate;
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
                let scheduledStartTime: string | null = null;
                let clockInTime: Date | null = null;

                // Determine relevant end time based on which shift is active
                if (shift.morningClockIn && !shift.morningClockOut) {
                    scheduledEndTime = user.shiftType === 'two_shifts' ? user.morningShiftEnd : user.shiftEndTime;
                    scheduledStartTime = user.shiftType === 'two_shifts' ? user.morningShiftStart : user.shiftStartTime;
                    clockInTime = new Date(shift.morningClockIn);
                } else if (shift.eveningClockIn && !shift.eveningClockOut) {
                    scheduledEndTime = user.eveningShiftEnd;
                    scheduledStartTime = user.eveningShiftStart;
                    clockInTime = new Date(shift.eveningClockIn);
                }

                if (scheduledEndTime && clockInTime) {
                    // Use cross-midnight aware calculation with scheduledDate
                    const endTime = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, scheduledStartTime, scheduledEndTime, clockInTime);
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
            // 2. AUTO-CLOSE WARNING (15 minutes before auto-close)
            // ============================================================

            // Skip for Open Shifts
            if (user.shiftType !== 'open') {
                let warningEndTime: string | null = null;
                let warningStartTime: string | null = null;
                let warningClockInTime: Date | null = null;
                let warningShiftPeriod: string = "";

                // Get the active shift details for warning
                if (shift.morningClockIn && !shift.morningClockOut) {
                    warningEndTime = user.shiftType === 'two_shifts' ? user.morningShiftEnd : user.shiftEndTime;
                    warningStartTime = user.shiftType === 'two_shifts' ? user.morningShiftStart : user.shiftStartTime;
                    warningClockInTime = new Date(shift.morningClockIn);
                    warningShiftPeriod = "morning";
                } else if (shift.eveningClockIn && !shift.eveningClockOut) {
                    warningEndTime = user.eveningShiftEnd;
                    warningStartTime = user.eveningShiftStart;
                    warningClockInTime = new Date(shift.eveningClockIn);
                    warningShiftPeriod = "evening";
                }

                if (warningEndTime && warningClockInTime && user.phone) {
                    const endDate = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, warningStartTime, warningEndTime, warningClockInTime);
                    const autoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));
                    const warningTime = new Date(autoCloseTime.getTime() - (15 * 60 * 1000)); // 15 minutes before auto-close
                    
                    const minutesUntilAutoClose = (autoCloseTime.getTime() - now.getTime()) / (1000 * 60);

                    // Send warning if we're within 15 minutes of auto-close AND shift hasn't auto-closed yet
                    if (minutesUntilAutoClose > 0 && minutesUntilAutoClose <= 15) {
                        // Check if warning was already sent
                        const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                        const alreadyWarned = logs.some(log =>
                            log.action === "auto_close_warning_sent" &&
                            (now.getTime() - new Date(log.timestamp).getTime()) < (2 * 60 * 60 * 1000) // Within last 2 hours
                        );

                        if (!alreadyWarned) {
                            console.log(`[ShiftScheduler] Sending auto-close warning to ${user.username}`);

                            const warningMessage = `Your ${warningShiftPeriod} shift will be AUTOMATICALLY CLOSED in ${Math.ceil(minutesUntilAutoClose)} minutes. Please submit your report and end your shift now to avoid forced closure.`;

                            try {
                                await notifyShiftReportReminder({
                                    fullName: `${user.firstName} ${user.lastName}`,
                                    phone: user.phone,
                                    whatsappPreference: user.whatsappPreference
                                }, warningMessage, wasenderSettings);

                                await storage.createActivityLog({
                                    userId: user.id,
                                    action: "auto_close_warning_sent",
                                    details: `Sent auto-close warning: ${Math.ceil(minutesUntilAutoClose)} minutes remaining`,
                                    timestamp: now
                                });
                            } catch (err) {
                                console.error(`[ShiftScheduler] Failed to send auto-close warning to ${user.username}:`, err);
                            }
                        }
                    }
                }
            }

            // ============================================================
            // 3. AUTO-CLOSE LOGIC (1 Hour after End Time)
            // ============================================================

            // Skip Auto-Close for Open Shifts (they close manually or via max-duration stale check)
            if (user.shiftType === 'open') {
                continue;
            }

            // --- CHECK MORNING SHIFT ---
            if (shift.morningClockIn && !shift.morningClockOut) {
                let scheduledEndTime: string | null = null;
                let scheduledStartTime: string | null = null;

                if (user.shiftType === 'one_shift') {
                    scheduledEndTime = user.shiftEndTime;
                    scheduledStartTime = user.shiftStartTime;
                } else if (user.shiftType === 'two_shifts') {
                    scheduledEndTime = user.morningShiftEnd;
                    scheduledStartTime = user.morningShiftStart;
                }

                if (scheduledEndTime) {
                    // Use the new cross-midnight aware function with scheduledDate
                    const clockInTime = new Date(shift.morningClockIn);
                    const endDate = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, scheduledStartTime, scheduledEndTime, clockInTime);
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
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed 2h after shift end"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Morning shift auto-closed (2h after configured end time: ${scheduledEndTime})`,
                            timestamp: now
                        });

                        closedCount++;
                    }
                }
            }

            // --- CHECK EVENING SHIFT ---
            if (shift.eveningClockIn && !shift.eveningClockOut) {
                let scheduledEndTime: string | null = null;
                let scheduledStartTime: string | null = null;

                if (user.shiftType === 'two_shifts') {
                    scheduledEndTime = user.eveningShiftEnd;
                    scheduledStartTime = user.eveningShiftStart;
                }

                if (scheduledEndTime) {
                    // Use the new cross-midnight aware function with scheduledDate
                    const clockInTime = new Date(shift.eveningClockIn);
                    const endDate = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, scheduledStartTime, scheduledEndTime, clockInTime);
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
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed 2h after shift end"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Evening shift auto-closed (2h after configured end time: ${scheduledEndTime})`,
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