// server/routes.ts
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { differenceInMinutes, parse, subHours, format } from "date-fns";
import {
  insertUserSchema,
  insertShiftSchema,
  insertBreakSchema,
  loginSchema,
  insertDailyShiftReportSchema,
  insertSpecialRequestSchema,
  insertRequestCommentSchema,
  BREAK_LIMITS,
  SPECIAL_REQUEST_STATUSES
} from "@shared/schema";
import { z } from "zod";
import {
  notifyShiftStart,
  notifyShiftEnd,
  notifyBreakStart,
  notifyBreakEnd,
  notifyDailyReportSubmitted,
  notifyShiftReportReminder,
  notifySpecialRequestCreated,
  sendTestMessage,
  type WasenderSettings
} from "./wasender";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

// Helper to get WASENDER settings from storage
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

const SALT_ROUNDS = 10;

// ============= SHIFT CONFIGURATION =============
// NOTE: User-specific shift times from database take precedence over these constants.
// These are only used as fallbacks for open shifts or when user data is missing.
const SHIFT_CONFIG = {
  DAY_RESET_BUFFER_HOURS: 3,           // Hours after last shift to reset for new day
  DEFAULT_STALE_SHIFT_MAX_HOURS: 12,   // Max hours before auto-closing open shifts
};
// ============= CLICKUP API CONFIGURATION =============
const CLICKUP_CONFIG = {
  API_KEY: process.env.CLICKUP_API_KEY || "pk_3677597_Y9QGK34UCENA4JYMT1MR8RJVCJN0MDMC",
  TEAM_ID: process.env.CLICKUP_TEAM_ID || "9009178151",
  SPACE_ID: process.env.CLICKUP_SPACE_ID || "90090394573",
  BASE_URL: "https://api.clickup.com/api/v2",
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

// ClickUp cache
let clickUpMembersCache: any = null;
let clickUpMembersCacheTime: number = 0;

// Helper: Fetch from ClickUp API
async function clickUpFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${CLICKUP_CONFIG.BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": CLICKUP_CONFIG.API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`ClickUp API Error: ${response.status} - ${errorText}`);
    throw new Error(`ClickUp API Error: ${response.status}`);
  }

  return response.json();
}

// Helper: Get ClickUp team members (cached)
async function getClickUpMembers(): Promise<any> {
  const now = Date.now();

  if (clickUpMembersCache && (now - clickUpMembersCacheTime) < CLICKUP_CONFIG.CACHE_DURATION) {
    return clickUpMembersCache;
  }

  const data = await clickUpFetch(`/team/${CLICKUP_CONFIG.TEAM_ID}`);
  clickUpMembersCache = data;
  clickUpMembersCacheTime = now;

  return data;
}

// Helper: Find ClickUp user by email
async function findClickUpUserByEmail(email: string): Promise<any | null> {
  try {
    const teamData = await getClickUpMembers();
    const member = teamData.team.members.find(
      (m: any) => m.user.email.toLowerCase() === email.toLowerCase()
    );
    return member?.user || null;
  } catch (error) {
    console.error("Error finding ClickUp user:", error);
    return null;
  }
}
// ============= GRACE PERIOD CONFIGURATION =============
const GRACE_PERIOD_MINUTES = 15; // 15-minute grace period before counting as late

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
    role: string;
  }
}

// ============= LATE CALCULATION HELPER =============
/**
 * Calculate late minutes with a grace period.
 */
function calculateLateMinutesWithGrace(
  clockInTime: Date,
  scheduledStartTime: string | null | undefined,
  gracePeriodMinutes: number = GRACE_PERIOD_MINUTES
): number {
  // If no scheduled start time, no late calculation (open/flexible shift)
  if (!scheduledStartTime) {
    return 0;
  }

  try {
    // Parse the scheduled start time (format: "HH:MM" or "HH:MM:SS")
    const timeParts = scheduledStartTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);

    // Validate parsed values
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.warn(`Invalid scheduled start time format: ${scheduledStartTime}`);
      return 0;
    }

    // Create a date object for the scheduled start time on the same day as clock-in
    const scheduledDate = new Date(clockInTime);
    scheduledDate.setHours(hours, minutes, 0, 0);

    // Calculate the total delay in minutes
    const totalDelayMinutes = Math.floor((clockInTime.getTime() - scheduledDate.getTime()) / (1000 * 60));

    // If clocked in early or on time, not late
    if (totalDelayMinutes <= 0) {
      return 0;
    }

    // If within grace period, not late
    if (totalDelayMinutes <= gracePeriodMinutes) {
      return 0;
    }

    // Late minutes = total delay - grace period
    let lateMinutes = totalDelayMinutes - gracePeriodMinutes;

    // Cap at reasonable maximum (4 hours = 240 minutes)
    if (lateMinutes > 240) {
      console.warn(`Capping late minutes from ${lateMinutes} to 240`);
      lateMinutes = 240;
    }

    return lateMinutes;
  } catch (error) {
    console.error(`Error calculating late minutes:`, error);
    return 0;
  }
}

/**
 * Get the scheduled start time for an employee based on their shift type and period
 */
function getScheduledStartTime(
  user: any,
  shiftPeriod: 'morning' | 'evening'
): string | null {
  if (!user) {
    return null;
  }

  // Open/flexible shifts have no scheduled time
  if (user.shiftType === 'open') {
    return null;
  }

  // One shift type - use shiftStartTime for both morning and evening
  if (user.shiftType === 'one_shift') {
    return user.shiftStartTime || null;
  }

  // Two shifts type - use morning or evening start time
  if (user.shiftType === 'two_shifts') {
    if (shiftPeriod === 'morning') {
      return user.morningShiftStart || null;
    } else {
      return user.eveningShiftStart || null;
    }
  }

  // Fallback to shiftStartTime
  return user.shiftStartTime || null;
}

/**
 * Format time for logging
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Parse user's configured time string (HH:MM) and convert to Date for a specific date
 */
function parseUserTime(dateStr: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  // Create date in Pakistan timezone (UTC+5) using ISO format
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes || 0).padStart(2, '0');
  return new Date(`${dateStr}T${paddedHours}:${paddedMinutes}:00+05:00`);
}

/**
 * Get the hour from a timestamp in Pakistan timezone (Asia/Karachi)
 */
function getHourInPakistan(date: Date): number {
  return parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    hour12: false
  }).format(date), 10);
}

/**
 * Get the date string (YYYY-MM-DD) in Pakistan timezone
 */
function getDateInPakistan(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Calculate the correct scheduled date for a shift based on clock-in time and scheduled start.
 * This handles cross-midnight scenarios where an employee clocks in before midnight
 * for a shift that starts after midnight.
 * 
 * Example: Employee clocks in at 23:45 for a 00:10 shift. The scheduled date should be
 * the NEXT calendar day from when they clocked in.
 * 
 * IMPORTANT: Uses Pakistan timezone (Asia/Karachi) for all calculations since
 * the server may run in UTC but users are in Pakistan (GMT+5).
 * 
 * @param clockInTime - The actual clock-in timestamp
 * @param scheduledStartTimeStr - The scheduled start time (HH:MM)
 * @param workingDate - The working date assigned by the system (YYYY-MM-DD)
 * @returns The correct scheduled date (YYYY-MM-DD)
 */
function calculateScheduledDate(
  clockInTime: Date,
  scheduledStartTimeStr: string | null,
  workingDate: string
): string {
  // If no scheduled start time, use the working date as-is
  if (!scheduledStartTimeStr) {
    return workingDate;
  }
  
  const [startHours] = scheduledStartTimeStr.split(':').map(Number);
  
  // Get clock-in hour in Pakistan timezone (NOT UTC)
  const clockInHourPKT = getHourInPakistan(clockInTime);
  
  // Cross-midnight detection:
  // If the scheduled start is early morning (before 6 AM)
  // AND the clock-in is in late evening (8 PM or later) in Pakistan time
  // Then the employee is clocking in the night BEFORE the actual shift date
  // 
  // Example: Clock-in at 23:45 PKT on Jan 11 for a 00:10 shift means the scheduled date is Jan 12
  if (startHours < 6 && clockInHourPKT >= 20) {
    // Get the clock-in date in Pakistan timezone and add one day
    const clockInDatePKT = getDateInPakistan(clockInTime);
    const nextDay = new Date(clockInDatePKT + 'T12:00:00'); // Use noon to avoid DST issues
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.toISOString().split('T')[0];
  }
  
  return workingDate;
}

// Middleware to check if user is authenticated
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Middleware to check if user is admin
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }
  next();
}

// Helper function to clean empty strings to null/undefined
function cleanEmployeeData(data: any): any {
  const cleaned: any = { ...data };

  // Convert empty strings to null for optional fields
  const optionalFields = [
    'email', 'department', 'position', 'phone',
    'address', 'emergencyContact', 'shiftStartTime', 'shiftEndTime',
    'morningShiftStart', 'morningShiftEnd', 'eveningShiftStart', 'eveningShiftEnd',
    'openShiftRequiredHours' // NEW: Added this field
  ];

  for (const field of optionalFields) {
    if (cleaned[field] === '' || cleaned[field] === undefined) {
      cleaned[field] = null;
    }
  }

  // Handle department placeholder
  if (cleaned.department === '_none_' || cleaned.department === 'none') {
    cleaned.department = null;
  }

  // Handle salary - convert empty/undefined to null, or ensure it's a number
  if (cleaned.salary === '' || cleaned.salary === undefined || cleaned.salary === null) {
    cleaned.salary = null;
  } else {
    cleaned.salary = Number(cleaned.salary);
    if (isNaN(cleaned.salary)) {
      cleaned.salary = null;
    }
  }

  // Ensure boolean fields have proper defaults
  if (cleaned.isActive === undefined) {
    cleaned.isActive = true;
  }

  // Ensure status has default
  if (!cleaned.status) {
    cleaned.status = 'active';
  }

  // Ensure shiftType has default
  if (!cleaned.shiftType) {
    cleaned.shiftType = 'one_shift';
  }

  // Ensure whatsappPreference has default
  if (!cleaned.whatsappPreference) {
    cleaned.whatsappPreference = 'both';
  }

  // ===== IMPORTANT: Clean shift times based on shift type =====
  if (cleaned.shiftType === 'open') {
    // Open/flexible shift - no fixed times
    cleaned.shiftStartTime = null;
    cleaned.shiftEndTime = null;
    cleaned.morningShiftStart = null;
    cleaned.morningShiftEnd = null;
    cleaned.eveningShiftStart = null;
    cleaned.eveningShiftEnd = null;
    // We KEEP openShiftRequiredHours here
  } else if (cleaned.shiftType === 'one_shift') {
    // Single shift - only use shiftStartTime and shiftEndTime
    cleaned.morningShiftStart = null;
    cleaned.morningShiftEnd = null;
    cleaned.eveningShiftStart = null;
    cleaned.eveningShiftEnd = null;
    cleaned.openShiftRequiredHours = null;
    // Keep shiftStartTime and shiftEndTime as they are
  } else if (cleaned.shiftType === 'two_shifts') {
    // Two shifts - only use morning and evening times
    cleaned.shiftStartTime = null;
    cleaned.shiftEndTime = null;
    cleaned.openShiftRequiredHours = null;
    // Keep morningShiftStart, morningShiftEnd, eveningShiftStart, eveningShiftEnd as they are
  }

  return cleaned;
}

// ============= ENHANCED DAY MANAGEMENT HELPERS =============

/**
 * Get current date in Asia/Karachi timezone in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/**
 * Get current hour in Asia/Karachi timezone
 */
function getPakistaniHour(): number {
  return parseInt(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    hour12: false
  }).format(new Date()), 10);
}

// Check if a timestamp is from a specific date (handling timezone)
function isFromDate(timestamp: Date | string | null, dateStr: string): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  const tzDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
  return tzDate === dateStr;
}

// Check if a timestamp is from today in Pakistani time
function isToday(timestamp: Date | string | null): boolean {
  return isFromDate(timestamp, getTodayDate());
}

// Calculate the effective working date considering the 3-hour buffer after last shift
async function getEffectiveWorkingDate(userId: string): Promise<{
  workingDate: string;
  isNewDay: boolean;
  lastShiftInfo: {
    date: string | null;
    lastClockOut: Date | null;
    hoursSinceLastClockOut: number | null;
  };
}> {
  const now = new Date();
  const today = getTodayDate();

  // Get the most recent shift for this user
  const recentShifts = await storage.getShiftsByUser(userId, 2);

  if (!recentShifts || recentShifts.length === 0) {
    // No previous shifts, use today
    return {
      workingDate: today,
      isNewDay: true,
      lastShiftInfo: { date: null, lastClockOut: null, hoursSinceLastClockOut: null }
    };
  }

  const lastShift = recentShifts[0];

  // Determine the last clock out time (prefer evening, fallback to morning)
  const lastClockOut = lastShift.eveningClockOut || lastShift.morningClockOut;

  // If no clock out, shift is still active
  if (!lastClockOut) {
    // Check if the shift is from today or yesterday
    const shiftDate = lastShift.date;

    // If shift date is today, use today
    if (shiftDate === today) {
      return {
        workingDate: today,
        isNewDay: false,
        lastShiftInfo: { date: shiftDate, lastClockOut: null, hoursSinceLastClockOut: null }
      };
    }

    // If shift is from a previous day and still "active" (no clock out), 
    // it might be abandoned - check if we should start a new day
    const shiftDateObj = new Date(shiftDate + "T23:59:59");
    const hoursSinceShiftDate = (now.getTime() - shiftDateObj.getTime()) / (1000 * 60 * 60);

    if (hoursSinceShiftDate >= SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS) {
      // More than buffer hours since the end of that day, consider it a new day
      return {
        workingDate: today,
        isNewDay: true,
        lastShiftInfo: { date: shiftDate, lastClockOut: null, hoursSinceLastClockOut: hoursSinceShiftDate }
      };
    }

    // Otherwise, continue with the previous shift's date
    return {
      workingDate: shiftDate,
      isNewDay: false,
      lastShiftInfo: { date: shiftDate, lastClockOut: null, hoursSinceLastClockOut: hoursSinceShiftDate }
    };
  }

  // Calculate hours since last clock out
  const lastClockOutTime = new Date(lastClockOut);
  const hoursSinceLastClockOut = (now.getTime() - lastClockOutTime.getTime()) / (1000 * 60 * 60);

  // If less than 3 hours since last clock out, continue with that shift's date
  if (hoursSinceLastClockOut < SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS) {
    return {
      workingDate: lastShift.date,
      isNewDay: false,
      lastShiftInfo: { date: lastShift.date, lastClockOut: lastClockOutTime, hoursSinceLastClockOut }
    };
  }

  // More than 3 hours since last clock out - it's a new working day
  return {
    workingDate: today,
    isNewDay: true,
    lastShiftInfo: { date: lastShift.date, lastClockOut: lastClockOutTime, hoursSinceLastClockOut }
  };
}

// Clean up stale breaks and shifts from previous days
async function cleanupStaleRecords(userId: string, currentWorkingDate: string): Promise<{
  staleBreaksEnded: number;
  staleShiftsMarked: number;
}> {
  const now = new Date();
  let staleBreaksEnded = 0;
  let staleShiftsMarked = 0;

  try {
    // End any active breaks that are not from the current working date
    const activeBreaks = await storage.getAllActiveBreaks(userId);

    for (const brk of activeBreaks) {
      if (brk.date !== currentWorkingDate) {
        // This is a stale break from a previous day
        const startTime = new Date(brk.startTime);
        const endOfBreakDay = new Date(brk.date + "T23:59:59");

        // Set end time to end of the break's day or current time, whichever is earlier
        const endTime = endOfBreakDay < now ? endOfBreakDay : now;
        const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);

        await storage.updateBreak(brk.id, {
          endTime: endTime,
          durationMinutes: Math.min(durationMinutes, 480), // Cap at 8 hours
        });

        await storage.createActivityLog({
          userId,
          action: "break_auto_cleanup",
          details: `Auto-ended stale ${brk.type} break from ${brk.date}`,
          timestamp: now,
        });

        staleBreaksEnded++;
      }
    }

    // Get user to access their configured shift times
    const user = await storage.getUser(userId);

    // Mark incomplete shifts from previous days using USER-SPECIFIC times
    const incompleteShifts = await storage.getIncompleteShiftsBeforeDate(userId, currentWorkingDate);

    for (const shift of incompleteShifts) {
      // Auto-complete shifts that weren't properly ended
      const updates: any = { status: "incomplete" };
      
      // Use scheduledDate for cross-midnight shifts, fallback to shift.date for legacy records
      const baseDate = (shift as any).scheduledDate || shift.date;

      if (shift.morningClockIn && !shift.morningClockOut) {
        let autoCloseTime: Date;

        // Use user-specific configuration with scheduledDate for accurate timing
        if (user?.shiftType === 'one_shift' && user.shiftEndTime) {
          // One shift: Use user's configured end time + 2 hour buffer (Auto-Close logic)
          autoCloseTime = parseUserTime(baseDate, user.shiftEndTime);
          autoCloseTime = new Date(autoCloseTime.getTime() + (2 * 60 * 60 * 1000));
        } else if (user?.shiftType === 'two_shifts' && user.morningShiftEnd) {
          // Two shifts: Use morning shift end time + 2 hour buffer
          autoCloseTime = parseUserTime(baseDate, user.morningShiftEnd);
          autoCloseTime = new Date(autoCloseTime.getTime() + (2 * 60 * 60 * 1000));
        } else {
          // Fallback: 12 hours after clock-in for open/unconfigured shifts
          autoCloseTime = new Date(shift.morningClockIn);
          autoCloseTime.setHours(autoCloseTime.getHours() + SHIFT_CONFIG.DEFAULT_STALE_SHIFT_MAX_HOURS);
        }

        // CRITICAL: Ensure auto-close time is not before clock-in time (prevent negative duration)
        const clockInTime = new Date(shift.morningClockIn);
        if (autoCloseTime <= clockInTime) {
          // Set to either end of the same day or clock-in + 8 hours
          autoCloseTime = new Date(clockInTime.getTime() + (8 * 60 * 60 * 1000));
        }

        updates.morningClockOut = autoCloseTime;
      }

      if (shift.eveningClockIn && !shift.eveningClockOut) {
        let autoCloseTime: Date;

        // Use user-specific configuration with scheduledDate for accurate timing
        if (user?.shiftType === 'two_shifts' && user.eveningShiftEnd) {
          // Two shifts: Use evening shift end time + 2 hour buffer
          autoCloseTime = parseUserTime(baseDate, user.eveningShiftEnd);
          autoCloseTime = new Date(autoCloseTime.getTime() + (2 * 60 * 60 * 1000));
        } else {
          // Fallback: 12 hours after clock-in for open/unconfigured shifts
          autoCloseTime = new Date(shift.eveningClockIn);
          autoCloseTime.setHours(autoCloseTime.getHours() + SHIFT_CONFIG.DEFAULT_STALE_SHIFT_MAX_HOURS);
        }

        // CRITICAL: Ensure auto-close time is not before clock-in time
        const clockInTime = new Date(shift.eveningClockIn);
        if (autoCloseTime <= clockInTime) {
          autoCloseTime = new Date(clockInTime.getTime() + (8 * 60 * 60 * 1000));
        }

        updates.eveningClockOut = autoCloseTime;
      }

      await storage.updateShift(shift.id, updates);

      await storage.createActivityLog({
        userId,
        action: "shift_auto_complete",
        details: `Auto-completed incomplete shift from ${shift.date}`,
        timestamp: now,
      });

      staleShiftsMarked++;
    }
  } catch (error) {
    console.error("Error cleaning up stale records:", error);
  }

  return { staleBreaksEnded, staleShiftsMarked };
}

const PostgreSqlStore = connectPg(session);

// ============= REGISTER ROUTES =============
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy for production (behind Replit's reverse proxy)
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // Session middleware
  app.use(
    session({
      store: new PostgreSqlStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "gac-trackings-secret-key-2024",
      resave: false,
      saveUninitialized: false,
      rolling: true, // Refresh session on every request
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  // ============= AUTH ROUTES =============

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(data.username);

      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const isValidPassword = await bcrypt.compare(data.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      if (user.role !== data.role) {
        return res.status(401).json({ error: `This account is not registered as ${data.role}` });
      }

      if (!user.isActive || user.status === "inactive") {
        return res.status(401).json({ error: "Account is deactivated" });
      }

      req.session.userId = user.id;
      req.session.role = user.role;

      const { password, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        req.session.destroy(() => { });
        return res.status(401).json({ error: "User not found" });
      }

      const { password, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      console.error("Failed to get current user:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  // ============= BD TEAM TARGETS (NEW) =============

  // Set/Update BD Target (Admin)
  app.post("/api/bd-targets", requireAdmin, async (req, res) => {
    try {
      // Expecting { userId, month: "YYYY-MM", targetType: "revenue", targetAmount: 5000 }
      const { userId, month, targetType, targetAmount } = req.body;
      const result = await storage.setBdTarget({ userId, month, targetType, targetAmount });
      res.json(result);
    } catch (e) {
      console.error("Failed to set BD target:", e);
      res.status(500).json({ error: "Failed to set BD target" });
    }
  });

  // Get BD Targets (Admin/Employee)
  app.get("/api/bd-targets", requireAuth, async (req, res) => {
    try {
      const month = req.query.month as string;
      const userId = req.session.role === 'admin'
        ? (req.query.userId as string)
        : req.session.userId!;

      const targets = await storage.getBdTargets(userId, month);
      res.json(targets);
    } catch (e) {
      console.error("Failed to fetch BD targets:", e);
      res.status(500).json({ error: "Failed to fetch BD targets" });
    }
  });

  // ============= ADMIN SHIFT ROUTES =============

  // Get shifts for a specific date (Attendance Page)
  app.get("/api/admin/shifts", requireAdmin, async (req, res) => {
    try {
      const date = req.query.date as string;

      // Validate and parse date
      if (!date) {
        // Default to today if no date provided
        const today = new Date().toISOString().split("T")[0];
        const shifts = await storage.getShiftsByDate(today);
        return res.json(shifts);
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({
          error: "Invalid date format. Expected YYYY-MM-DD",
          received: date
        });
      }

      // Validate it's a real date
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: "Invalid date",
          received: date
        });
      }

      console.log(`Fetching shifts for date: ${date}`);

      const shifts = await storage.getShiftsByDate(date);

      console.log(`Found ${shifts.length} shifts for ${date}`);

      res.json(shifts);
    } catch (error) {
      console.error("Failed to fetch shifts for date:", error);
      res.status(500).json({ error: "Failed to fetch attendance data" });
    }
  });

  // Get today's shifts (Staff Activity Monitor)
  app.get("/api/admin/shifts/today", requireAdmin, async (req, res) => {
    try {
      const shifts = await storage.getTodayShifts();
      res.json(shifts);
    } catch (error) {
      console.error("Failed to fetch today's shifts:", error);
      res.status(500).json({ error: "Failed to fetch today's shifts" });
    }
  });

  // ============= ADMIN ROUTES =============

  // Get dashboard stats
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Get all employees
  app.get("/api/admin/employees", requireAdmin, async (req, res) => {
    try {
      const employees = await storage.getAllUsers();
      res.json(employees);
    } catch (error) {
      console.error("Failed to fetch employees:", error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  // Create employee
  app.post("/api/admin/employees", requireAdmin, async (req, res) => {
    try {
      console.log("Creating employee with data:", JSON.stringify(req.body, null, 2));

      // Validate password is provided for new users
      if (!req.body.password || req.body.password.trim() === '') {
        return res.status(400).json({ error: "Password is required for new employees" });
      }

      // Validate required fields
      if (!req.body.username || req.body.username.trim() === '') {
        return res.status(400).json({ error: "Username is required" });
      }
      if (!req.body.firstName || req.body.firstName.trim() === '') {
        return res.status(400).json({ error: "First name is required" });
      }
      if (!req.body.lastName || req.body.lastName.trim() === '') {
        return res.status(400).json({ error: "Last name is required" });
      }

      // Check if username exists
      const existing = await storage.getUserByUsername(req.body.username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Clean and prepare data
      const cleanedData = cleanEmployeeData(req.body);

      // Hash password
      const hashedPassword = await bcrypt.hash(req.body.password, SALT_ROUNDS);

      // Create the user data object with ALL shift time fields
      const userData = {
        username: cleanedData.username.trim(),
        password: hashedPassword,
        firstName: cleanedData.firstName.trim(),
        lastName: cleanedData.lastName.trim(),
        email: cleanedData.email,
        role: cleanedData.role || 'employee',
        department: cleanedData.department,
        position: cleanedData.position,
        salary: cleanedData.salary,
        status: cleanedData.status,
        shiftType: cleanedData.shiftType,
        // One shift times
        shiftStartTime: cleanedData.shiftStartTime,
        shiftEndTime: cleanedData.shiftEndTime,
        // Two shift times
        morningShiftStart: cleanedData.morningShiftStart,
        morningShiftEnd: cleanedData.morningShiftEnd,
        eveningShiftStart: cleanedData.eveningShiftStart,
        eveningShiftEnd: cleanedData.eveningShiftEnd,
        // Open Shift new field
        openShiftRequiredHours: cleanedData.openShiftRequiredHours,
        // Other fields
        phone: cleanedData.phone,
        whatsappPreference: cleanedData.whatsappPreference,
        address: cleanedData.address,
        emergencyContact: cleanedData.emergencyContact,
        isActive: cleanedData.isActive,
      };

      console.log("Final user data to save:", JSON.stringify({
        ...userData,
        password: '[HIDDEN]',
      }, null, 2));

      const user = await storage.createUser(userData);
      const { password, ...safeUser } = user;

      console.log("Employee created successfully:", safeUser.id);
      res.json(safeUser);
    } catch (error: any) {
      console.error("Failed to create employee:", error);
      console.error("Error stack:", error.stack);

      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }

      // Check for unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username or email already exists" });
      }

      res.status(500).json({ error: error.message || "Failed to create employee" });
    }
  });

  // Update employee
  app.patch("/api/admin/employees/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      console.log("Updating employee:", id, JSON.stringify(req.body, null, 2));

      // Check if employee exists
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "Employee not found" });
      }

      // Clean and prepare data
      const cleanedData = cleanEmployeeData(req.body);

      // Handle password - remove if empty, otherwise hash it
      if (cleanedData.password && cleanedData.password.trim() !== '') {
        cleanedData.password = await bcrypt.hash(cleanedData.password, SALT_ROUNDS);
      } else {
        delete cleanedData.password;
      }

      // Check username uniqueness if it's being changed
      if (cleanedData.username && cleanedData.username !== existingUser.username) {
        const usernameExists = await storage.getUserByUsername(cleanedData.username);
        if (usernameExists) {
          return res.status(400).json({ error: "Username already exists" });
        }
      }

      console.log("Cleaned update data:", JSON.stringify({
        ...cleanedData,
        password: cleanedData.password ? '[HIDDEN]' : undefined
      }, null, 2));

      const user = await storage.updateUser(id, cleanedData);
      if (!user) {
        return res.status(404).json({ error: "Employee not found" });
      }

      const { password, ...safeUser } = user;
      console.log("Employee updated successfully:", safeUser.id);
      res.json(safeUser);
    } catch (error: any) {
      console.error("Failed to update employee:", error);
      console.error("Error stack:", error.stack);

      // Check for unique constraint violation
      if (error.code === '23505') {
        return res.status(400).json({ error: "Username or email already exists" });
      }

      res.status(500).json({ error: error.message || "Failed to update employee" });
    }
  });

  // Delete employee
  app.delete("/api/admin/employees/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      // Check if trying to delete self
      if (id === req.session.userId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      await storage.deleteUser(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete employee:", error);
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // Get recent activity logs
  app.get("/api/admin/activity-logs", requireAdmin, async (req, res) => {
    try {
      const logs = await storage.getRecentActivityLogs(50);
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // WASENDER API Config
  app.get("/api/admin/wasender-config", requireAdmin, async (req, res) => {
    try {
      const config = await storage.getWasenderConfig();
      res.json(config || { instanceId: "", apiToken: "", requestsGroupId: null, shiftReportsGroupId: null, trackingAlertsGroupId: null, isActive: false });
    } catch (error) {
      console.error("Failed to fetch WASENDER config:", error);
      res.status(500).json({ error: "Failed to fetch WASENDER config" });
    }
  });

  app.post("/api/admin/wasender-config", requireAdmin, async (req, res) => {
    try {
      const { instanceId, apiToken, requestsGroupId, shiftReportsGroupId, trackingAlertsGroupId, isActive } = req.body;
      const config = await storage.updateWasenderConfig({ instanceId, apiToken, requestsGroupId, shiftReportsGroupId, trackingAlertsGroupId, isActive });
      res.json(config);
    } catch (error) {
      console.error("Failed to update WASENDER config:", error);
      res.status(500).json({ error: "Failed to update WASENDER config" });
    }
  });

  app.post("/api/admin/wasender-test", requireAdmin, async (req, res) => {
    try {
      const config = await storage.getWasenderConfig();
      if (!config?.instanceId || !config?.apiToken) {
        return res.status(400).json({ error: "WASENDER not configured" });
      }

      // Convert config to WasenderSettings format
      const settings: WasenderSettings = {
        apiToken: config.apiToken,
        instanceId: config.instanceId,
        isActive: config.isActive,
        requestsGroupId: config.requestsGroupId || null,
        shiftReportsGroupId: config.shiftReportsGroupId || null,
        trackingAlertsGroupId: config.trackingAlertsGroupId || null,
      };

      const result = await sendTestMessage(settings);

      if (result.success) {
        await storage.updateWasenderConfig({ lastTested: new Date() });
        res.json({ success: true, message: result.message });
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error) {
      console.error("Failed to test WASENDER connection:", error);
      res.status(500).json({ error: "Failed to test WASENDER connection" });
    }
  });

  // Departments
  app.get("/api/admin/departments", requireAdmin, async (req, res) => {
    try {
      const departments = await storage.getDepartments();
      res.json(departments);
    } catch (error) {
      console.error("Failed to fetch departments:", error);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  });

  app.patch("/api/admin/departments/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const dept = await storage.updateDepartment(id, req.body);
      res.json(dept);
    } catch (error) {
      console.error("Failed to update department:", error);
      res.status(500).json({ error: "Failed to update department" });
    }
  });

  // ============= ENHANCED EMPLOYEE ROUTES =============

  // Get today's shift status with proper day management
  app.get("/api/employee/today", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get the effective working date (considering 3-hour buffer)
      const { workingDate, isNewDay, lastShiftInfo } = await getEffectiveWorkingDate(userId);

      // Clean up any stale records from previous days
      const cleanup = await cleanupStaleRecords(userId, workingDate);

      // Get or create today's shift record
      let shift = await storage.getShiftByUserAndDate(userId, workingDate);

      // Determine which shift is active for period-specific logic (breaks, etc)
      const isMorningActive = shift?.morningClockIn && !shift?.morningClockOut;
      const isEveningActive = shift?.eveningClockIn && !shift?.eveningClockOut;
      const activePeriod = isEveningActive ? "evening" : "morning";

      // Get active break (only for working date)
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);

      // Get all breaks for working date
      const breaks = await storage.getBreaksByUserAndDate(userId, workingDate);

      // Get activity logs for working date
      const activityLogs = await storage.getActivityLogsByUser(userId, workingDate);

      // Check if report is submitted for today's shift
      let hasSubmittedReport = false;
      if (shift) {
        const report = await storage.getReportByShiftId(shift.id);
        hasSubmittedReport = !!report;
      }

      // Count breaks by type for working date
      const breakCounts = {
        prayer: breaks.filter(b => b.type === "prayer").length,
        meal: breaks.filter(b => b.type === "meal").length,
        urgent: breaks.filter(b => b.type === "urgent").length,
      };

      // Calculate total break duration
      const totalBreakMinutes = breaks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);

      // Get user's shift configuration
      const user = await storage.getUser(userId);

      // Calculate next reset time
      let nextResetTime: string | null = null;
      if (shift) {
        const lastClockOut = shift.eveningClockOut || shift.morningClockOut;
        if (lastClockOut) {
          const resetTime = new Date(new Date(lastClockOut).getTime() + (SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS * 60 * 60 * 1000));
          nextResetTime = resetTime.toISOString();
        }
      }

      res.json({
        shift,
        activeBreak,
        breaks,
        breakCounts,
        totalBreakMinutes,
        activityLogs,
        hasSubmittedReport,
        currentDate: workingDate,
        isNewDay,
        lastShiftInfo,
        nextResetTime,
        cleanup: cleanup.staleBreaksEnded > 0 || cleanup.staleShiftsMarked > 0 ? cleanup : undefined,
        serverTime: now.toISOString(),
        shiftConfig: {
          shiftType: user?.shiftType || 'one_shift',
          shiftStartTime: user?.shiftStartTime,
          shiftEndTime: user?.shiftEndTime,
          morningShiftStart: (user as any)?.morningShiftStart,
          morningShiftEnd: (user as any)?.morningShiftEnd,
          eveningShiftStart: (user as any)?.eveningShiftStart,
          eveningShiftEnd: (user as any)?.eveningShiftEnd,
          openShiftRequiredHours: (user as any)?.openShiftRequiredHours, // Sent to frontend for UI display
          gracePeriodMinutes: GRACE_PERIOD_MINUTES,
          resetBufferHours: SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS,
        }
      });
    } catch (error) {
      console.error("Failed to fetch today's status:", error);
      res.status(500).json({ error: "Failed to fetch today's status" });
    }
  });

  // Check day status endpoint (lightweight check for frontend polling)
  app.get("/api/employee/day-status", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { workingDate, isNewDay, lastShiftInfo } = await getEffectiveWorkingDate(userId);

      res.json({
        workingDate,
        isNewDay,
        lastShiftInfo,
        serverTime: new Date().toISOString(),
        gracePeriodMinutes: GRACE_PERIOD_MINUTES,
        resetBufferHours: SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS,
      });
    } catch (error) {
      console.error("Failed to check day status:", error);
      res.status(500).json({ error: "Failed to check day status" });
    }
  });

  // ============= MORNING SHIFT START - MODIFIED (2-Hour Restriction & Open Shift Logic) =============
  app.post("/api/employee/shift/morning/start", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate, isNewDay } = await getEffectiveWorkingDate(userId);

      // Clean up stale records first
      await cleanupStaleRecords(userId, workingDate);

      // Get existing shift for working date
      let shift = await storage.getShiftByUserAndDate(userId, workingDate);

      // Check if morning shift already started for this working date
      if (shift?.morningClockIn) {
        if (!shift.morningClockOut) {
          return res.status(400).json({ error: "Morning shift already active" });
        }

        // If it's NOT an open shift, prevent restart
        const user = await storage.getUser(userId);
        if (user?.shiftType !== 'open') {
          return res.status(400).json({ error: "Morning shift already completed for today" });
        }

        // IF OPEN SHIFT IS COMPLETED: WE START A NEW ONE
        // By setting shift to undefined, we trigger the creation logic below 
        // (but we need to make sure we don't try to update the OLD shift)
        // Actually, let's just forcefully create a NEW shift record here
        const newShift = await storage.createShift({
          userId,
          date: workingDate, // Ensure we use the same working date
          morningClockIn: now,
          status: "present",
        });

        await storage.createActivityLog({
          userId,
          action: "clock_in",
          details: `Morning shift started (Additional Session - Open Shift)`,
          timestamp: now,
          metadata: { shiftType: 'open', session: 'additional' }
        });

        // Notify
        const wasenderSettings = await getWasenderSettings();
        notifyShiftStart({
          fullName: `${user.firstName} ${user.lastName}`,
          department: user.department || "Not Assigned",
          phone: user.phone,
          whatsappPreference: user.whatsappPreference
        }, wasenderSettings).catch(console.error);

        return res.json({
          success: true,
          message: "Additional shift started successfully",
          shift: newShift
        });
      }

      // Check if user is on break
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (activeBreak) {
        return res.status(400).json({ error: "Please end your break first" });
      }

      // Get user to check their configured shift start time
      const user = await storage.getUser(userId);

      // =========================================================
      // REQUIREMENT: 2-Hour Start Restriction
      // =========================================================

      const isOpenShift = user?.shiftType === 'open';

      if (!isOpenShift) {
        // Fetch scheduled start time
        const scheduledStartStr = getScheduledStartTime(user, 'morning');

        if (scheduledStartStr) {
          // Use Pakistan timezone for date calculation
          const pktDateStr = getDateInPakistan(now);
          const currentHourPKT = getHourInPakistan(now);
          const [schedHour] = scheduledStartStr.split(':').map(Number);
          
          // Determine the correct date for the scheduled start:
          // If current time is in late evening (20-24) and shift starts in early morning (0-6),
          // the shift is for TOMORROW, use today's date for comparison
          // If current time is in early morning (0-6) and shift starts in early morning (0-6),
          // but later than current time, check if we're within the 2-hour window from yesterday's perspective
          let scheduledDateStr = pktDateStr;
          if (currentHourPKT >= 20 && schedHour < 6) {
            // Current time is late evening, shift is early morning tomorrow
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            scheduledDateStr = getDateInPakistan(tomorrow);
          }
          
          // Create scheduled start time in Pakistan timezone
          const scheduledStart = parseUserTime(scheduledDateStr, scheduledStartStr);
          const earliestStart = subHours(scheduledStart, 2);

          // If current time is BEFORE the earliest allowed start time
          if (now < earliestStart) {
            return res.status(400).json({
              error: `You cannot start the shift yet. Clock-in is allowed from ${format(earliestStart, 'hh:mm a')} (2 hours before shift)`
            });
          }
        }
      }

      // Determine the scheduled start time based on shift type
      const scheduledStartTime = getScheduledStartTime(user, 'morning');

      // Calculate late minutes WITH 15-minute grace period
      const lateMinutes = calculateLateMinutesWithGrace(now, scheduledStartTime, GRACE_PERIOD_MINUTES);

      // Log for debugging
      console.log(`[Morning Clock-In] User: ${userId}`);
      console.log(`  - Shift Type: ${user?.shiftType || 'unknown'}`);
      console.log(`  - Scheduled Start: ${scheduledStartTime || 'Not set (open shift)'}`);
      console.log(`  - Actual Clock-In: ${formatTime(now)}`);
      console.log(`  - Grace Period: ${GRACE_PERIOD_MINUTES} minutes`);
      console.log(`  - Late Minutes: ${lateMinutes}`);

      // Calculate the correct scheduled date for cross-midnight handling
      const scheduledDate = calculateScheduledDate(now, scheduledStartTime, workingDate);

      if (shift) {
        // Update existing shift record
        shift = await storage.updateShift(shift.id, {
          morningClockIn: now,
          morningClockOut: null,
          morningLateMinutes: lateMinutes,
          status: lateMinutes > 0 ? "late" : "present",
          scheduledDate,
        });
      } else {
        // Create new shift record
        shift = await storage.createShift({
          userId,
          date: workingDate,
          scheduledDate,
          morningClockIn: now,
          morningLateMinutes: lateMinutes,
          status: lateMinutes > 0 ? "late" : "present",
        });
      }

      // Create activity log with detailed info
      let logDetails = "On time";
      if (lateMinutes > 0) {
        logDetails = `Late by ${lateMinutes} minutes (after ${GRACE_PERIOD_MINUTES}min grace period)`;
      } else if (scheduledStartTime) {
        logDetails = `On time (within ${GRACE_PERIOD_MINUTES}min grace period)`;
      } else if (isOpenShift) {
        const reqHours = user?.openShiftRequiredHours || "N/A";
        logDetails = `Open Shift Started. Target: ${reqHours} hours`;
      }

      await storage.createActivityLog({
        userId,
        action: "morning_clock_in",
        details: logDetails,
        timestamp: now,
      });

      // Send WhatsApp notification
      if (user) {
        getWasenderSettings().then(settings =>
          notifyShiftStart({
            fullName: `${user.firstName} ${user.lastName}`,
            department: user.department || "Not Assigned",
            phone: user.phone,
            whatsappPreference: user.whatsappPreference
          }, settings)
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      // Prepare response message
      let message = `Morning shift started for ${workingDate}`;
      if (lateMinutes > 0) {
        message += ` (${lateMinutes}m late after ${GRACE_PERIOD_MINUTES}m grace period)`;
      } else if (scheduledStartTime) {
        message += ` (on time)`;
      } else if (isOpenShift) {
        message += ` (Open Shift - Start)`;
      }

      res.json({
        ...shift,
        workingDate,
        isNewDay,
        lateMinutes,
        gracePeriodMinutes: GRACE_PERIOD_MINUTES,
        scheduledStartTime,
        message
      });
    } catch (error) {
      console.error("Failed to start morning shift:", error);
      res.status(500).json({ error: "Failed to start morning shift" });
    }
  });

  // End morning shift (REQUIRES REPORT)
  app.post("/api/employee/shift/morning/end", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate } = await getEffectiveWorkingDate(userId);

      const shift = await storage.getShiftByUserAndDate(userId, workingDate);

      if (!shift?.morningClockIn) {
        return res.status(400).json({ error: "Morning shift not started" });
      }

      if (shift.morningClockOut) {
        return res.status(400).json({ error: "Morning shift already ended" });
      }

      // Check if user is on break - auto end it
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (activeBreak) {
        const durationMinutes = Math.floor(
          (now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000
        );
        await storage.updateBreak(activeBreak.id, {
          endTime: now,
          durationMinutes,
        });

        await storage.createActivityLog({
          userId,
          action: "break_auto_end",
          details: `Auto-ended ${activeBreak.type} break (${durationMinutes} minutes) due to shift end`,
          timestamp: now,
        });
      }

      // Check if report is submitted (REQUIRED)
      const report = await storage.getReportByShiftId(shift.id);
      if (!report) {
        return res.status(400).json({
          error: "Please submit your daily report before ending the shift",
          code: "REPORT_REQUIRED"
        });
      }

      // Calculate total work time
      const workMinutes = Math.floor(
        (now.getTime() - new Date(shift.morningClockIn).getTime()) / 60000
      );

      const updated = await storage.updateShift(shift.id, {
        morningClockOut: now,
      });

      await storage.createActivityLog({
        userId,
        action: "morning_clock_out",
        details: `Morning shift ended. Total time: ${Math.floor(workMinutes / 60)}h ${workMinutes % 60}m`,
        timestamp: now,
      });

      // Send WhatsApp notification
      const user = await storage.getUser(userId);
      const todayBreaks = await storage.getBreaksByUserAndDate(userId, workingDate);
      // Filter breaks to only morning shift period
      const morningBreaks = todayBreaks.filter(b => b.shiftPeriod === "morning");
      const totalBreakMinutes = morningBreaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

      if (user) {
        getWasenderSettings().then(settings =>
          notifyShiftEnd(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            new Date(shift.morningClockIn!),
            workMinutes - totalBreakMinutes,
            morningBreaks.length,
            totalBreakMinutes,
            shift.morningLateMinutes || 0,
            settings
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      // Calculate when the day will reset
      const resetTime = new Date(now.getTime() + (SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS * 60 * 60 * 1000));

      res.json({
        ...updated,
        nextResetTime: resetTime.toISOString(),
        message: `Morning shift ended. New day will start after ${resetTime.toLocaleTimeString()}`
      });
    } catch (error) {
      console.error("Failed to end morning shift:", error);
      res.status(500).json({ error: "Failed to end morning shift" });
    }
  });

  // ============= EVENING SHIFT START - MODIFIED (2-Hour Restriction) =============
  app.post("/api/employee/shift/evening/start", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate, isNewDay } = await getEffectiveWorkingDate(userId);

      // Clean up stale records first
      await cleanupStaleRecords(userId, workingDate);

      let shift = await storage.getShiftByUserAndDate(userId, workingDate);

      // Check if evening shift already started/active for this working date
      if (shift?.eveningClockIn) {
        if (!shift.eveningClockOut) {
          return res.status(400).json({ error: "Evening shift already active" });
        }
        return res.status(400).json({ error: "Evening shift already completed for today" });
      }

      // Check if user is on break
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (activeBreak) {
        return res.status(400).json({ error: "Please end your break first" });
      }

      // Get user to check their configured shift times
      const user = await storage.getUser(userId);

      // ✅ BLOCK ONE_SHIFT USERS from using evening endpoint
      if (user?.shiftType === 'one_shift') {
        return res.status(400).json({
          error: "Your shift type is 'one_shift'. Please use the morning shift endpoint for your entire work day."
        });
      }

      // =========================================================
      // REQUIREMENT: 2-Hour Start Restriction
      // =========================================================
      const isOpenShift = user?.shiftType === 'open';

      if (!isOpenShift) {
        const scheduledStartStr = getScheduledStartTime(user, 'evening');
        if (scheduledStartStr) {
          // Use Pakistan timezone for date calculation
          const pktDateStr = getDateInPakistan(now);
          const currentHourPKT = getHourInPakistan(now);
          const [schedHour] = scheduledStartStr.split(':').map(Number);
          
          // Determine the correct date for the scheduled start:
          // If current time is in early morning (0-6 AM) and shift starts in evening (18-24),
          // the shift started YESTERDAY, not today
          let scheduledDateStr = pktDateStr;
          if (currentHourPKT < 6 && schedHour >= 18) {
            // Shift started yesterday - subtract one day
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            scheduledDateStr = getDateInPakistan(yesterday);
          }
          
          // Create scheduled start time in Pakistan timezone
          const scheduledStart = parseUserTime(scheduledDateStr, scheduledStartStr);
          const earliestStart = subHours(scheduledStart, 2);

          if (now < earliestStart) {
            return res.status(400).json({
              error: `You cannot start the shift yet. Clock-in is allowed from ${format(earliestStart, 'hh:mm a')}`
            });
          }
        }
      }

      // Determine the scheduled start time based on shift type
      const scheduledStartTime = getScheduledStartTime(user, 'evening');

      // Calculate late minutes WITH 15-minute grace period
      const lateMinutes = calculateLateMinutesWithGrace(now, scheduledStartTime, GRACE_PERIOD_MINUTES);

      // Log for debugging
      console.log(`[Evening Clock-In] User: ${userId}`);
      console.log(`  - Shift Type: ${user?.shiftType || 'unknown'}`);
      console.log(`  - Scheduled Start: ${scheduledStartTime || 'Not set (open shift)'}`);
      console.log(`  - Actual Clock-In: ${formatTime(now)}`);
      console.log(`  - Grace Period: ${GRACE_PERIOD_MINUTES} minutes`);
      console.log(`  - Late Minutes: ${lateMinutes}`);

      // Calculate the correct scheduled date for cross-midnight handling
      const scheduledDate = calculateScheduledDate(now, scheduledStartTime, workingDate);

      if (shift) {
        shift = await storage.updateShift(shift.id, {
          eveningClockIn: now,
          eveningClockOut: null,
          eveningLateMinutes: lateMinutes,
          status: shift.status === "not_started" ? (lateMinutes > 0 ? "late" : "present") : shift.status,
          scheduledDate,
        });
      } else {
        shift = await storage.createShift({
          userId,
          date: workingDate,
          scheduledDate,
          eveningClockIn: now,
          eveningLateMinutes: lateMinutes,
          status: lateMinutes > 0 ? "late" : "present",
        });
      }

      // Create activity log with detailed info
      let logDetails = "Evening shift started on time";
      if (lateMinutes > 0) {
        logDetails = `Evening shift - Late by ${lateMinutes} minutes (after ${GRACE_PERIOD_MINUTES}min grace period)`;
      } else if (scheduledStartTime) {
        logDetails = `Evening shift started on time (within ${GRACE_PERIOD_MINUTES}min grace period)`;
      }

      await storage.createActivityLog({
        userId,
        action: "evening_clock_in",
        details: logDetails,
        timestamp: now,
      });

      // Send WhatsApp notification
      if (user) {
        getWasenderSettings().then(settings =>
          notifyShiftStart({
            fullName: `${user.firstName} ${user.lastName}`,
            department: user.department || "Not Assigned",
            phone: user.phone,
            whatsappPreference: user.whatsappPreference
          }, settings)
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      // Prepare response message
      let message = `Evening shift started for ${workingDate}`;
      if (lateMinutes > 0) {
        message += ` (${lateMinutes}m late after ${GRACE_PERIOD_MINUTES}m grace period)`;
      } else if (scheduledStartTime) {
        message += ` (on time)`;
      }

      res.json({
        ...shift,
        workingDate,
        isNewDay,
        lateMinutes,
        gracePeriodMinutes: GRACE_PERIOD_MINUTES,
        scheduledStartTime,
        message
      });
    } catch (error) {
      console.error("Failed to start evening shift:", error);
      res.status(500).json({ error: "Failed to start evening shift" });
    }
  });

  // End evening shift (REQUIRES REPORT)
  app.post("/api/employee/shift/evening/end", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate } = await getEffectiveWorkingDate(userId);

      const shift = await storage.getShiftByUserAndDate(userId, workingDate);

      if (!shift?.eveningClockIn) {
        return res.status(400).json({ error: "Evening shift not started" });
      }

      if (shift.eveningClockOut) {
        return res.status(400).json({ error: "Evening shift already ended" });
      }

      // Check if user is on break - auto end it
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (activeBreak) {
        const durationMinutes = Math.floor(
          (now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000
        );
        await storage.updateBreak(activeBreak.id, {
          endTime: now,
          durationMinutes,
        });

        await storage.createActivityLog({
          userId,
          action: "break_auto_end",
          details: `Auto-ended ${activeBreak.type} break (${durationMinutes} minutes) due to shift end`,
          timestamp: now,
        });
      }

      // Check if report is submitted (REQUIRED)
      const report = await storage.getReportByShiftId(shift.id);
      if (!report) {
        return res.status(400).json({
          error: "Please submit your daily report before ending the shift",
          code: "REPORT_REQUIRED"
        });
      }

      const workMinutes = Math.floor(
        (now.getTime() - new Date(shift.eveningClockIn).getTime()) / 60000
      );

      const updated = await storage.updateShift(shift.id, {
        eveningClockOut: now,
      });

      await storage.createActivityLog({
        userId,
        action: "evening_clock_out",
        details: `Evening shift ended. Total time: ${Math.floor(workMinutes / 60)}h ${workMinutes % 60}m`,
        timestamp: now,
      });

      // Send WhatsApp notification
      const user = await storage.getUser(userId);
      const todayBreaks = await storage.getBreaksByUserAndDate(userId, workingDate);
      // Filter breaks to only evening shift period
      const eveningBreaks = todayBreaks.filter(b => b.shiftPeriod === "evening");
      const totalBreakMinutes = eveningBreaks.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);

      if (user) {
        getWasenderSettings().then(settings =>
          notifyShiftEnd(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            new Date(shift.eveningClockIn!),
            workMinutes - totalBreakMinutes,
            eveningBreaks.length,
            totalBreakMinutes,
            shift.eveningLateMinutes || 0,
            settings
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      // Calculate when the day will reset
      const resetTime = new Date(now.getTime() + (SHIFT_CONFIG.DAY_RESET_BUFFER_HOURS * 60 * 60 * 1000));

      res.json({
        ...updated,
        nextResetTime: resetTime.toISOString(),
        message: `Evening shift ended. New day will start after ${resetTime.toLocaleTimeString()}`
      });
    } catch (error) {
      console.error("Failed to end evening shift:", error);
      res.status(500).json({ error: "Failed to end evening shift" });
    }
  });

  // Start break with enhanced validation
  app.post("/api/employee/break/start", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();
      const { type } = req.body;

      if (!["prayer", "meal", "urgent"].includes(type)) {
        return res.status(400).json({ error: "Invalid break type. Must be prayer, meal, or urgent" });
      }

      // Get effective working date
      const { workingDate } = await getEffectiveWorkingDate(userId);

      // Check if shift is active for working date
      const shift = await storage.getShiftByUserAndDate(userId, workingDate);

      const isMorningActive = shift?.morningClockIn && !shift?.morningClockOut;
      const isEveningActive = shift?.eveningClockIn && !shift?.eveningClockOut;

      if (!isMorningActive && !isEveningActive) {
        return res.status(400).json({ error: "No active shift. Please clock in first" });
      }

      // Determine period based on which shift is currently active
      const currentPeriod = isEveningActive ? "evening" : "morning";

      // Check if already on break
      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (activeBreak) {
        return res.status(400).json({ error: "Already on a break. Please end your current break first" });
      }

      // Check break limits for working date
      const todayBreaks = await storage.getBreaksByUserAndDate(userId, workingDate);

      if (type === "prayer") {
        const prayerBreaks = todayBreaks.filter(b => b.type === "prayer");
        if (prayerBreaks.length >= BREAK_LIMITS.prayer.maxPerDay) {
          return res.status(400).json({
            error: `Maximum prayer breaks (${BREAK_LIMITS.prayer.maxPerDay}) reached for today`,
            currentCount: prayerBreaks.length,
            maxAllowed: BREAK_LIMITS.prayer.maxPerDay
          });
        }
      } else if (type === "meal") {
        const mealBreaks = todayBreaks.filter(b => b.type === "meal");
        if (mealBreaks.length >= BREAK_LIMITS.meal.maxPerDay) {
          return res.status(400).json({
            error: "Meal break already taken today",
            currentCount: mealBreaks.length,
            maxAllowed: BREAK_LIMITS.meal.maxPerDay
          });
        }
      } else if (type === "urgent") {
        const urgentBreaksThisPeriod = todayBreaks.filter(
          b => b.type === "urgent" && b.shiftPeriod === currentPeriod
        );
        if (urgentBreaksThisPeriod.length >= BREAK_LIMITS.urgent.maxPerShift) {
          return res.status(400).json({
            error: `Maximum urgent breaks (${BREAK_LIMITS.urgent.maxPerShift}) reached for this ${currentPeriod} shift`,
            currentCount: urgentBreaksThisPeriod.length,
            maxAllowed: BREAK_LIMITS.urgent.maxPerShift
          });
        }
      }

      const breakRecord = await storage.createBreak({
        userId,
        shiftId: shift?.id || null,
        date: workingDate,
        type,
        shiftPeriod: currentPeriod,
        startTime: now,
      });

      await storage.createActivityLog({
        userId,
        action: "break_start",
        details: `Started ${type} break during ${currentPeriod} shift`,
        timestamp: now,
      });

      // Send WhatsApp notification
      const user = await storage.getUser(userId);
      if (user) {
        getWasenderSettings().then(settings =>
          notifyBreakStart(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            type,
            settings
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      res.json(breakRecord);
    } catch (error) {
      console.error("Failed to start break:", error);
      res.status(500).json({ error: "Failed to start break" });
    }
  });

  // End break with duration validation
  app.post("/api/employee/break/end", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate } = await getEffectiveWorkingDate(userId);

      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (!activeBreak) {
        return res.status(400).json({ error: "No active break to end" });
      }

      const durationMinutes = Math.floor(
        (now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000
      );

      // Warn if break was too long
      let warning = null;
      const maxBreakMinutes = {
        prayer: 15,
        meal: 45,
        urgent: 10
      };

      if (durationMinutes > maxBreakMinutes[activeBreak.type as keyof typeof maxBreakMinutes]) {
        warning = `Break exceeded recommended duration of ${maxBreakMinutes[activeBreak.type as keyof typeof maxBreakMinutes]} minutes`;
      }

      const updated = await storage.updateBreak(activeBreak.id, {
        endTime: now,
        durationMinutes,
      });

      await storage.createActivityLog({
        userId,
        action: "break_end",
        details: `Ended ${activeBreak.type} break (${durationMinutes} minutes)${warning ? ` - ${warning}` : ''}`,
        timestamp: now,
      });

      // Send WhatsApp notification
      const user = await storage.getUser(userId);
      if (user) {
        getWasenderSettings().then(settings =>
          notifyBreakEnd(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            activeBreak.type,
            durationMinutes,
            settings
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      res.json({ ...updated, warning });
    } catch (error) {
      console.error("Failed to end break:", error);
      res.status(500).json({ error: "Failed to end break" });
    }
  });

  // Force end all active breaks (for cleanup)
  app.post("/api/employee/break/force-end", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const now = new Date();

      // Get effective working date
      const { workingDate } = await getEffectiveWorkingDate(userId);

      const activeBreak = await storage.getActiveBreakForDate(userId, workingDate);
      if (!activeBreak) {
        return res.json({ message: "No active break to end" });
      }

      const durationMinutes = Math.floor(
        (now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000
      );

      const updated = await storage.updateBreak(activeBreak.id, {
        endTime: now,
        durationMinutes,
      });

      await storage.createActivityLog({
        userId,
        action: "break_force_end",
        details: `Force-ended ${activeBreak.type} break (${durationMinutes} minutes)`,
        timestamp: now,
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to force end break:", error);
      res.status(500).json({ error: "Failed to force end break" });
    }
  });

  // Get employee's shift history
  app.get("/api/employee/shifts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const limit = parseInt(req.query.limit as string) || 30;
      const shifts = await storage.getShiftsByUser(userId, limit);
      res.json(shifts);
    } catch (error) {
      console.error("Failed to fetch shifts:", error);
      res.status(500).json({ error: "Failed to fetch shifts" });
    }
  });

  // Get employee's activity logs
  app.get("/api/employee/activity-logs", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const date = req.query.date as string || getTodayDate();
      const logs = await storage.getActivityLogsByUser(userId, date);
      res.json(logs);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // Force reset dashboard for new day
  app.post("/api/employee/force-reset", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const today = getTodayDate();

      // Clean up all stale records
      const cleanup = await cleanupStaleRecords(userId, today);

      await storage.createActivityLog({
        userId,
        action: "day_force_reset",
        details: `Manual day reset. Cleaned: ${cleanup.staleBreaksEnded} breaks, ${cleanup.staleShiftsMarked} shifts`,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: "Dashboard reset for new day",
        date: today,
        cleanup
      });
    } catch (error) {
      console.error("Failed to reset day:", error);
      res.status(500).json({ error: "Failed to reset day" });
    }
  });

  // Legacy endpoint - kept for backward compatibility
  app.post("/api/employee/reset-day", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const today = getTodayDate();

      // Clean up all stale records
      const cleanup = await cleanupStaleRecords(userId, today);

      res.json({
        success: true,
        message: "Dashboard reset for new day",
        date: today,
        cleanup
      });
    } catch (error) {
      console.error("Failed to reset day:", error);
      res.status(500).json({ error: "Failed to reset day" });
    }
  });

  // ============= TARGETS ROUTES =============

  app.get("/api/employee/targets", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);

      const target = await storage.getTargetByUserAndMonth(userId, month);
      if (!target) {
        return res.json({ target: null, items: [] });
      }

      const items = await storage.getTargetItemsByTarget(target.id);
      res.json({ target, items });
    } catch (error) {
      console.error("Failed to fetch targets:", error);
      res.status(500).json({ error: "Failed to fetch targets" });
    }
  });

  app.post("/api/employee/targets/items", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { type, name, source, contactLink, date } = req.body;
      const month = (date as string).slice(0, 7);

      if (!["meeting", "order"].includes(type)) {
        return res.status(400).json({ error: "Invalid target item type" });
      }

      let target = await storage.getTargetByUserAndMonth(userId, month);
      if (!target) {
        target = await storage.createTarget({ userId, month });
      }

      const item = await storage.createTargetItem({
        targetId: target.id,
        userId,
        type,
        name,
        source,
        contactLink,
        date,
      });

      await storage.createActivityLog({
        userId,
        action: `target_${type}_added`,
        details: `Added ${type}: ${name}`,
        timestamp: new Date(),
      });

      res.json(item);
    } catch (error) {
      console.error("Failed to add target item:", error);
      res.status(500).json({ error: "Failed to add target item" });
    }
  });

  // Delete target item (employee can delete their own unverified items)
  app.delete("/api/employee/targets/items/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const item = await storage.getTargetItemById(id);
      if (!item) {
        return res.status(404).json({ error: "Target item not found" });
      }

      // Only allow deleting own items that aren't verified
      if (item.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this item" });
      }

      if (item.verified) {
        return res.status(400).json({ error: "Cannot delete verified items" });
      }

      await storage.updateTargetItem(id, {
        isRejected: true,
        verified: false,
        verifiedAt: null,
        verifiedBy: null
      });

      await storage.createActivityLog({
        userId,
        action: `target_${item.type}_rejected`,
        details: `Deleted ${item.type}: ${item.name}`,
        timestamp: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete target item:", error);
      res.status(500).json({ error: "Failed to delete target item" });
    }
  });

  // Update target item (employee can update their own unverified items)
  app.patch("/api/employee/targets/items/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;
      const { name, source, contactLink, date } = req.body;

      const item = await storage.getTargetItemById(id);
      if (!item) {
        return res.status(404).json({ error: "Target item not found" });
      }

      // Only allow updating own items that aren't verified
      if (item.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this item" });
      }

      if (item.verified) {
        return res.status(400).json({ error: "Cannot update verified items" });
      }

      const updated = await storage.updateTargetItem(id, {
        name,
        source,
        contactLink,
        date,
      });

      await storage.createActivityLog({
        userId,
        action: `target_${item.type}_updated`,
        details: `Updated ${item.type}: ${name}`,
        timestamp: new Date(),
      });

      res.json(updated);
    } catch (error) {
      console.error("Failed to update target item:", error);
      res.status(500).json({ error: "Failed to update target item" });
    }
  });

  // Get current user's target items for current month (employee endpoint)
  app.get("/api/employee/targets/items", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);

      const items = await storage.getTargetItemsByUserAndMonth(userId, month);
      res.json(items);
    } catch (error) {
      console.error("Failed to fetch target items:", error);
      res.status(500).json({ error: "Failed to fetch target items" });
    }
  });

  // Get employee's targets summary
  app.get("/api/employee/targets/summary", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);

      // Get or create target for this user/month
      let target = await storage.getTargetByUserAndMonth(userId, month);

      // Get all items for this user and month
      const items = await storage.getTargetItemsByUserAndMonth(userId, month);

      // Calculate stats
      const meetings = items.filter(i => i.type === "meeting");
      const orders = items.filter(i => i.type === "order");

      res.json({
        target: target || { meetingTarget: 20, orderTarget: 5 }, // Default targets
        meetings: {
          total: meetings.filter(i => !i.isRejected).length,
          verified: meetings.filter(m => m.verified).length,
          rejected: meetings.filter(m => !!m.isRejected).length,
          items: meetings,
        },
        orders: {
          total: orders.filter(i => !i.isRejected).length,
          verified: orders.filter(o => o.verified).length,
          rejected: orders.filter(o => !!o.isRejected).length,
          items: orders,
        },
      });
    } catch (error) {
      console.error("Failed to fetch targets summary:", error);
      res.status(500).json({ error: "Failed to fetch targets summary" });
    }
  });

  app.get("/api/admin/targets", requireAdmin, async (req, res) => {
    try {
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);
      const allTargets = await storage.getAllTargetsForMonth(month);
      res.json(allTargets);
    } catch (error) {
      console.error("Failed to fetch targets:", error);
      res.status(500).json({ error: "Failed to fetch targets" });
    }
  });

  app.post("/api/admin/targets", requireAdmin, async (req, res) => {
    try {
      const { userId, month, meetingTarget, orderTarget } = req.body;

      let target = await storage.getTargetByUserAndMonth(userId, month);
      if (target) {
        target = await storage.updateTarget(target.id, { meetingTarget, orderTarget });
      } else {
        target = await storage.createTarget({ userId, month, meetingTarget, orderTarget });
      }

      res.json(target);
    } catch (error) {
      console.error("Failed to set targets:", error);
      res.status(500).json({ error: "Failed to set targets" });
    }
  });

  app.patch("/api/admin/targets/items/:id/verify", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.session.userId!;

      console.log(`[DEBUG] Verifying item ID: ${id}`);
      const item = await storage.updateTargetItem(id, {
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        isRejected: false,
      });
      console.log(`[DEBUG] Verification result:`, item ? "Success" : "Failed");

      if (!item) {
        return res.status(404).json({ error: "Target item not found" });
      }

      res.json(item);
    } catch (error) {
      console.error("Failed to verify target item:", error);
      res.status(500).json({ error: "Failed to verify target item" });
    }
  });

  // Admin: Unverify target item
  app.patch("/api/admin/targets/items/:id/unverify", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const item = await storage.updateTargetItem(id, {
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
      });

      if (!item) {
        return res.status(404).json({ error: "Target item not found" });
      }

      res.json(item);
    } catch (error) {
      console.error("Failed to unverify target item:", error);
      res.status(500).json({ error: "Failed to unverify target item" });
    }
  });

  // Admin: Reject target item (previously delete)
  app.delete("/api/admin/targets/items/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.session.userId!;
      console.log(`[DEBUG] Rejecting target item ID: ${id} by admin: ${adminId}`);

      const item = await storage.getTargetItemById(id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const updatedItem = await storage.updateTargetItem(id, {
        isRejected: true,
        verified: false,
        verifiedAt: null,
        verifiedBy: null
      });

      await storage.createActivityLog({
        userId: adminId,
        action: `target_${item.type}_rejected`,
        details: `Rejected ${item.type}: ${item.name}`,
        timestamp: new Date(),
      });

      console.log(`[DEBUG] Rejection successful for item: ${id}`);
      res.json({ success: true, message: "Entry rejected", item: updatedItem });
    } catch (error) {
      console.error("Failed to reject target item:", error);
      res.status(500).json({ error: "Failed to reject target item" });
    }
  });

  app.get("/api/admin/targets/items", requireAdmin, async (req, res) => {
    try {
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);
      const items = await storage.getAllTargetItemsForMonth(month);
      res.json(items);
    } catch (error) {
      console.error("Failed to fetch target items:", error);
      res.status(500).json({ error: "Failed to fetch target items" });
    }
  });

  // ============= ANALYTICS ROUTES =============

  app.get("/api/admin/analytics/attendance", requireAdmin, async (req, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const analytics = await storage.getAttendanceAnalytics(startDate, endDate);
      res.json(analytics);
    } catch (error) {
      console.error("Failed to fetch attendance analytics:", error);
      res.status(500).json({ error: "Failed to fetch attendance analytics" });
    }
  });

  app.get("/api/admin/analytics/departments", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getDepartmentStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch department stats:", error);
      res.status(500).json({ error: "Failed to fetch department stats" });
    }
  });

  // ============================================
  // DAILY REPORTS ENDPOINTS
  // ============================================

  // Submit daily report (employee) - POST
  app.post("/api/reports/daily", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const today = new Date().toISOString().split("T")[0];

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // ============================================
      // VALIDATION - ONLY WORK DETAILS IS REQUIRED
      // ============================================
      if (!req.body.workDetails || String(req.body.workDetails).trim() === '') {
        return res.status(400).json({ error: "Work details are required" });
      }

      // Get or validate shift
      let shiftId = req.body.shiftId;
      if (!shiftId) {
        const shift = await storage.getShiftByUserAndDate(userId, today);
        if (!shift) {
          return res.status(400).json({ error: "No shift found for today. Please clock in first." });
        }
        shiftId = shift.id;
      }

      // Check if report already exists for this shift
      const existingReport = await storage.getReportByShiftId(shiftId);
      if (existingReport) {
        return res.status(400).json({ error: "Report already submitted for this shift" });
      }

      // ============================================
      // SAFE HANDLING OF OPTIONAL FIELDS
      // Handle null, undefined, and empty strings
      // ============================================
      const safeString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
      };

      const loomVideos = safeString(req.body.loomVideos);
      const notes = safeString(req.body.notes);
      const references = safeString(req.body.references);

      const reportData = {
        userId,
        shiftId,
        date: req.body.date || today,
        workDetails: String(req.body.workDetails).trim(),
        loomVideos,    // Optional - can be null
        notes,         // Optional - can be null
        references,    // Optional - can be null
        shiftType: req.body.shiftType, // New field from request
        month: req.body.month || new Date().toISOString().slice(0, 7),
      };

      const report = await storage.createDailyShiftReport(reportData);

      await storage.createActivityLog({
        userId,
        action: "report_submitted",
        details: "Daily shift report submitted",
        timestamp: new Date(),
      });

      // Send WhatsApp notification
      if (user) {
        getWasenderSettings().then(settings =>
          notifyDailyReportSubmitted(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            reportData.workDetails,
            settings,
            req.body.shiftType // Pass shiftType to notification
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      res.json(report);
    } catch (error: any) {
      console.error("Failed to create daily report:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message || "Failed to create daily report" });
    }
  });

  // Update daily report (employee) - PATCH
  app.patch("/api/reports/daily/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const report = await storage.getDailyShiftReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (report.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to edit this report" });
      }

      // ============================================
      // VALIDATION - ONLY WORK DETAILS IS REQUIRED
      // ============================================
      if (!req.body.workDetails || String(req.body.workDetails).trim() === '') {
        return res.status(400).json({ error: "Work details are required" });
      }

      // ============================================
      // SAFE HANDLING OF OPTIONAL FIELDS
      // ============================================
      const safeString = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        const str = String(value).trim();
        return str.length > 0 ? str : null;
      };

      const loomVideos = safeString(req.body.loomVideos);
      const notes = safeString(req.body.notes);
      const references = safeString(req.body.references);

      const updatedReport = await storage.updateDailyShiftReport(id, {
        workDetails: String(req.body.workDetails).trim(),
        loomVideos,    // Optional - can be null
        notes,         // Optional - can be null
        references,    // Optional - can be null
        shiftType: req.body.shiftType,
      });

      await storage.createActivityLog({
        userId,
        action: "report_updated",
        details: "Daily shift report updated",
        timestamp: new Date(),
      });

      res.json(updatedReport);
    } catch (error: any) {
      console.error("Failed to update daily report:", error);
      res.status(500).json({ error: error.message || "Failed to update daily report" });
    }
  });

  // Get my daily reports - GET
  app.get("/api/reports/daily/my", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = req.query.month as string | undefined;
      const reports = await storage.getDailyShiftReportsByUser(userId, month);
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch daily reports:", error);
      res.status(500).json({ error: "Failed to fetch daily reports" });
    }
  });

  // Get report by shift ID - GET
  app.get("/api/reports/daily/shift/:shiftId", requireAuth, async (req, res) => {
    try {
      const report = await storage.getReportByShiftId(req.params.shiftId);
      res.json(report || null);
    } catch (error) {
      console.error("Failed to fetch report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // Get today's report status - GET
  app.get("/api/reports/daily/today", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const today = new Date().toISOString().split("T")[0];

      const shift = await storage.getShiftByUserAndDate(userId, today);
      if (!shift) {
        return res.json({ hasReport: false, report: null });
      }

      const report = await storage.getReportByShiftId(shift.id);
      res.json({ hasReport: !!report, report });
    } catch (error) {
      console.error("Failed to fetch today's report:", error);
      res.status(500).json({ error: "Failed to fetch today's report" });
    }
  });

  // Get single report by ID - GET
  app.get("/api/reports/daily/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { id } = req.params;

      const report = await storage.getDailyShiftReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Check if user owns this report or is admin
      const user = await storage.getUser(userId);
      if (report.userId !== userId && user?.role !== 'admin') {
        return res.status(403).json({ error: "Not authorized to view this report" });
      }

      res.json(report);
    } catch (error) {
      console.error("Failed to fetch report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // Admin: Get general analytics for reports page
  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    try {
      const data = await storage.getReportsData();
      res.json(data);
    } catch (error) {
      console.error("Failed to fetch reports analytics:", error);
      res.status(500).json({ error: "Failed to fetch reports analytics" });
    }
  });

  // Admin: Get all daily reports for a month
  app.get("/api/admin/reports/daily", requireAdmin, async (req, res) => {
    try {
      const month = req.query.month as string;
      if (!month) {
        return res.status(400).json({ error: "Month parameter required" });
      }
      const reports = await storage.getDailyShiftReportsByMonth(month);
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch daily reports:", error);
      res.status(500).json({ error: "Failed to fetch daily reports" });
    }
  });

  // Admin: Delete a daily report
  app.delete("/api/admin/reports/daily/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify report exists
      const report = await storage.getDailyShiftReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      await storage.deleteDailyShiftReport(id);
      
      // Log the action
      const adminId = req.session.userId!;
      await storage.createActivityLog({
        userId: adminId,
        action: "admin_delete_report",
        details: `Deleted report for user ${report.userId} dated ${report.date}`,
        timestamp: new Date()
      });

      res.json({ success: true, message: "Report deleted successfully" });
    } catch (error) {
      console.error("Failed to delete report:", error);
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // ============= SPECIAL REQUEST ROUTES =============

  // Create special request (Employee)
  app.post("/api/requests/special", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Validate required fields
      if (!req.body.title || req.body.title.trim() === '') {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!req.body.details || req.body.details.trim() === '') {
        return res.status(400).json({ error: "Details are required" });
      }

      const requestData = {
        userId,
        title: req.body.title.trim(),
        details: req.body.details.trim(),
        month: req.body.month || new Date().toISOString().slice(0, 7),
        status: "sent_for_approval",
        archived: false,
      };

      console.log("Creating special request:", requestData);

      const request = await storage.createSpecialRequest(requestData);

      console.log("Created special request:", request);

      await storage.createActivityLog({
        userId,
        action: "special_request_created",
        details: `Created special request: ${requestData.title}`,
        timestamp: new Date(),
      });

      // Send WhatsApp notification
      if (user) {
        getWasenderSettings().then(settings =>
          notifySpecialRequestCreated(
            {
              fullName: `${user.firstName} ${user.lastName}`,
              department: user.department || "Not Assigned",
              phone: user.phone,
              whatsappPreference: user.whatsappPreference
            },
            requestData.title,
            requestData.details,
            settings
          )
        ).catch(err => console.error("WhatsApp notification error:", err));
      }

      res.json(request);
    } catch (error: any) {
      console.error("Failed to create request:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: error.message || "Failed to create request" });
    }
  });

  // Get my special requests (Employee)
  app.get("/api/requests/special/my", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);

      console.log("Fetching requests for user:", userId, "month:", month);

      const requests = await storage.getSpecialRequestsByUser(userId, month);

      console.log("Found requests:", requests.length);

      res.json(requests);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Get all special requests (Admin) - WITH USER DATA
  app.get("/api/admin/requests/special", requireAdmin, async (req, res) => {
    try {
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);
      const status = req.query.status as string;

      console.log("Admin fetching requests - Month:", month, "Status:", status);

      let requests;
      if (status && status !== "all") {
        requests = await storage.getSpecialRequestsByStatusWithUser(status, month);
      } else {
        requests = await storage.getSpecialRequestsByMonthWithUser(month);
      }

      console.log("Found admin requests:", requests.length);

      res.json(requests);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
      res.status(500).json({ error: "Failed to fetch requests" });
    }
  });

  // Update special request status (Admin)
  app.patch("/api/admin/requests/special/:id", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;

      if (!status || !SPECIAL_REQUEST_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const request = await storage.updateSpecialRequest(req.params.id, { status });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Add activity log for status change
      await storage.createActivityLog({
        userId: req.session.userId!,
        action: "special_request_status_update",
        details: `Updated special request status to ${status} for ${request.userId}`,
        timestamp: new Date(),
      });

      res.json(request);
    } catch (error) {
      console.error("Failed to update request:", error);
      res.status(500).json({ error: "Failed to update request" });
    }
  });

  // ============= REQUEST COMMENT ROUTES =============

  // Add comment to request
  app.post("/api/requests/special/:id/comments", requireAuth, async (req, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.session.userId!;
      const isAdmin = req.session.role === "admin";
      const { comment, statusChange } = req.body;

      if (!comment || comment.trim() === '') {
        return res.status(400).json({ error: "Comment is required" });
      }

      // Check if request exists
      const request = await storage.getSpecialRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Check permissions - employee can only comment on their own requests
      if (!isAdmin && request.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Create the comment
      const newComment = await storage.addRequestComment({
        requestId,
        userId,
        comment: comment.trim(),
        isAdminComment: isAdmin,
        statusChange: isAdmin && statusChange ? statusChange : null,
      });

      // Add activity log for comment
      await storage.createActivityLog({
        userId,
        action: "special_request_comment",
        details: `Added a comment to special request: ${request.title}`,
        timestamp: new Date(),
      });

      // Update request status if admin changed it
      if (isAdmin && statusChange && SPECIAL_REQUEST_STATUSES.includes(statusChange)) {
        await storage.updateSpecialRequest(requestId, { status: statusChange });
      }

      // Fetch comment with user info
      const commentWithUser = await storage.getRequestCommentWithUser(newComment.id);

      res.json(commentWithUser || newComment);
    } catch (error) {
      console.error("Failed to add comment:", error);
      res.status(500).json({ error: "Failed to add comment" });
    }
  });

  // Get comments for a request
  app.get("/api/requests/special/:id/comments", requireAuth, async (req, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.session.userId!;
      const isAdmin = req.session.role === "admin";

      // Check if request exists
      const request = await storage.getSpecialRequest(requestId);
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // Check permissions
      if (!isAdmin && request.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const comments = await storage.getRequestCommentsWithUser(requestId);
      res.json(comments);
    } catch (error) {
      console.error("Failed to fetch comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // ============= ARCHIVE ROUTES =============

  app.get("/api/archive/months", requireAuth, async (req, res) => {
    try {
      const months = await storage.getArchivedMonths();
      res.json(months);
    } catch (error) {
      console.error("Failed to fetch archived months:", error);
      res.status(500).json({ error: "Failed to fetch archived months" });
    }
  });

  app.get("/api/archive/reports/:month", requireAuth, async (req, res) => {
    try {
      const reports = await storage.getArchivedReports(req.params.month);
      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch archived reports:", error);
      res.status(500).json({ error: "Failed to fetch archived reports" });
    }
  });

  app.get("/api/archive/requests/:month", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getArchivedRequests(req.params.month);
      res.json(requests);
    } catch (error) {
      console.error("Failed to fetch archived requests:", error);
      res.status(500).json({ error: "Failed to fetch archived requests" });
    }
  });

  app.post("/api/admin/archive/:month", requireAdmin, async (req, res) => {
    try {
      const archive = await storage.archiveMonth(req.params.month);
      res.json(archive);
    } catch (error) {
      console.error("Failed to archive month:", error);
      res.status(500).json({ error: "Failed to archive month" });
    }
  });

  // ============= ADMIN TARGET BOARD SUMMARY =============

  // Get all BD employees' targets summary for admin Target Board
  app.get("/api/admin/targets/summary", requireAdmin, async (req, res) => {
    try {
      const month = req.query.month as string || new Date().toISOString().slice(0, 7);
      console.log(`[DEBUG] Fetching admin targets summary for month: ${month}`);
      // Get all employees
      const allUsers = await storage.getAllUsers();

      // Filter to only Business Development employees who are active
      const bdEmployees = allUsers.filter(u =>
        u.role === "employee" &&
        u.status === "active" &&
        u.department === "Business Development"
      );

      // Build data for each employee
      const employeesData = await Promise.all(
        bdEmployees.map(async (employee) => {
          // Get target for this employee and month
          const target = await storage.getTargetByUserAndMonth(employee.id, month);

          // Get all target items for this employee and month
          const items = await storage.getTargetItemsByUserAndMonth(employee.id, month);

          const meetings = items.filter((i: any) => i.type === "meeting");
          const orders = items.filter((i: any) => i.type === "order");

          return {
            employee,
            target: target || { meetingTarget: 20, orderTarget: 5 },
            meetings: {
              total: meetings.filter((i: any) => !i.isRejected).length,
              verified: meetings.filter((m: any) => m.verified).length,
              rejected: meetings.filter((m: any) => !!m.isRejected).length,
              items: meetings,
            },
            orders: {
              total: orders.filter((i: any) => !i.isRejected).length,
              verified: orders.filter((o: any) => o.verified).length,
              rejected: orders.filter((o: any) => !!o.isRejected).length,
              items: orders,
            },
          };
        })
      );

      // Calculate totals
      const totals = {
        totalMeetings: employeesData.reduce((sum, e) => sum + e.meetings.total, 0),
        verifiedMeetings: employeesData.reduce((sum, e) => sum + e.meetings.verified, 0),
        rejectedMeetings: employeesData.reduce((sum, e) => sum + e.meetings.rejected, 0),
        totalOrders: employeesData.reduce((sum, e) => sum + e.orders.total, 0),
        verifiedOrders: employeesData.reduce((sum, e) => sum + e.orders.verified, 0),
        rejectedOrders: employeesData.reduce((sum, e) => sum + e.orders.rejected, 0),
        totalEmployees: employeesData.length,
      };

      console.log(`[DEBUG] Admin Summary Totals:`, totals);
      res.json({ employees: employeesData, totals });
    } catch (error) {
      console.error("Error fetching admin targets summary:", error);
      res.status(500).json({ error: "Failed to fetch targets summary" });
    }
  });
  // ============= CLICKUP INTEGRATION ROUTES =============

  // Get ClickUp team members (admin only - for debugging/mapping)
  app.get("/api/clickup/team", requireAdmin, async (req, res) => {
    try {
      const data = await getClickUpMembers();
      res.json(data);
    } catch (error: any) {
      console.error("ClickUp Team API Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ClickUp team" });
    }
  });

  // Get ClickUp user mapping by email (for debugging)
  app.get("/api/clickup/user-by-email/:email", requireAuth, async (req, res) => {
    try {
      const { email } = req.params;
      const clickUpUser = await findClickUpUserByEmail(email);

      if (!clickUpUser) {
        return res.status(404).json({
          error: "User not found in ClickUp team",
          email
        });
      }

      res.json({
        clickUpUserId: clickUpUser.id,
        username: clickUpUser.username,
        email: clickUpUser.email,
        initials: clickUpUser.initials,
        color: clickUpUser.color,
      });
    } catch (error: any) {
      console.error("ClickUp User Lookup Error:", error);
      res.status(500).json({ error: error.message || "Failed to find ClickUp user" });
    }
  });

  // Get ClickUp tasks for a specific user ID
  app.get("/api/clickup/tasks/:userId", requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      const {
        page = "0",
        date_done_gt,
        date_done_lt,
        include_closed = "true",
        statuses = "complete"
      } = req.query;

      // Build query string
      const params = new URLSearchParams();
      params.append("assignees[]", userId);
      params.append("include_closed", include_closed as string);
      params.append("page", page as string);
      params.append("space_ids[]", CLICKUP_CONFIG.SPACE_ID);

      // Handle multiple statuses
      const statusList = (statuses as string).split(",");
      statusList.forEach(status => {
        params.append("statuses[]", status.trim());
      });

      // Date filters
      if (date_done_gt) {
        params.append("date_done_gt", date_done_gt as string);
      }
      if (date_done_lt) {
        params.append("date_done_lt", date_done_lt as string);
      }

      const data = await clickUpFetch(`/team/${CLICKUP_CONFIG.TEAM_ID}/task?${params.toString()}`);
      res.json(data);
    } catch (error: any) {
      console.error("ClickUp Tasks API Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch ClickUp tasks" });
    }
  });

  // Get MY ClickUp tasks (auto-maps logged-in user's email to ClickUp)
  app.get("/api/clickup/my-tasks", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;

      // Get user from database
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (!user.email) {
        return res.status(400).json({
          error: "No email associated with your account",
          tasks: []
        });
      }

      // Find ClickUp user by email
      const clickUpUser = await findClickUpUserByEmail(user.email);

      if (!clickUpUser) {
        return res.status(404).json({
          error: "Your email is not linked to ClickUp",
          email: user.email,
          tasks: []
        });
      }

      const clickUpUserId = clickUpUser.id;

      // Parse query params
      const {
        page = "0",
        date_done_gt,
        date_done_lt,
        statuses = "complete",
        month // Format: "2025-01"
      } = req.query;

      // Build query string
      const params = new URLSearchParams();
      params.append("assignees[]", clickUpUserId.toString());
      params.append("include_closed", "true");
      params.append("page", page as string);
      params.append("space_ids[]", CLICKUP_CONFIG.SPACE_ID);

      // Handle statuses
      const statusList = (statuses as string).split(",");
      statusList.forEach(status => {
        params.append("statuses[]", status.trim());
      });

      // Calculate date range from month if provided
      if (month) {
        const [year, monthNum] = (month as string).split("-").map(Number);
        const startOfMonth = new Date(year, monthNum - 1, 1).getTime();
        const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59, 999).getTime();
        params.append("date_done_gt", startOfMonth.toString());
        params.append("date_done_lt", endOfMonth.toString());
      } else {
        if (date_done_gt) params.append("date_done_gt", date_done_gt as string);
        if (date_done_lt) params.append("date_done_lt", date_done_lt as string);
      }

      console.log(`[ClickUp] Fetching tasks for user ${user.email} (ClickUp ID: ${clickUpUserId})`);
      console.log(`[ClickUp] Query: ${params.toString()}`);

      const data = await clickUpFetch(`/team/${CLICKUP_CONFIG.TEAM_ID}/task?${params.toString()}`);

      console.log(`[ClickUp] Found ${data.tasks?.length || 0} tasks`);

      res.json({
        ...data,
        clickUpUser: {
          id: clickUpUser.id,
          username: clickUpUser.username,
          email: clickUpUser.email,
        }
      });
    } catch (error: any) {
      console.error("ClickUp My Tasks API Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch your ClickUp tasks" });
    }
  });

  // server/routes.ts - Find the /api/admin/clickup/all-tasks route and update it
  app.get("/api/admin/clickup/all-tasks", requireAdmin, async (req, res) => {
    try {
      const { month } = req.query; // Expecting "YYYY-MM"

      if (!month) {
        return res.status(400).json({ error: "Month parameter required (YYYY-MM)" });
      }

      // 1. Calculate timestamps for the requested month
      const [year, monthNum] = (month as string).split("-").map(Number);
      // Start: 1st day of month 00:00:00
      const startOfMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0)).getTime();
      // End: Last day of month 23:59:59
      const endOfMonth = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999)).getTime();

      // 2. Get all active Development employees from our DB
      const allUsers = await storage.getAllUsers();
      const devEmployees = allUsers.filter(u =>
        u.department === "Development" &&
        u.status === "active" &&
        u.email
      );

      // 3. Process each employee
      const results = await Promise.all(devEmployees.map(async (employee) => {
        try {
          const clickUpUser = await findClickUpUserByEmail(employee.email!);

          if (!clickUpUser) {
            return {
              employee,
              clickUpUser: null,
              tasks: [],
              taskCount: 0,
              status: "not_linked"
            };
          }

          // Fetch tasks for this specific user
          const params = new URLSearchParams();
          params.append("assignees[]", clickUpUser.id.toString());
          params.append("include_closed", "true");
          params.append("statuses[]", "complete");
          params.append("space_ids[]", CLICKUP_CONFIG.SPACE_ID);
          params.append("date_done_gt", startOfMonth.toString());
          params.append("date_done_lt", endOfMonth.toString());

          const data = await clickUpFetch(`/team/${CLICKUP_CONFIG.TEAM_ID}/task?${params.toString()}`);

          return {
            employee,
            clickUpUser,
            tasks: data.tasks || [],
            taskCount: data.tasks?.length || 0,
            status: "linked"
          };
        } catch (err) {
          return { employee, tasks: [], taskCount: 0, status: "error", error: "API Failure" };
        }
      }));

      // 4. Calculate Summary Totals
      const totals = {
        totalEmployees: devEmployees.length,
        linkedEmployees: results.filter(r => r.status === "linked").length,
        totalTasks: results.reduce((sum, r) => sum + r.taskCount, 0),
      };

      res.json({ month, employees: results, totals });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  // ============= NOTIFICATION ROUTES =============

  // Get recent notifications for employee
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const limit = parseInt(req.query.limit as string) || 20;

      const activities = await storage.getActivityLogsByUser(userId);
      res.json(activities.slice(0, limit));
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Get recent activities for admin
  app.get("/api/admin/notifications", requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const activities = await storage.getRecentActivityLogs(limit);
      res.json(activities);
    } catch (error) {
      console.error("Failed to fetch admin notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // ============= DEBUG ROUTE (Remove in production) =============
  app.get("/api/debug/requests", requireAdmin, async (req, res) => {
    try {
      const allRequests = await storage.getAllSpecialRequests();
      res.json({
        count: allRequests.length,
        requests: allRequests
      });
    } catch (error) {
      console.error("Debug error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  return httpServer;
}