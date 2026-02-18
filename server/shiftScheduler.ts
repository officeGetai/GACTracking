// server/shiftScheduler.ts
import { storage } from "./storage";
import { notifyShiftReportReminder, sendPersonalWhatsApp, sendGroupWhatsApp, type WasenderSettings } from "./wasender";

// Configuration
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const AUTO_ABSENT_DELAY_HOURS = 2; // Mark absent 2 hours after scheduled clock-in time
const EXTENSION_REMINDER_DELAY_HOURS = 1; // Send extend reminder 1 hour after scheduled end (or after last extension)
const AUTO_CLOSE_AFTER_REMINDER_MINUTES = 10; // Auto-close 10 minutes after reminder if no extension

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
 * Get day name in Pakistan timezone for a given date
 */
function getDayNamePakistan(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date + 'T12:00:00+05:00') : date;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', weekday: 'long' }).format(d);
}

/**
 * Calculate required shift duration in minutes from start/end time strings
 * Handles cross-midnight shifts and Saturday 5-hour cap
 * Uses the actual clock-in time's Pakistan timezone day for Saturday detection
 * (not shiftDate, which may differ for cross-midnight shifts)
 */
function calcRequiredMinutesFromTimes(startTimeStr: string, endTimeStr: string, clockInTime: Date): number {
    if (!startTimeStr || !endTimeStr) return 8 * 60;

    const startParts = startTimeStr.split(':').map(Number);
    const endParts = endTimeStr.split(':').map(Number);
    if (startParts.length < 2 || endParts.length < 2 || isNaN(startParts[0]) || isNaN(endParts[0])) {
        console.warn(`[ShiftScheduler] Invalid time format: start=${startTimeStr}, end=${endTimeStr}, defaulting to 8h`);
        return 8 * 60;
    }

    const startTotal = startParts[0] * 60 + (startParts[1] || 0);
    const endTotal = endParts[0] * 60 + (endParts[1] || 0);
    let diff = endTotal - startTotal;
    if (diff <= 0) diff += 24 * 60;

    // Use the actual clock-in time's day in Pakistan timezone for Saturday cap
    const dayName = getDayNamePakistan(clockInTime);
    if (dayName === 'Saturday') {
        diff = Math.min(diff, 300);
    }

    return diff;
}

/**
 * Calculate the dynamic completion time based on actual clock-in + required minutes
 * This is when the employee will have fulfilled their required hours
 */
function calcDynamicCompletionTime(clockInTime: Date, requiredMinutes: number): Date {
    return new Date(clockInTime.getTime() + requiredMinutes * 60 * 1000);
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
        // Don't return early - still apply the safeguard below
    }

    // For legacy shifts without scheduledDate, apply fallback logic
    if (!scheduledDate) {
        // Fallback: if end time is before clock-in, add a day
        if (endDate.getTime() < clockInTime.getTime()) {
            endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        }
    }

    // CRITICAL SAFEGUARD: End time must ALWAYS be after clock-in time
    // A shift cannot end before it starts - if this happens, add a day
    // This handles all edge cases including cross-midnight shifts with early morning start times
    while (endDate.getTime() <= clockInTime.getTime()) {
        console.warn(`[ShiftScheduler] End time ${endDate.toISOString()} is before/equal clock-in ${clockInTime.toISOString()}, adding a day`);
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Additional sanity check: end time should be within 24 hours of clock-in
    // If gap is more than 24 hours, something is wrong
    const gapHours = (endDate.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
    if (gapHours > 24) {
        console.warn(`[ShiftScheduler] End time ${endDate.toISOString()} is ${gapHours.toFixed(1)}h after clock-in, capping to 24h`);
        endDate = new Date(clockInTime.getTime() + 24 * 60 * 60 * 1000);
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
            // SHIFT EXTENSION REMINDERS & AUTO-CLOSE
            // Based on scheduled shift end time (not clock-in + required hours)
            // Flow: End time + 1h → reminder → 10 min to extend → auto-close with base end time
            // Skips: open shifts and Saturday
            // ============================================================

            if (user.shiftType === 'open') continue;

            const dayName = getDayNamePakistan(shiftDate);
            if (dayName === 'Saturday') continue;

            // Determine which shift period is currently active
            let activeEndTime: string | null = null;
            let activeStartTime: string | null = null;
            let activeClockInTime: Date | null = null;
            let activeShiftPeriod: string = "";
            let activeClockOutField: string = "";

            if (shift.morningClockIn && !shift.morningClockOut) {
                activeEndTime = user.shiftType === 'two_shifts' ? user.morningShiftEnd : user.shiftEndTime;
                activeStartTime = user.shiftType === 'two_shifts' ? user.morningShiftStart : user.shiftStartTime;
                activeClockInTime = new Date(shift.morningClockIn);
                activeShiftPeriod = "morning";
                activeClockOutField = "morningClockOut";
            } else if (shift.eveningClockIn && !shift.eveningClockOut) {
                activeEndTime = user.eveningShiftEnd;
                activeStartTime = user.eveningShiftStart;
                activeClockInTime = new Date(shift.eveningClockIn);
                activeShiftPeriod = "evening";
                activeClockOutField = "eveningClockOut";
            }

            if (!activeEndTime || !activeClockInTime || !user.phone) continue;

            const fullName = `${user.firstName} ${user.lastName}`;
            const scheduledEndDate = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, activeStartTime, activeEndTime, activeClockInTime);

            // Determine reminder time:
            // - First reminder: scheduled end time + 1 hour
            // - After extension: last extension time + 1 hour
            const extensionCount = shift.overtimeReminderCount || 0;
            let nextReminderTime: Date;

            if (shift.lastOvertimeExtension && extensionCount > 0) {
                nextReminderTime = new Date(new Date(shift.lastOvertimeExtension).getTime() + (EXTENSION_REMINDER_DELAY_HOURS * 60 * 60 * 1000));
            } else {
                nextReminderTime = new Date(scheduledEndDate.getTime() + (EXTENSION_REMINDER_DELAY_HOURS * 60 * 60 * 1000));
            }

            const minutesSinceReminder = (now.getTime() - nextReminderTime.getTime()) / (1000 * 60);

            // Only process if we've passed the next reminder time
            if (minutesSinceReminder >= 0) {
                const logs = await storage.getActivityLogsByUser(user.id, shiftDate);

                // Check if reminder was already sent for this cycle
                const reminderAlreadySent = logs.some(log =>
                    log.action === "extension_reminder_sent" &&
                    Math.abs(new Date(log.timestamp).getTime() - nextReminderTime.getTime()) < (EXTENSION_REMINDER_DELAY_HOURS * 60 * 60 * 1000)
                );

                if (!reminderAlreadySent && minutesSinceReminder < AUTO_CLOSE_AFTER_REMINDER_MINUTES) {
                    // ============================================================
                    // SEND EXTENSION REMINDER
                    // ============================================================
                    console.log(`[ShiftScheduler] Sending extension reminder to ${user.username} (cycle #${extensionCount + 1})`);

                    const endTimeFormatted = activeEndTime;
                    const reminderMessage = `If you are still working, please press the "Extend Shift" button on the GAC Tracking app to continue your shift, or it will be auto-closed in 10 minutes with end time ${endTimeFormatted}. If you are not working, please close your shift.`;

                    try {
                        await sendPersonalWhatsApp(user.phone, reminderMessage, wasenderSettings);

                        if (wasenderSettings.trackingAlertsGroupId) {
                            await sendGroupWhatsApp(
                                wasenderSettings.trackingAlertsGroupId,
                                `[Shift Reminder] ${fullName} received shift extension reminder #${extensionCount + 1}. Shift end time was ${endTimeFormatted}. Auto-close in 10 minutes if not extended.`,
                                wasenderSettings
                            );
                        }

                        await storage.createActivityLog({
                            userId: user.id,
                            action: "extension_reminder_sent",
                            details: `Extension reminder #${extensionCount + 1} sent for ${activeShiftPeriod} shift. Auto-close in 10 min if not extended.`,
                            timestamp: now
                        });
                    } catch (err) {
                        console.error(`[ShiftScheduler] Failed to send extension reminder to ${user.username}:`, err);
                    }
                } else if (minutesSinceReminder >= AUTO_CLOSE_AFTER_REMINDER_MINUTES) {
                    // ============================================================
                    // AUTO-CLOSE: 10 minutes passed since reminder, no extension
                    // Check if employee extended AFTER the reminder was sent
                    // ============================================================
                    const extendedAfterReminder = shift.lastOvertimeExtension &&
                        new Date(shift.lastOvertimeExtension).getTime() > nextReminderTime.getTime();

                    if (!extendedAfterReminder) {
                        console.log(`[ShiftScheduler] Auto-closing ${activeShiftPeriod.toUpperCase()} shift for ${user.username} (no extension within 10 min)`);

                        const clockOutTime = scheduledEndDate;

                        // 1. End active breaks
                        const activeBreak = await storage.getActiveBreakForDate(user.id, shiftDate);
                        if (activeBreak) {
                            const breakDuration = Math.floor((clockOutTime.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
                            await storage.updateBreak(activeBreak.id, {
                                endTime: clockOutTime,
                                durationMinutes: breakDuration > 0 ? breakDuration : 0
                            });
                        }

                        // 2. Close shift with BASE end time
                        const updateData: any = {
                            [activeClockOutField]: clockOutTime,
                            notes: (shift.notes ? shift.notes + "\n" : "") + `[System] Auto-closed with base end time ${activeEndTime} (no extension after reminder)`
                        };
                        await storage.updateShift(shift.id, updateData);

                        // 3. Add auto-close note to shift report
                        const autoCloseNote = "Shift is auto closed by the system.";
                        try {
                            if (user.shiftType === 'two_shifts') {
                                const existingReport = await storage.getReportByShiftIdAndType(shift.id, activeShiftPeriod);
                                if (existingReport) {
                                    await storage.updateDailyShiftReport(existingReport.id, {
                                        notes: (existingReport.notes ? existingReport.notes + "\n" : "") + autoCloseNote
                                    });
                                    console.log(`[ShiftScheduler] Appended auto-close note to existing ${activeShiftPeriod} report for ${user.username}`);
                                } else {
                                    await storage.createDailyShiftReport({
                                        userId: user.id,
                                        shiftId: shift.id,
                                        date: shiftDate,
                                        workDetails: autoCloseNote,
                                        month: shiftDate.substring(0, 7),
                                        shiftType: activeShiftPeriod === "morning" ? "morning" : "evening",
                                    });
                                    console.log(`[ShiftScheduler] Created auto-close report for ${user.username} (${activeShiftPeriod})`);
                                }
                            } else {
                                const existingReport = await storage.getReportByShiftId(shift.id);
                                if (existingReport) {
                                    await storage.updateDailyShiftReport(existingReport.id, {
                                        notes: (existingReport.notes ? existingReport.notes + "\n" : "") + autoCloseNote
                                    });
                                    console.log(`[ShiftScheduler] Appended auto-close note to existing report for ${user.username}`);
                                } else {
                                    await storage.createDailyShiftReport({
                                        userId: user.id,
                                        shiftId: shift.id,
                                        date: shiftDate,
                                        workDetails: autoCloseNote,
                                        month: shiftDate.substring(0, 7),
                                    });
                                    console.log(`[ShiftScheduler] Created auto-close report for ${user.username}`);
                                }
                            }
                        } catch (reportErr) {
                            console.error(`[ShiftScheduler] Failed to add auto-close note to report for ${user.username}:`, reportErr);
                        }

                        // 4. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `${activeShiftPeriod} shift auto-closed with base end time ${activeEndTime}. Employee did not extend within 10 minutes of reminder.`,
                            timestamp: now
                        });

                        // 4. Notify group
                        if (wasenderSettings.trackingAlertsGroupId) {
                            try {
                                await sendGroupWhatsApp(
                                    wasenderSettings.trackingAlertsGroupId,
                                    `[Auto-Close] ${fullName}'s ${activeShiftPeriod} shift has been auto-closed with end time ${activeEndTime}. No extension was made within 10 minutes of the reminder.`,
                                    wasenderSettings
                                );
                            } catch (err) {
                                console.error(`[ShiftScheduler] Failed to send auto-close notification:`, err);
                            }
                        }

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
 * Get current date in Pakistan timezone (YYYY-MM-DD format)
 * Uses Intl.DateTimeFormat for consistent timezone handling
 */
function getTodayInPakistan(): string {
    const now = new Date();
    // Use Intl.DateTimeFormat to get correct date parts in Pakistan timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now); // Returns YYYY-MM-DD format
}

/**
 * Get current time in Pakistan timezone for comparison and logging
 * Returns a Date object representing the current moment, consistent with parseUserTime
 */
function getNowInPakistan(): Date {
    // Use the same approach as parseUserTime: create a date with +05:00 offset
    // This ensures consistent comparison and logging in Pakistan timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        hourCycle: 'h23'
    });

    const parts = formatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    // Handle edge case where hour could be "24" (use "00" instead)
    if (hour === '24') {
        hour = '00';
    }

    // Create date string in Pakistan timezone (UTC+5)
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+05:00`);
}

/**
 * Auto-mark employees as absent if they haven't clocked in 2 hours after their scheduled start time
 * Only applies to one_shift and two_shifts employees (NOT open shift)
 */
async function checkAndMarkAbsentEmployees() {
    const now = getNowInPakistan();
    const today = getTodayInPakistan();
    console.log(`[ShiftScheduler] Checking for absent employees at ${now.toISOString()} (Pakistan date: ${today})...`);

    // Skip absent marking on Sundays (off day)
    // Use Intl formatter with Pakistan timezone to get the correct day of week
    const pkDayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', weekday: 'long' }).format(new Date());
    if (pkDayOfWeek === 'Sunday') {
        console.log(`[ShiftScheduler] Sunday is an off day - skipping absent marking`);
        return;
    }

    try {
        // Get all employees with scheduled shifts (one_shift or two_shifts)
        const scheduledEmployees = await storage.getScheduledShiftEmployees();
        console.log(`[ShiftScheduler] Found ${scheduledEmployees.length} employees with scheduled shifts`);

        let absentCount = 0;

        for (const employee of scheduledEmployees) {
            // Get existing shift for today
            const existingShift = await storage.getShiftByUserAndDate(employee.id, today);

            // For two_shift employees, we check absence by notes (morning/evening tracked separately)
            // Don't skip entirely based on status - instead check each shift period independently

            // ============================================================
            // CHECK MORNING/MAIN SHIFT (one_shift uses shiftStartTime, two_shifts uses morningShiftStart)
            // ============================================================
            let morningStartTime: string | null = null;
            if (employee.shiftType === 'one_shift') {
                morningStartTime = employee.shiftStartTime;
            } else if (employee.shiftType === 'two_shifts') {
                morningStartTime = employee.morningShiftStart;
            }

            if (morningStartTime) {
                const scheduledStart = parseUserTime(today, morningStartTime);
                const absentThreshold = new Date(scheduledStart.getTime() + (AUTO_ABSENT_DELAY_HOURS * 60 * 60 * 1000));

                // Check if we're past the 2-hour threshold
                if (now >= absentThreshold) {
                    // Check if employee has clocked in for morning shift
                    const hasMorningClockIn = existingShift?.morningClockIn !== null;

                    // Check if already marked absent for morning (via notes or approved leave)
                    const shiftNotes = existingShift?.notes || "";
                    const alreadyAbsentForMorning = shiftNotes.includes("morning");

                    if (!hasMorningClockIn && !alreadyAbsentForMorning) {
                        // Check if we've already marked them absent today (prevent duplicate marking)
                        const logs = await storage.getActivityLogsByUser(employee.id, today);
                        const alreadyMarked = logs.some(log =>
                            log.action === "auto_absent_marked" &&
                            log.details?.includes("morning")
                        );

                        if (!alreadyMarked) {
                            console.log(`[ShiftScheduler] Marking ${employee.username} as ABSENT (2h past morning shift start: ${morningStartTime})`);

                            // Mark as absent
                            await storage.markEmployeeAbsent(employee.id, today, 'morning');

                            // Log activity
                            await storage.createActivityLog({
                                userId: employee.id,
                                action: "auto_absent_marked",
                                details: `Auto-marked absent for morning shift (2h after scheduled start: ${morningStartTime})`,
                                timestamp: now
                            });

                            absentCount++;
                            // Don't skip evening check - two_shift employees need independent marking for each shift
                        }
                    }
                }
            }

            // ============================================================
            // CHECK EVENING SHIFT (only for two_shifts employees)
            // ============================================================
            if (employee.shiftType === 'two_shifts' && employee.eveningShiftStart) {
                const eveningStartTime = employee.eveningShiftStart;
                const scheduledStart = parseUserTime(today, eveningStartTime);
                const absentThreshold = new Date(scheduledStart.getTime() + (AUTO_ABSENT_DELAY_HOURS * 60 * 60 * 1000));

                // Check if we're past the 2-hour threshold
                if (now >= absentThreshold) {
                    // Check if employee has clocked in for evening shift
                    const hasEveningClockIn = existingShift?.eveningClockIn !== null;

                    // Check if already marked absent for evening (via notes or approved leave)
                    // Need to re-fetch shift in case morning just added absent status
                    const currentShift = await storage.getShiftByUserAndDate(employee.id, today);
                    const shiftNotes = currentShift?.notes || "";
                    const alreadyAbsentForEvening = shiftNotes.includes("evening");

                    // Mark absent for evening if they haven't clocked in and not already marked
                    if (!hasEveningClockIn && !alreadyAbsentForEvening) {
                        const logs = await storage.getActivityLogsByUser(employee.id, today);
                        const alreadyMarked = logs.some(log =>
                            log.action === "auto_absent_marked" &&
                            log.details?.includes("evening")
                        );

                        if (!alreadyMarked) {
                            console.log(`[ShiftScheduler] Marking ${employee.username} as ABSENT for evening (2h past evening shift start: ${eveningStartTime})`);

                            // Mark as absent for evening
                            await storage.markEmployeeAbsent(employee.id, today, 'evening');

                            // Log activity
                            await storage.createActivityLog({
                                userId: employee.id,
                                action: "auto_absent_marked",
                                details: `Auto-marked absent for evening shift (2h after scheduled start: ${eveningStartTime})`,
                                timestamp: now
                            });

                            absentCount++;
                        }
                    }
                }
            }
        }

        if (absentCount > 0) {
            console.log(`[ShiftScheduler] Marked ${absentCount} employees as absent.`);
        }

    } catch (error) {
        console.error("[ShiftScheduler] Error checking absent employees:", error);
    }
}

/**
 * Start the shift scheduler
 */
export function startShiftScheduler() {
    console.log(`[ShiftScheduler] Started - checking every ${SCHEDULER_INTERVAL_MS / 1000 / 60} minutes`);

    // Run immediately on startup
    checkAndAutoCloseShifts();
    checkAndMarkAbsentEmployees();

    // Schedule periodic runs
    setInterval(() => {
        checkAndAutoCloseShifts();
        checkAndMarkAbsentEmployees();
    }, SCHEDULER_INTERVAL_MS);
}