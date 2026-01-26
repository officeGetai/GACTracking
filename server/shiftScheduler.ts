// server/shiftScheduler.ts
import { storage } from "./storage";
import { notifyShiftReportReminder, sendPersonalWhatsApp, sendGroupWhatsApp, type WasenderSettings } from "./wasender";

// Configuration
const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const AUTO_CLOSE_DELAY_HOURS = 3; // Close 3 hours after shift end time
const AUTO_ABSENT_DELAY_HOURS = 2; // Mark absent 2 hours after scheduled clock-in time
const OVERTIME_REMINDER_1_HOURS = 1; // First overtime reminder at +1 hour after shift end
const OVERTIME_REMINDER_2_HOURS = 2; // Second overtime reminder at +2 hours after shift end
const OVERTIME_EXTENSION_HOURS = 1; // Each button press extends auto-close by 1 hour

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
            // 1. OVERTIME WINDOW REMINDERS (+1h and +2h after shift end)
            // ============================================================

            // Skip for Open Shifts
            if (user.shiftType !== 'open') {
                let overtimeEndTime: string | null = null;
                let overtimeStartTime: string | null = null;
                let overtimeClockInTime: Date | null = null;
                let overtimeShiftPeriod: string = "";

                // Get the active shift details for overtime reminders
                if (shift.morningClockIn && !shift.morningClockOut) {
                    overtimeEndTime = user.shiftType === 'two_shifts' ? user.morningShiftEnd : user.shiftEndTime;
                    overtimeStartTime = user.shiftType === 'two_shifts' ? user.morningShiftStart : user.shiftStartTime;
                    overtimeClockInTime = new Date(shift.morningClockIn);
                    overtimeShiftPeriod = "morning";
                } else if (shift.eveningClockIn && !shift.eveningClockOut) {
                    overtimeEndTime = user.eveningShiftEnd;
                    overtimeStartTime = user.eveningShiftStart;
                    overtimeClockInTime = new Date(shift.eveningClockIn);
                    overtimeShiftPeriod = "evening";
                }

                if (overtimeEndTime && overtimeClockInTime && user.phone) {
                    const endDate = calculateShiftEndDateTime(shiftDate, shift.scheduledDate || null, overtimeStartTime, overtimeEndTime, overtimeClockInTime);
                    const fullName = `${user.firstName} ${user.lastName}`;

                    // Calculate hours since shift end
                    const hoursSinceEnd = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);

                    // ============================================================
                    // Reminder 0: At shift end time (0 to 1 hour after end)
                    // Notify employee that their required hours are complete
                    // ============================================================
                    if (hoursSinceEnd >= 0 && hoursSinceEnd < OVERTIME_REMINDER_1_HOURS) {
                        // Check if already sent shift end reminder
                        const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                        const alreadySentShiftEnd = logs.some(log =>
                            log.action === "shift_end_reminder_sent" &&
                            (now.getTime() - new Date(log.timestamp).getTime()) < (2 * 60 * 60 * 1000)
                        );

                        if (!alreadySentShiftEnd) {
                            console.log(`[ShiftScheduler] Sending shift end reminder to ${user.username} - required hours completed`);

                            const shiftEndMessage = `⏰ Your ${overtimeShiftPeriod} shift at GAC has now completed its scheduled time.

If you're done working, please:
1. Submit your shift report
2. Clock out from the GAC Tracking app

If you're still working, press the "Extend Overtime Window" button to continue. Otherwise, your shift will auto-close in ${AUTO_CLOSE_DELAY_HOURS} hours.`;

                            try {
                                // Send to employee
                                await sendPersonalWhatsApp(user.phone, shiftEndMessage, wasenderSettings);

                                // Send to alert group
                                if (wasenderSettings.trackingAlertsGroupId) {
                                    await sendGroupWhatsApp(
                                        wasenderSettings.trackingAlertsGroupId,
                                        `[Shift Complete] ${fullName}'s ${overtimeShiftPeriod} shift has reached its scheduled end time. Waiting for clock-out or overtime extension.`,
                                        wasenderSettings
                                    );
                                }

                                await storage.createActivityLog({
                                    userId: user.id,
                                    action: "shift_end_reminder_sent",
                                    details: `Sent shift end reminder for ${overtimeShiftPeriod} shift - required hours completed`,
                                    timestamp: now
                                });
                            } catch (err) {
                                console.error(`[ShiftScheduler] Failed to send shift end reminder to ${user.username}:`, err);
                            }
                        }
                    }

                    // Reminder 1: At +1 hour after shift end
                    if (hoursSinceEnd >= OVERTIME_REMINDER_1_HOURS && hoursSinceEnd < OVERTIME_REMINDER_2_HOURS) {
                        // Check if already sent first reminder
                        const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                        const alreadySent1 = logs.some(log =>
                            log.action === "overtime_reminder_1_sent" &&
                            (now.getTime() - new Date(log.timestamp).getTime()) < (2 * 60 * 60 * 1000)
                        );

                        if (!alreadySent1) {
                            console.log(`[ShiftScheduler] Sending 1st overtime reminder to ${user.username}`);

                            const reminderMessage = `Your ${overtimeShiftPeriod} shift at GAC has ended 1 hour ago. If you are still working, please press the "Extend Overtime Window" button on the GAC Tracking app to extend your shift.`;

                            try {
                                // Send to employee
                                await sendPersonalWhatsApp(user.phone, reminderMessage, wasenderSettings);

                                // Send to alert group
                                if (wasenderSettings.trackingAlertsGroupId) {
                                    await sendGroupWhatsApp(
                                        wasenderSettings.trackingAlertsGroupId,
                                        `[Overtime Reminder] ${fullName} received first overtime window reminder. Shift ended 1 hour ago.`,
                                        wasenderSettings
                                    );
                                }

                                await storage.createActivityLog({
                                    userId: user.id,
                                    action: "overtime_reminder_1_sent",
                                    details: `Sent first overtime reminder for ${overtimeShiftPeriod} shift`,
                                    timestamp: now
                                });
                            } catch (err) {
                                console.error(`[ShiftScheduler] Failed to send overtime reminder 1 to ${user.username}:`, err);
                            }
                        }
                    }

                    // Reminder 2: At +2 hours after shift end (only if employee extended at +1h)
                    if (hoursSinceEnd >= OVERTIME_REMINDER_2_HOURS && hoursSinceEnd < AUTO_CLOSE_DELAY_HOURS) {
                        // Check if extended after first reminder
                        const hasExtended = shift.lastOvertimeExtension &&
                            new Date(shift.lastOvertimeExtension).getTime() > (endDate.getTime() + OVERTIME_REMINDER_1_HOURS * 60 * 60 * 1000);

                        if (hasExtended) {
                            const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                            const alreadySent2 = logs.some(log =>
                                log.action === "overtime_reminder_2_sent" &&
                                (now.getTime() - new Date(log.timestamp).getTime()) < (2 * 60 * 60 * 1000)
                            );

                            if (!alreadySent2) {
                                console.log(`[ShiftScheduler] Sending 2nd overtime reminder to ${user.username}`);

                                const reminderMessage = `Your ${overtimeShiftPeriod} shift at GAC has ended 2 hours ago. If you are still working, please press the "Extend Overtime Window" button again. Otherwise, your shift will be auto-closed in 1 hour.`;

                                try {
                                    // Send to employee
                                    await sendPersonalWhatsApp(user.phone, reminderMessage, wasenderSettings);

                                    // Send to alert group
                                    if (wasenderSettings.trackingAlertsGroupId) {
                                        await sendGroupWhatsApp(
                                            wasenderSettings.trackingAlertsGroupId,
                                            `[Overtime Reminder] ${fullName} received second overtime window reminder. Shift ended 2 hours ago.`,
                                            wasenderSettings
                                        );
                                    }

                                    await storage.createActivityLog({
                                        userId: user.id,
                                        action: "overtime_reminder_2_sent",
                                        details: `Sent second overtime reminder for ${overtimeShiftPeriod} shift`,
                                        timestamp: now
                                    });
                                } catch (err) {
                                    console.error(`[ShiftScheduler] Failed to send overtime reminder 2 to ${user.username}:`, err);
                                }
                            }
                        }
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

                    // Calculate effective auto-close time considering extensions
                    let effectiveAutoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));

                    // If employee extended overtime, add extension time
                    if (shift.lastOvertimeExtension) {
                        const extensionCount = shift.overtimeReminderCount || 1;
                        effectiveAutoCloseTime = new Date(effectiveAutoCloseTime.getTime() + (extensionCount * OVERTIME_EXTENSION_HOURS * 60 * 60 * 1000));
                    }

                    const minutesUntilAutoClose = (effectiveAutoCloseTime.getTime() - now.getTime()) / (1000 * 60);

                    // Send warning if we're within 15 minutes of auto-close AND shift hasn't auto-closed yet
                    if (minutesUntilAutoClose > 0 && minutesUntilAutoClose <= 15) {
                        // Check if warning was already sent
                        const logs = await storage.getActivityLogsByUser(user.id, shiftDate);
                        const alreadyWarned = logs.some(log =>
                            log.action === "auto_close_warning_sent" &&
                            (now.getTime() - new Date(log.timestamp).getTime()) < (1 * 60 * 60 * 1000) // Within last 1 hour
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

                    // Calculate effective auto-close time considering overtime extensions
                    let autoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));

                    // If employee extended overtime, add extension time
                    if (shift.lastOvertimeExtension) {
                        const extensionCount = shift.overtimeReminderCount || 1;
                        autoCloseTime = new Date(autoCloseTime.getTime() + (extensionCount * OVERTIME_EXTENSION_HOURS * 60 * 60 * 1000));
                    }

                    if (now >= autoCloseTime) {
                        console.log(`[ShiftScheduler] Auto-closing MORNING shift for ${user.username}`);

                        // Use the scheduled shift end time as the clock-out time (not the auto-close time)
                        const clockOutTime = endDate;

                        // 1. End active breaks
                        const activeBreak = await storage.getActiveBreakForDate(user.id, shiftDate);
                        if (activeBreak) {
                            const breakDuration = Math.floor((clockOutTime.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
                            await storage.updateBreak(activeBreak.id, {
                                endTime: clockOutTime,
                                durationMinutes: breakDuration > 0 ? breakDuration : 0
                            });
                        }

                        // 2. Set Morning Clock Out to the scheduled shift end time
                        await storage.updateShift(shift.id, {
                            morningClockOut: clockOutTime,
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed at scheduled end time"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Morning shift auto-closed at scheduled end time: ${scheduledEndTime}`,
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

                    // Calculate effective auto-close time considering overtime extensions
                    let autoCloseTime = new Date(endDate.getTime() + (AUTO_CLOSE_DELAY_HOURS * 60 * 60 * 1000));

                    // If employee extended overtime, add extension time
                    if (shift.lastOvertimeExtension) {
                        const extensionCount = shift.overtimeReminderCount || 1;
                        autoCloseTime = new Date(autoCloseTime.getTime() + (extensionCount * OVERTIME_EXTENSION_HOURS * 60 * 60 * 1000));
                    }

                    if (now >= autoCloseTime) {
                        console.log(`[ShiftScheduler] Auto-closing EVENING shift for ${user.username}`);

                        // Use the scheduled shift end time as the clock-out time (not the auto-close time)
                        const clockOutTime = endDate;

                        // 1. End active breaks
                        const activeBreak = await storage.getActiveBreakForDate(user.id, shiftDate);
                        if (activeBreak) {
                            const breakDuration = Math.floor((clockOutTime.getTime() - new Date(activeBreak.startTime).getTime()) / 60000);
                            await storage.updateBreak(activeBreak.id, {
                                endTime: clockOutTime,
                                durationMinutes: breakDuration > 0 ? breakDuration : 0
                            });
                        }

                        // 2. Set Evening Clock Out to the scheduled shift end time
                        await storage.updateShift(shift.id, {
                            eveningClockOut: clockOutTime,
                            notes: (shift.notes ? shift.notes + "\n" : "") + "[System] Auto-closed at scheduled end time"
                        });

                        // 3. Log Activity
                        await storage.createActivityLog({
                            userId: user.id,
                            action: "shift_auto_close",
                            details: `Evening shift auto-closed at scheduled end time: ${scheduledEndTime}`,
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