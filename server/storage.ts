// server/storage.ts
import {
  users,
  shifts,
  breaks,
  targets,
  targetItems,
  activityLogs,
  wasenderConfig,
  departments,
  dailyShiftReports,
  specialRequests,
  requestComments,
  monthlyArchive,
  bdTargets,
  type User,
  type InsertUser,
  type Shift,
  type InsertShift,
  type Break,
  type InsertBreak,
  type Target,
  type InsertTarget,
  type TargetItem,
  type InsertTargetItem,
  type ActivityLog,
  type InsertActivityLog,
  // IMPORTANT: Ensure this WasenderConfig type is from your updated shared/schema.ts
  type WasenderConfig as WasenderConfigSchemaType,
  // InsertWasenderConfig will typically map to the DB table's insert schema
  type InsertWasenderConfig,
  type Department,
  type InsertDepartment,
  type DailyShiftReport,
  type InsertDailyShiftReport,
  type SpecialRequest,
  type InsertSpecialRequest,
  type RequestComment,
  type InsertRequestComment,
  type MonthlyArchive,
  type InsertMonthlyArchive,
  type SafeUser,
  type BdTarget,
  type InsertBdTarget,
  BREAK_LIMITS
} from "@shared/schema";
import { and, eq, isNull, isNotNull, lt, or, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "./db";

// Redefine WasenderConfig for internal use, based on the schema and what's passed in
// This helps ensure type safety when interacting with the DB and notification service
export interface WasenderSettings {
  instanceId?: string | null;
  apiToken: string | null;
  isActive: boolean | null;
  groups?: {
    requests?: string | null;
    shiftReports?: string | null;
    trackingAlerts?: string | null;
  };
}


// Type for shift with user data
export interface ShiftWithUser extends Shift {
  user: SafeUser | null;
  breaks: Break[];
}

// Helper function to get the standard SafeUser select fields
// This ensures consistency across all queries and includes ALL shift time fields
function getSafeUserSelectFields() {
  return {
    id: users.id,
    username: users.username,
    firstName: users.firstName,
    lastName: users.lastName,
    email: users.email,
    role: users.role,
    department: users.department,
    position: users.position,
    salary: users.salary,
    status: users.status,
    shiftType: users.shiftType,
    // One shift times
    shiftStartTime: users.shiftStartTime,
    shiftEndTime: users.shiftEndTime,
    // Two shift times
    morningShiftStart: users.morningShiftStart,
    morningShiftEnd: users.morningShiftEnd,
    eveningShiftStart: users.eveningShiftStart,
    eveningShiftEnd: users.eveningShiftEnd,
    // Open Shift New Field
    openShiftRequiredHours: users.openShiftRequiredHours,
    // Other fields
    phone: users.phone,
    whatsappPreference: users.whatsappPreference,
    address: users.address,
    emergencyContact: users.emergencyContact,
    isActive: users.isActive,
    createdAt: users.createdAt,
  };
}

export interface IStorage {
  getShiftsByDate(date: string): Promise<ShiftWithUser[]>;
  deleteTargetItem(id: string): Promise<void>;
  getTargetItemsByUserAndMonth(userId: string, month: string): Promise<TargetItem[]>;

  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  getAllUsers(): Promise<SafeUser[]>;
  getUsersByRole(role: string): Promise<SafeUser[]>;
  getUsersByDepartment(department: string): Promise<SafeUser[]>;

  // Shift methods
  getShiftById(id: string): Promise<Shift | undefined>;
  getShiftByUserAndDate(userId: string, date: string): Promise<Shift | undefined>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined>;
  getShiftsByUser(userId: string, limit?: number): Promise<Shift[]>;
  getTodayShifts(): Promise<(Shift & { user: SafeUser; breaks: Break[] })[]>;
  getActiveShiftsNeedingClosure(): Promise<(Shift & { user: User })[]>;

  // Break methods
  getBreakById(id: string): Promise<Break | undefined>;
  createBreak(breakRecord: InsertBreak): Promise<Break>;
  updateBreak(id: string, data: Partial<InsertBreak>): Promise<Break | undefined>;
  getBreaksByShift(shiftId: string): Promise<Break[]>;
  getBreaksByUserAndDate(userId: string, date: string): Promise<Break[]>;
  getActiveBreak(userId: string): Promise<Break | undefined>;
  getActiveBreakForDate(userId: string, date: string): Promise<Break | undefined>;
  countBreaksByType(userId: string, date: string, type: string, shiftPeriod?: string): Promise<number>;
  getAllActiveBreaks(userId: string): Promise<Break[]>;
  endStaleBreaks(userId: string, currentDate: string): Promise<number>;
  getBreakStatsForPeriod(userId: string, startDate: string, endDate: string): Promise<{
    totalBreaks: number;
    totalDuration: number;
    byType: { type: string; count: number; duration: number }[];
  }>;
  getAllMonitorableBreaks(): Promise<(Break & { user: SafeUser })[]>; // New method for scheduler
  getShiftsForOvertimeCheck(): Promise<(Shift & { user: SafeUser })[]>;
  forceCloseActiveShiftsAndBreaks(): Promise<number>;


  // Target methods (Existing - likely for individual performance)
  getTargetById(id: string): Promise<Target | undefined>;
  getTargetByUserAndMonth(userId: string, month: string): Promise<Target | undefined>;
  createTarget(target: InsertTarget): Promise<Target>;
  updateTarget(id: string, data: Partial<InsertTarget>): Promise<Target | undefined>;
  getAllTargetsForMonth(month: string): Promise<(Target & { user: SafeUser })[]>;

  // NEW: BD Target Methods
  getBdTargets(userId: string, month?: string): Promise<BdTarget[]>;
  setBdTarget(data: { userId: string; month: string; targetType?: string; targetAmount: string | number }): Promise<BdTarget>;

  // Target item methods
  getTargetItemById(id: string): Promise<TargetItem | undefined>;
  createTargetItem(item: InsertTargetItem): Promise<TargetItem>;
  updateTargetItem(id: string, data: Partial<InsertTargetItem>): Promise<TargetItem | undefined>;
  getTargetItemsByTarget(targetId: string): Promise<TargetItem[]>;
  getAllTargetItemsForMonth(month: string): Promise<(TargetItem & { user: SafeUser })[]>;

  // Activity log methods
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogsByUser(userId: string, date?: string): Promise<ActivityLog[]>;
  getRecentActivityLogs(limit?: number): Promise<(ActivityLog & { user: SafeUser })[]>;

  // WASENDER config methods
  getWasenderConfig(): Promise<WasenderConfigSchemaType | undefined>;
  updateWasenderConfig(data: Partial<InsertWasenderConfig>): Promise<WasenderConfigSchemaType>;

  // Department methods
  getDepartments(): Promise<Department[]>;
  updateDepartment(id: string, data: Partial<InsertDepartment>): Promise<Department | undefined>;

  // Daily Shift Report methods
  getDailyShiftReport(id: string): Promise<DailyShiftReport | undefined>;
  createDailyShiftReport(report: InsertDailyShiftReport): Promise<DailyShiftReport>;
  updateDailyShiftReport(id: string, data: Partial<InsertDailyShiftReport>): Promise<DailyShiftReport | undefined>;
  getDailyShiftReportsByUser(userId: string, month?: string): Promise<DailyShiftReport[]>;
  getDailyShiftReportsByMonth(month: string): Promise<(DailyShiftReport & { user: SafeUser })[]>;
  getDailyShiftReportsByUserAndMonth(userId: string, month: string): Promise<DailyShiftReport[]>;
  getDailyShiftReportsForDateRange(startDate: string, endDate: string): Promise<(DailyShiftReport & { user: SafeUser })[]>;
  getAllDailyShiftReports(): Promise<DailyShiftReport[]>;
  getReportByShiftId(shiftId: string): Promise<DailyShiftReport | undefined>;
  deleteDailyShiftReport(id: string): Promise<boolean>;

  // Special Request methods
  getSpecialRequest(id: string): Promise<SpecialRequest | undefined>;
  createSpecialRequest(request: InsertSpecialRequest): Promise<SpecialRequest>;
  updateSpecialRequest(id: string, data: Partial<InsertSpecialRequest>): Promise<SpecialRequest | undefined>;
  getSpecialRequestsByUser(userId: string, month?: string): Promise<SpecialRequest[]>;
  getSpecialRequestsByMonth(month: string): Promise<(SpecialRequest & { user: SafeUser })[]>;
  getSpecialRequestsByStatus(status: string, month?: string): Promise<(SpecialRequest & { user: SafeUser })[]>;
  getSpecialRequestsByStatusWithUser(status: string, month: string): Promise<any[]>;
  getSpecialRequestsByMonthWithUser(month: string): Promise<any[]>;
  getAllSpecialRequests(): Promise<SpecialRequest[]>;

  // Request Comment methods
  getRequestComments(requestId: string): Promise<(RequestComment & { user: SafeUser })[]>;
  addRequestComment(comment: InsertRequestComment): Promise<RequestComment>;
  getRequestCommentsWithUser(requestId: string): Promise<any[]>;
  getRequestCommentWithUser(commentId: string): Promise<any>;

  // Archive methods
  getMonthlyArchive(month: string): Promise<MonthlyArchive | undefined>;
  archiveMonth(month: string): Promise<MonthlyArchive>;
  getArchivedMonths(): Promise<MonthlyArchive[]>;
  isMonthArchived(month: string): Promise<boolean>;
  getArchivedReports(month: string): Promise<DailyShiftReport[]>;
  getArchivedRequests(month: string): Promise<SpecialRequest[]>;

  // Incomplete shifts
  getIncompleteShiftsBeforeDate(userId: string, beforeDate: string): Promise<Shift[]>;
  getOrCreateShiftForDate(userId: string, date: string): Promise<Shift>;
  
  // Mark employee as absent for approved leave requests
  markEmployeeAbsent(userId: string, date: string, shiftType: string): Promise<void>;

  // Dashboard stats
  getDashboardStats(): Promise<{
    totalEmployees: number;
    activeWorking: number;
    onBreak: number;
    notStarted: number;
  }>;

  // Analytics methods
  getAttendanceAnalytics(startDate?: string, endDate?: string): Promise<{
    totalShifts: number;
    onTimeRate: number;
    avgWorkHours: number;
    breakStats: { type: string; count: number; avgDuration: number }[];
  }>;
  getDepartmentStats(): Promise<{ department: string; count: number; activeToday: number }[]>;
  getReportsData(): Promise<{
    monthlyAttendance: number;
    averageWorkHours: number;
    topDepartments: { name: string; rate: number }[];
    weeklyTrend: number[];
  }>;
}

// PostgreSQL Database Storage
export class DatabaseStorage implements IStorage {
  // ============= USER METHODS =============

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Ensure all fields are properly mapped including new shift time fields
    const userData = {
      username: insertUser.username,
      password: insertUser.password,
      firstName: insertUser.firstName,
      lastName: insertUser.lastName,
      email: insertUser.email || null,
      role: insertUser.role || 'employee',
      department: insertUser.department || null,
      position: insertUser.position || null,
      salary: insertUser.salary || null,
      status: insertUser.status || 'active',
      shiftType: insertUser.shiftType || 'one_shift',
      // One shift times
      shiftStartTime: insertUser.shiftStartTime || null,
      shiftEndTime: insertUser.shiftEndTime || null,
      // Two shift times
      morningShiftStart: (insertUser as any).morningShiftStart || null,
      morningShiftEnd: (insertUser as any).morningShiftEnd || null,
      eveningShiftStart: (insertUser as any).eveningShiftStart || null,
      eveningShiftEnd: (insertUser as any).eveningShiftEnd || null,
      // NEW FIELD
      openShiftRequiredHours: (insertUser as any).openShiftRequiredHours || null,
      // Other fields
      phone: insertUser.phone || null,
      whatsappPreference: insertUser.whatsappPreference || 'both',
      address: insertUser.address || null,
      emergencyContact: insertUser.emergencyContact || null,
      isActive: insertUser.isActive !== false,
    };

    console.log("Storage.createUser - Saving user data:", JSON.stringify({
      ...userData,
      password: '[HIDDEN]'
    }, null, 2));

    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    // Build update data object with all possible fields
    const updateData: any = {};

    // List of all possible fields that can be updated
    const fields = [
      'username', 'password', 'firstName', 'lastName', 'email',
      'role', 'department', 'position', 'salary', 'status',
      'shiftType',
      'shiftStartTime', 'shiftEndTime',
      'morningShiftStart', 'morningShiftEnd',
      'eveningShiftStart', 'eveningShiftEnd',
      'openShiftRequiredHours',
      'phone', 'whatsappPreference', 'address', 'emergencyContact', 'isActive'
    ];

    for (const field of fields) {
      if ((data as any)[field] !== undefined) {
        updateData[field] = (data as any)[field];
      }
    }

    console.log("Storage.updateUser - Updating user", id, "with data:", JSON.stringify({
      ...updateData,
      password: updateData.password ? '[HIDDEN]' : undefined
    }, null, 2));

    if (Object.keys(updateData).length === 0) {
      console.log("Storage.updateUser - No fields to update, returning existing user");
      return this.getUser(id);
    }

    const [user] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async deleteUser(userId: string): Promise<void> {
    // 1. Get all special request IDs belonging to this user
    const userRequests = await db
      .select({ id: specialRequests.id })
      .from(specialRequests)
      .where(eq(specialRequests.userId, userId));

    const requestIds = userRequests.map(r => r.id);

    // 2. Delete comments associated with those requests
    if (requestIds.length > 0) {
      await db
        .delete(requestComments)
        .where(inArray(requestComments.requestId, requestIds));
    }

    // 3. Delete comments made BY this user on other requests
    await db
      .delete(requestComments)
      .where(eq(requestComments.userId, userId));

    // 4. Delete special requests themselves
    await db
      .delete(specialRequests)
      .where(eq(specialRequests.userId, userId));

    // 5. Delete reports associated with user's shifts
    await db
      .delete(dailyShiftReports)
      .where(eq(dailyShiftReports.userId, userId));

    // 6. Delete target items and targets
    await db
      .delete(targetItems)
      .where(eq(targetItems.userId, userId));

    await db
      .delete(targets)
      .where(eq(targets.userId, userId));

    // NEW: Delete BD targets
    await db
      .delete(bdTargets)
      .where(eq(bdTargets.userId, userId));

    // 7. Delete breaks and shifts
    await db
      .delete(breaks)
      .where(eq(breaks.userId, userId));

    await db
      .delete(shifts)
      .where(eq(shifts.userId, userId));

    // 8. Delete activity logs
    await db
      .delete(activityLogs)
      .where(eq(activityLogs.userId, userId));

    // 9. Finally, delete the user
    await db
      .delete(users)
      .where(eq(users.id, userId));
  }

  async getAllUsers(): Promise<SafeUser[]> {
    const allUsers = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      department: users.department,
      position: users.position,
      salary: users.salary,
      status: users.status,
      shiftType: users.shiftType,
      shiftStartTime: users.shiftStartTime,
      shiftEndTime: users.shiftEndTime,
      morningShiftStart: users.morningShiftStart,
      morningShiftEnd: users.morningShiftEnd,
      eveningShiftStart: users.eveningShiftStart,
      eveningShiftEnd: users.eveningShiftEnd,
      openShiftRequiredHours: users.openShiftRequiredHours,
      phone: users.phone,
      whatsappPreference: users.whatsappPreference,
      address: users.address,
      emergencyContact: users.emergencyContact,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt));
    return allUsers as SafeUser[];
  }

  async getUsersByRole(role: string): Promise<SafeUser[]> {
    const roleUsers = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      department: users.department,
      position: users.position,
      salary: users.salary,
      status: users.status,
      shiftType: users.shiftType,
      shiftStartTime: users.shiftStartTime,
      shiftEndTime: users.shiftEndTime,
      morningShiftStart: users.morningShiftStart,
      morningShiftEnd: users.morningShiftEnd,
      eveningShiftStart: users.eveningShiftStart,
      eveningShiftEnd: users.eveningShiftEnd,
      openShiftRequiredHours: users.openShiftRequiredHours,
      phone: users.phone,
      whatsappPreference: users.whatsappPreference,
      address: users.address,
      emergencyContact: users.emergencyContact,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.role, role));
    return roleUsers as SafeUser[];
  }

  async getUsersByDepartment(department: string): Promise<SafeUser[]> {
    const deptUsers = await db.select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      department: users.department,
      position: users.position,
      salary: users.salary,
      status: users.status,
      shiftType: users.shiftType,
      shiftStartTime: users.shiftStartTime,
      shiftEndTime: users.shiftEndTime,
      morningShiftStart: users.morningShiftStart,
      morningShiftEnd: users.morningShiftEnd,
      eveningShiftStart: users.eveningShiftStart,
      eveningShiftEnd: users.eveningShiftEnd,
      openShiftRequiredHours: users.openShiftRequiredHours,
      phone: users.phone,
      whatsappPreference: users.whatsappPreference,
      address: users.address,
      emergencyContact: users.emergencyContact,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.department, department));
    return deptUsers as SafeUser[];
  }

  // ============= BD TARGET METHODS (NEW) =============

  async getBdTargets(userId: string, month?: string): Promise<BdTarget[]> {
    const conditions = [eq(bdTargets.userId, userId)];

    if (month) {
      conditions.push(eq(bdTargets.month, month));
    }

    return await db.select().from(bdTargets).where(and(...conditions)).orderBy(desc(bdTargets.month));
  }

  async setBdTarget(data: { userId: string; month: string; targetType?: string; targetAmount: string | number }): Promise<BdTarget> {
    const existing = await db.select().from(bdTargets).where(and(
      eq(bdTargets.userId, data.userId),
      eq(bdTargets.month, data.month)
    ));

    if (existing.length > 0) {
      // Update
      const [updated] = await db.update(bdTargets).set({
        targetAmount: String(data.targetAmount),
        targetType: data.targetType || existing[0].targetType,
        updatedAt: new Date()
      }).where(eq(bdTargets.id, existing[0].id)).returning();
      return updated;
    } else {
      // Create
      const [created] = await db.insert(bdTargets).values({
        userId: data.userId,
        month: data.month,
        targetType: data.targetType || 'revenue',
        targetAmount: String(data.targetAmount),
        achievedAmount: "0"
      }).returning();
      return created;
    }
  }

  // ============= SHIFT METHODS =============

  async getShiftsByDate(date: string): Promise<ShiftWithUser[]> {
    try {
      const shiftRecords = await db
        .select({
          id: shifts.id,
          userId: shifts.userId,
          date: shifts.date,
          morningClockIn: shifts.morningClockIn,
          morningClockOut: shifts.morningClockOut,
          morningLateMinutes: shifts.morningLateMinutes,
          eveningClockIn: shifts.eveningClockIn,
          eveningClockOut: shifts.eveningClockOut,
          eveningLateMinutes: shifts.eveningLateMinutes,
          status: shifts.status,
          notes: shifts.notes,
          createdAt: shifts.createdAt,
          user: {
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
            department: users.department,
            position: users.position,
            salary: users.salary,
            status: users.status,
            shiftType: users.shiftType,
            shiftStartTime: users.shiftStartTime,
            shiftEndTime: users.shiftEndTime,
            morningShiftStart: users.morningShiftStart,
            morningShiftEnd: users.morningShiftEnd,
            eveningShiftStart: users.eveningShiftStart,
            eveningShiftEnd: users.eveningShiftEnd,
            openShiftRequiredHours: users.openShiftRequiredHours,
            phone: users.phone,
            whatsappPreference: users.whatsappPreference,
            address: users.address,
            emergencyContact: users.emergencyContact,
            isActive: users.isActive,
            createdAt: users.createdAt,
          },
        })
        .from(shifts)
        .leftJoin(users, eq(shifts.userId, users.id))
        .where(eq(shifts.date, date))
        .orderBy(desc(shifts.createdAt));

      // Fetch breaks for all shifts
      const shiftIds = shiftRecords.map(r => r.id);
      const allBreaks = shiftIds.length > 0
        ? await db.select().from(breaks).where(inArray(breaks.shiftId, shiftIds))
        : [];

      // Merge breaks into shifts
      return shiftRecords.map(shift => ({
        ...shift,
        breaks: allBreaks.filter(b => b.shiftId === shift.id),
      })) as ShiftWithUser[];
    } catch (error) {
      console.error("Error fetching shifts by date:", error);
      return [];
    }
  }

  async getShiftById(id: string): Promise<Shift | undefined> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, id));
    return shift || undefined;
  }

  async getShiftByUserAndDate(userId: string, date: string): Promise<Shift | undefined> {
    const [shift] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.userId, userId), eq(shifts.date, date)))
      .orderBy(desc(shifts.createdAt));
    return shift || undefined;
  }

  async createShift(shift: InsertShift): Promise<Shift> {
    const [newShift] = await db.insert(shifts).values(shift).returning();
    return newShift;
  }

  async updateShift(id: string, data: Partial<InsertShift>): Promise<Shift | undefined> {
    const [shift] = await db.update(shifts).set(data).where(eq(shifts.id, id)).returning();
    return shift || undefined;
  }

  async getShiftsByUser(userId: string, limit: number = 30): Promise<Shift[]> {
    return await db
      .select()
      .from(shifts)
      .where(eq(shifts.userId, userId))
      .orderBy(desc(shifts.date))
      .limit(limit);
  }

  async getTodayShifts(): Promise<(Shift & { user: SafeUser; breaks: Break[] })[]> {
    // ✅ FIX: Use Pakistan timezone for correct date
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    console.log(`[getTodayShifts] Fetching shifts for date: ${today} (Pakistan Time)`);

    const records = await db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        morningClockIn: shifts.morningClockIn,
        morningClockOut: shifts.morningClockOut,
        morningLateMinutes: shifts.morningLateMinutes,
        eveningClockIn: shifts.eveningClockIn,
        eveningClockOut: shifts.eveningClockOut,
        eveningLateMinutes: shifts.eveningLateMinutes,
        status: shifts.status,
        notes: shifts.notes,
        createdAt: shifts.createdAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(shifts)
      .leftJoin(users, eq(shifts.userId, users.id))
      .where(eq(shifts.date, today));

    console.log(`[getTodayShifts] Found ${records.length} shifts for ${today}`);

    // Fetch breaks for all shifts
    const shiftIds = records.map(r => r.id);
    const allBreaks = shiftIds.length > 0
      ? await db.select().from(breaks).where(inArray(breaks.shiftId, shiftIds))
      : [];

    // Merge breaks into shifts
    const shiftsWithBreaks = records.map(shift => ({
      ...shift,
      breaks: allBreaks.filter(b => b.shiftId === shift.id),
    }));

    return shiftsWithBreaks as (Shift & { user: SafeUser; breaks: Break[] })[];
  }

  async getIncompleteShiftsBeforeDate(userId: string, beforeDate: string): Promise<Shift[]> {
    return await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.userId, userId),
          lt(shifts.date, beforeDate),
          or(
            and(
              isNotNull(shifts.morningClockIn),
              isNull(shifts.morningClockOut)
            ),
            and(
              isNotNull(shifts.eveningClockIn),
              isNull(shifts.eveningClockOut)
            )
          )
        )
      )
      .orderBy(desc(shifts.date));
  }

  async getOrCreateShiftForDate(userId: string, date: string): Promise<Shift> {
    let shift = await this.getShiftByUserAndDate(userId, date);

    if (!shift) {
      shift = await this.createShift({
        userId,
        date,
        status: "not_started",
      });
    }

    return shift;
  }
  
  /**
   * Mark an employee as absent for a specific date and shift type
   * Used when special leave requests are approved
   */
  async markEmployeeAbsent(userId: string, date: string, shiftType: string): Promise<void> {
    // Get or create a shift record for this date
    let shift = await this.getShiftByUserAndDate(userId, date);
    
    if (!shift) {
      // Create a new shift record marked as absent
      shift = await this.createShift({
        userId,
        date,
        status: "absent",
        notes: `Approved leave - ${shiftType}`,
      });
    } else {
      // Update existing shift to mark as absent
      // The notes field indicates which shift(s) are on leave
      const existingNotes = shift.notes || "";
      const newNote = `Approved leave - ${shiftType}`;
      const updatedNotes = existingNotes ? `${existingNotes}; ${newNote}` : newNote;
      
      await this.updateShift(shift.id, {
        status: "absent",
        notes: updatedNotes,
      });
    }
    
    console.log(`Marked ${userId} as absent on ${date} for ${shiftType}`);
  }

  async getActiveShiftsNeedingClosure(): Promise<(Shift & { user: User })[]> {
    const activeShifts = await db
      .select({
        // Spread all shift fields manually to ensure type safety
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        scheduledDate: shifts.scheduledDate,
        morningClockIn: shifts.morningClockIn,
        morningClockOut: shifts.morningClockOut,
        morningLateMinutes: shifts.morningLateMinutes,
        eveningClockIn: shifts.eveningClockIn,
        eveningClockOut: shifts.eveningClockOut,
        eveningLateMinutes: shifts.eveningLateMinutes,
        status: shifts.status,
        notes: shifts.notes,
        overtimeNotificationSent: shifts.overtimeNotificationSent,
        createdAt: shifts.createdAt,
        // Include full user object for configuration access
        user: users
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.userId, users.id))
      .where(
        or(
          and(isNotNull(shifts.morningClockIn), isNull(shifts.morningClockOut)),
          and(isNotNull(shifts.eveningClockIn), isNull(shifts.eveningClockOut))
        )
      );

    return activeShifts;
  }

  // ============= BREAK METHODS =============

  async getBreakById(id: string): Promise<Break | undefined> {
    const [breakRecord] = await db.select().from(breaks).where(eq(breaks.id, id));
    return breakRecord || undefined;
  }

  async createBreak(breakRecord: InsertBreak): Promise<Break> {
    const [newBreak] = await db.insert(breaks).values(breakRecord).returning();
    return newBreak;
  }

  async updateBreak(id: string, data: Partial<InsertBreak>): Promise<Break | undefined> {
    const [breakRecord] = await db.update(breaks).set(data).where(eq(breaks.id, id)).returning();
    return breakRecord || undefined;
  }

  async getBreaksByShift(shiftId: string): Promise<Break[]> {
    return await db.select().from(breaks).where(eq(breaks.shiftId, shiftId));
  }

  async getAllMonitorableBreaks(): Promise<(Break & { user: SafeUser })[]> {
    const activeBreaks = await db
      .select()
      .from(breaks)
      .where(isNull(breaks.endTime));

    // Fetch users for these breaks to get phone numbers
    const breaksWithUsers = await Promise.all(activeBreaks.map(async (b) => {
      const user = await this.getUser(b.userId);
      return { ...b, user: user as SafeUser };
    }));

    return breaksWithUsers;
  }

  async getBreaksByUserAndDate(userId: string, date: string): Promise<Break[]> {
    return await db
      .select()
      .from(breaks)
      .where(and(eq(breaks.userId, userId), eq(breaks.date, date)))
      .orderBy(desc(breaks.startTime));
  }

  async getActiveBreak(userId: string): Promise<Break | undefined> {
    const today = new Date().toISOString().split("T")[0];
    const [activeBreak] = await db
      .select()
      .from(breaks)
      .where(and(
        eq(breaks.userId, userId),
        eq(breaks.date, today),
        isNull(breaks.endTime)
      ));
    return activeBreak || undefined;
  }

  async getActiveBreakForDate(userId: string, date: string): Promise<Break | undefined> {
    const [activeBreak] = await db
      .select()
      .from(breaks)
      .where(and(
        eq(breaks.userId, userId),
        eq(breaks.date, date),
        isNull(breaks.endTime)
      ))
      .orderBy(desc(breaks.startTime))
      .limit(1);
    return activeBreak || undefined;
  }

  async getAllActiveBreaks(userId: string): Promise<Break[]> {
    return await db
      .select()
      .from(breaks)
      .where(
        and(
          eq(breaks.userId, userId),
          isNull(breaks.endTime)
        )
      )
      .orderBy(desc(breaks.startTime));
  }

  async countBreaksByType(userId: string, date: string, type: string, shiftPeriod?: string): Promise<number> {
    const conditions = [
      eq(breaks.userId, userId),
      eq(breaks.date, date),
      eq(breaks.type, type)
    ];

    if (shiftPeriod) {
      conditions.push(eq(breaks.shiftPeriod, shiftPeriod));
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(breaks)
      .where(and(...conditions));

    return Number(result?.count || 0);
  }

  async endStaleBreaks(userId: string, currentDate: string): Promise<number> {
    const now = new Date();

    // Find all breaks without end time that are not from today
    const staleBreaks = await db
      .select()
      .from(breaks)
      .where(and(
        eq(breaks.userId, userId),
        isNull(breaks.endTime),
        lt(breaks.date, currentDate)
      ));

    let endedCount = 0;

    for (const brk of staleBreaks) {
      // End the break at midnight of that day
      const breakDate = new Date(brk.date);
      breakDate.setHours(23, 59, 59, 999);

      const durationMinutes = Math.floor(
        (breakDate.getTime() - new Date(brk.startTime).getTime()) / 60000
      );

      await db.update(breaks).set({
        endTime: breakDate,
        durationMinutes: Math.min(durationMinutes, 480), // Cap at 8 hours
      }).where(eq(breaks.id, brk.id));

      endedCount++;
    }

    return endedCount;
  }

  async getBreakStatsForPeriod(userId: string, startDate: string, endDate: string): Promise<{
    totalBreaks: number;
    totalDuration: number;
    byType: { type: string; count: number; duration: number }[];
  }> {
    const allBreaks = await db
      .select()
      .from(breaks)
      .where(and(
        eq(breaks.userId, userId),
        gte(breaks.date, startDate),
        lte(breaks.date, endDate)
      ));

    const byType = [
      { type: "prayer", count: 0, duration: 0 },
      { type: "meal", count: 0, duration: 0 },
      { type: "urgent", count: 0, duration: 0 },
    ];

    let totalDuration = 0;

    for (const brk of allBreaks) {
      const stat = byType.find(s => s.type === brk.type);
      if (stat) {
        stat.count++;
        stat.duration += brk.durationMinutes || 0;
      }
      totalDuration += brk.durationMinutes || 0;
    }

    return {
      totalBreaks: allBreaks.length,
      totalDuration,
      byType,
    };
  }

  // ============= TARGET METHODS =============

  async getTargetById(id: string): Promise<Target | undefined> {
    const [target] = await db.select().from(targets).where(eq(targets.id, id));
    return target || undefined;
  }

  async getTargetByUserAndMonth(userId: string, month: string): Promise<Target | undefined> {
    const [target] = await db
      .select()
      .from(targets)
      .where(and(eq(targets.userId, userId), eq(targets.month, month)));
    return target || undefined;
  }

  async createTarget(target: InsertTarget): Promise<Target> {
    const [newTarget] = await db.insert(targets).values(target).returning();
    return newTarget;
  }

  async updateTarget(id: string, data: Partial<InsertTarget>): Promise<Target | undefined> {
    const [target] = await db.update(targets).set(data).where(eq(targets.id, id)).returning();
    return target || undefined;
  }

  async getAllTargetsForMonth(month: string): Promise<(Target & { user: SafeUser })[]> {
    const records = await db
      .select({
        id: targets.id,
        userId: targets.userId,
        month: targets.month,
        meetingTarget: targets.meetingTarget,
        orderTarget: targets.orderTarget,
        createdAt: targets.createdAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(targets)
      .leftJoin(users, eq(targets.userId, users.id))
      .where(eq(targets.month, month));

    return records as (Target & { user: SafeUser })[];
  }

  // ============= TARGET ITEM METHODS =============

  async getTargetItemById(id: string): Promise<TargetItem | undefined> {
    const [item] = await db.select().from(targetItems).where(eq(targetItems.id, id));
    return item || undefined;
  }

  async createTargetItem(item: InsertTargetItem): Promise<TargetItem> {
    const [newItem] = await db.insert(targetItems).values(item).returning();
    return newItem;
  }

  async updateTargetItem(id: string, data: Partial<InsertTargetItem>): Promise<TargetItem | undefined> {
    const [item] = await db.update(targetItems).set(data).where(eq(targetItems.id, id)).returning();
    return item || undefined;
  }

  async deleteTargetItem(id: string): Promise<void> {
    await db.delete(targetItems).where(eq(targetItems.id, id));
  }

  async getTargetItemsByTarget(targetId: string): Promise<TargetItem[]> {
    return await db.select().from(targetItems).where(eq(targetItems.targetId, targetId));
  }

  async getTargetItemsByUserAndMonth(userId: string, month: string): Promise<TargetItem[]> {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    return await db
      .select({
        id: targetItems.id,
        targetId: targetItems.targetId,
        userId: targetItems.userId,
        type: targetItems.type,
        name: targetItems.name,
        source: targetItems.source,
        clientType: targetItems.clientType,
        contactLink: targetItems.contactLink,
        date: targetItems.date,
        verified: targetItems.verified,
        verifiedAt: targetItems.verifiedAt,
        verifiedBy: targetItems.verifiedBy,
        isRejected: sql<boolean>`COALESCE(${targetItems.isRejected}, false)`,
        rejectionReason: targetItems.rejectionReason,
        createdAt: targetItems.createdAt,
      })
      .from(targetItems)
      .where(and(
        eq(targetItems.userId, userId),
        gte(targetItems.date, startDate),
        lte(targetItems.date, endDate)
      ))
      .orderBy(desc(targetItems.createdAt));
  }

  async getAllTargetItemsForMonth(month: string): Promise<(TargetItem & { user: SafeUser })[]> {
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const records = await db
      .select({
        id: targetItems.id,
        targetId: targetItems.targetId,
        userId: targetItems.userId,
        type: targetItems.type,
        name: targetItems.name,
        source: targetItems.source,
        clientType: targetItems.clientType,
        contactLink: targetItems.contactLink,
        date: targetItems.date,
        verified: targetItems.verified,
        verifiedAt: targetItems.verifiedAt,
        verifiedBy: targetItems.verifiedBy,
        isRejected: sql<boolean>`COALESCE(${targetItems.isRejected}, false)`,
        rejectionReason: targetItems.rejectionReason,
        createdAt: targetItems.createdAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(targetItems)
      .leftJoin(users, eq(targetItems.userId, users.id))
      .where(and(
        gte(targetItems.date, startDate),
        lte(targetItems.date, endDate)
      ))
      .orderBy(desc(targetItems.createdAt));

    return records as (TargetItem & { user: SafeUser })[];
  }

  // ============= ACTIVITY LOG METHODS =============

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    return newLog;
  }

  async getActivityLogsByUser(userId: string, date?: string): Promise<ActivityLog[]> {
    const selectFields = {
      id: activityLogs.id,
      userId: activityLogs.userId,
      action: activityLogs.action,
      details: activityLogs.details,
      timestamp: activityLogs.timestamp,
      createdAt: activityLogs.createdAt,
      // ADDED: Explicitly select the metadata column
      metadata: activityLogs.metadata,
    };

    if (date) {
      return await db
        .select(selectFields)
        .from(activityLogs)
        .where(and(
          eq(activityLogs.userId, userId),
          sql`DATE(${activityLogs.timestamp}) = ${date}`
        ))
        .orderBy(desc(activityLogs.timestamp));
    }
    return await db
      .select(selectFields)
      .from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.timestamp));
  }

  async getRecentActivityLogs(limit = 50): Promise<(ActivityLog & { user: SafeUser })[]> {
    const logs = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        details: activityLogs.details,
        timestamp: activityLogs.timestamp,
        createdAt: activityLogs.createdAt,
        // ADDED: Explicitly select the metadata column
        metadata: activityLogs.metadata,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit);

    return logs as (ActivityLog & { user: SafeUser })[];
  }

  // ============= WASENDER CONFIG METHODS =============

  async getWasenderConfig(): Promise<WasenderConfigSchemaType | undefined> {
    const [config] = await db.select().from(wasenderConfig).limit(1);
    return config || undefined;
  }

  async updateWasenderConfig(data: Partial<InsertWasenderConfig>): Promise<WasenderConfigSchemaType> {
    const existing = await this.getWasenderConfig();
    const updatePayload: any = { ...data, updatedAt: new Date() };

    if (existing) {
      // Ensure that if 'groups' is passed, it's correctly handled as a JSONB column
      const [updated] = await db
        .update(wasenderConfig)
        .set(updatePayload)
        .where(eq(wasenderConfig.id, existing.id))
        .returning();
      return updated;
    } else {
      // For insertion, make sure all non-nullable fields are present
      // This assumes `InsertWasenderConfig` directly maps to your Drizzle table insert type
      // You might need to cast or provide defaults for required fields if `data` is partial
      const [created] = await db.insert(wasenderConfig).values(updatePayload as any).returning();
      return created;
    }
  }

  // ============= DEPARTMENT METHODS =============

  async getDepartments(): Promise<Department[]> {
    return await db.select().from(departments);
  }

  async updateDepartment(id: string, data: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [dept] = await db.update(departments).set(data).where(eq(departments.id, id)).returning();
    return dept || undefined;
  }

  // ============= DASHBOARD STATS =============

  async getDashboardStats(): Promise<{
    totalEmployees: number;
    activeWorking: number;
    onBreak: number;
    notStarted: number;
  }> {
    const today = new Date().toISOString().split("T")[0];

    const allEmployees = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "employee"), eq(users.status, "active")));

    const totalEmployees = allEmployees.length;

    const todayShifts = await db
      .select()
      .from(shifts)
      .where(eq(shifts.date, today));

    let activeWorking = 0;
    let onBreak = 0;

    for (const shift of todayShifts) {
      const activeBreak = await this.getActiveBreak(shift.userId);
      if (activeBreak) {
        onBreak++;
      } else if (shift.morningClockIn || shift.eveningClockIn) {
        activeWorking++;
      }
    }

    const notStarted = totalEmployees - todayShifts.length;

    return {
      totalEmployees,
      activeWorking,
      onBreak,
      notStarted,
    };
  }

  // ============= ANALYTICS METHODS =============

  async getAttendanceAnalytics(startDate?: string, endDate?: string): Promise<{
    totalShifts: number;
    onTimeRate: number;
    avgWorkHours: number;
    breakStats: { type: string; count: number; avgDuration: number }[];
  }> {
    const today = new Date().toISOString().split("T")[0];
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const end = endDate || today;

    const allShifts = await db
      .select()
      .from(shifts)
      .where(and(
        gte(shifts.date, start),
        lte(shifts.date, end)
      ));

    const totalShifts = allShifts.length;
    const onTimeShifts = allShifts.filter(s =>
      (s.morningLateMinutes === 0 || s.morningLateMinutes === null) &&
      (s.eveningLateMinutes === 0 || s.eveningLateMinutes === null)
    ).length;
    const onTimeRate = totalShifts > 0 ? Math.round((onTimeShifts / totalShifts) * 100) : 0;

    const avgWorkHours = 8; // This might need a more dynamic calculation based on actual worked time

    const allBreaks = await db
      .select()
      .from(breaks)
      .where(and(
        gte(breaks.date, start),
        lte(breaks.date, end)
      ));

    const breakStats = [
      { type: "prayer", count: 0, totalDuration: 0 },
      { type: "meal", count: 0, totalDuration: 0 },
      { type: "urgent", count: 0, totalDuration: 0 },
    ];

    for (const b of allBreaks) {
      const stat = breakStats.find(s => s.type === b.type);
      if (stat) {
        stat.count++;
        stat.totalDuration += b.durationMinutes || 0;
      }
    }

    return {
      totalShifts,
      onTimeRate,
      avgWorkHours,
      breakStats: breakStats.map(s => ({
        type: s.type,
        count: s.count,
        avgDuration: s.count > 0 ? Math.round(s.totalDuration / s.count) : 0,
      })),
    };
  }

  async getDepartmentStats(): Promise<{ department: string; count: number; activeToday: number }[]> {
    const today = new Date().toISOString().split("T")[0];

    const allEmployees = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "employee"), eq(users.status, "active")));

    const todayShifts = await db
      .select()
      .from(shifts)
      .where(eq(shifts.date, today));

    const deptMap: { [key: string]: { count: number; activeToday: number } } = {};

    for (const emp of allEmployees) {
      const dept = emp.department || "Unassigned";
      if (!deptMap[dept]) {
        deptMap[dept] = { count: 0, activeToday: 0 };
      }
      deptMap[dept].count++;

      const hasShift = todayShifts.some(s => s.userId === emp.id);
      if (hasShift) {
        deptMap[dept].activeToday++;
      }
    }

    return Object.entries(deptMap).map(([department, stats]) => ({
      department,
      count: stats.count,
      activeToday: stats.activeToday,
    }));
  }

  async getReportsData(): Promise<{
    monthlyAttendance: number;
    averageWorkHours: number;
    topDepartments: { name: string; rate: number }[];
    weeklyTrend: number[];
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    // 1. Monthly Attendance Rate
    const monthlyShifts = await db
      .select()
      .from(shifts)
      .where(and(gte(shifts.date, startOfMonth), lte(shifts.date, endOfMonth)));

    const activeUsers = await db.select().from(users).where(eq(users.status, "active"));
    const totalPossibleShifts = activeUsers.length * (now.getDate());

    const presentShifts = monthlyShifts.filter(s => s.status === "present" || s.status === "late").length;
    const monthlyAttendance = totalPossibleShifts > 0 ? Math.round((presentShifts / totalPossibleShifts) * 100) : 0;

    // 2. Average Work Hours
    let totalMinutes = 0;
    let shiftsWithTime = 0;
    for (const s of monthlyShifts) {
      if (s.morningClockIn && s.morningClockOut) {
        totalMinutes += (s.morningClockOut.getTime() - s.morningClockIn.getTime()) / 60000;
        shiftsWithTime++;
      }
      if (s.eveningClockIn && s.eveningClockOut) {
        totalMinutes += (s.eveningClockOut.getTime() - s.eveningClockIn.getTime()) / 60000;
        shiftsWithTime++;
      }
    }
    const averageWorkHours = shiftsWithTime > 0 ? Number((totalMinutes / shiftsWithTime / 60).toFixed(1)) : 8;

    // 3. Department Performance
    const deptStats: Record<string, { present: number; total: number }> = {};
    activeUsers.forEach(u => {
      const dept = u.department || "Other";
      if (!deptStats[dept]) deptStats[dept] = { present: 0, total: 0 };
    });

    for (const s of monthlyShifts) {
      const user = activeUsers.find(u => u.id === s.userId);
      if (user) {
        const dept = user.department || "Other";
        if (deptStats[dept]) {
          deptStats[dept].total++;
          if (s.status === "present" || s.status === "late") {
            deptStats[dept].present++;
          }
        }
      }
    }

    const topDepartments = Object.entries(deptStats).map(([name, stats]) => ({
      name,
      rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0
    })).sort((a, b) => b.rate - a.rate).slice(0, 5);

    // 4. Weekly Trend (Monday to Sunday)
    const currentDay = now.getDay(); // 0 is Sunday
    const mondayOffset = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const weeklyTrend: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + i);
      const dayStr = dayDate.toISOString().split("T")[0];

      const dayShifts = monthlyShifts.filter(s => s.date === dayStr);
      const dayPresent = dayShifts.filter(s => s.status === "present" || s.status === "late").length;

      weeklyTrend[i] = activeUsers.length > 0 ? Math.round((dayPresent / activeUsers.length) * 100) : 0;
    }

    return {
      monthlyAttendance: Math.min(monthlyAttendance, 100),
      averageWorkHours,
      topDepartments,
      weeklyTrend
    };
  }

  // ============= DAILY SHIFT REPORT METHODS =============

  async getDailyShiftReport(id: string): Promise<DailyShiftReport | undefined> {
    const [report] = await db
      .select()
      .from(dailyShiftReports)
      .where(eq(dailyShiftReports.id, id));
    return report || undefined;
  }

  async createDailyShiftReport(report: InsertDailyShiftReport): Promise<DailyShiftReport> {
    console.log("Storage: Creating daily report with data:", report);
    const [created] = await db
      .insert(dailyShiftReports)
      .values(report)
      .returning();
    console.log("Storage: Created daily report:", created);
    return created;
  }

  async updateDailyShiftReport(id: string, data: Partial<InsertDailyShiftReport>): Promise<DailyShiftReport | undefined> {
    const [updated] = await db
      .update(dailyShiftReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dailyShiftReports.id, id))
      .returning();
    return updated || undefined;
  }

  async getDailyShiftReportsByUser(userId: string, month?: string): Promise<DailyShiftReport[]> {
    let conditions = [eq(dailyShiftReports.userId, userId)];

    if (month) {
      conditions.push(eq(dailyShiftReports.month, month));
    }

    return db
      .select()
      .from(dailyShiftReports)
      .where(and(...conditions))
      .orderBy(desc(dailyShiftReports.date));
  }

  async getDailyShiftReportsByMonth(month: string): Promise<(DailyShiftReport & { user: SafeUser })[]> {
    console.log(`Storage: Fetching daily reports for month "${month}"`);

    const reports = await db
      .select({
        id: dailyShiftReports.id,
        userId: dailyShiftReports.userId,
        shiftId: dailyShiftReports.shiftId,
        date: dailyShiftReports.date,
        workDetails: dailyShiftReports.workDetails,
        loomVideos: dailyShiftReports.loomVideos,
        notes: dailyShiftReports.notes,
        references: dailyShiftReports.references,
        month: dailyShiftReports.month,
        archived: dailyShiftReports.archived,
        createdAt: dailyShiftReports.createdAt,
        updatedAt: dailyShiftReports.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(dailyShiftReports)
      .innerJoin(users, eq(dailyShiftReports.userId, users.id))
      .where(eq(dailyShiftReports.month, month))
      .orderBy(desc(dailyShiftReports.date));

    console.log(`Storage: Found ${reports.length} reports for month ${month}`);

    return reports as (DailyShiftReport & { user: SafeUser })[];
  }

  async getDailyShiftReportsByUserAndMonth(userId: string, month: string): Promise<DailyShiftReport[]> {
    console.log(`Storage: Fetching reports for user ${userId}, month ${month}`);

    const reports = await db
      .select()
      .from(dailyShiftReports)
      .where(and(
        eq(dailyShiftReports.userId, userId),
        eq(dailyShiftReports.month, month)
      ))
      .orderBy(desc(dailyShiftReports.date));

    console.log(`Storage: Found ${reports.length} reports`);
    return reports;
  }

  async getDailyShiftReportsForDateRange(startDate: string, endDate: string): Promise<(DailyShiftReport & { user: SafeUser })[]> {
    console.log(`Storage: Fetching reports from ${startDate} to ${endDate}`);

    const reports = await db
      .select({
        id: dailyShiftReports.id,
        userId: dailyShiftReports.userId,
        shiftId: dailyShiftReports.shiftId,
        date: dailyShiftReports.date,
        workDetails: dailyShiftReports.workDetails,
        loomVideos: dailyShiftReports.loomVideos,
        notes: dailyShiftReports.notes,
        references: dailyShiftReports.references,
        month: dailyShiftReports.month,
        archived: dailyShiftReports.archived,
        createdAt: dailyShiftReports.createdAt,
        updatedAt: dailyShiftReports.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(dailyShiftReports)
      .innerJoin(users, eq(dailyShiftReports.userId, users.id))
      .where(and(
        gte(dailyShiftReports.date, startDate),
        lte(dailyShiftReports.date, endDate)
      ))
      .orderBy(desc(dailyShiftReports.createdAt));

    console.log(`Storage: Found ${reports.length} reports for date range`);
    return reports as (DailyShiftReport & { user: SafeUser })[];
  }

  async getAllDailyShiftReports(): Promise<DailyShiftReport[]> {
    const reports = await db
      .select()
      .from(dailyShiftReports)
      .orderBy(desc(dailyShiftReports.createdAt));

    console.log(`Storage: Total daily reports in database: ${reports.length}`);
    return reports;
  }

  async getReportByShiftId(shiftId: string): Promise<DailyShiftReport | undefined> {
    const [report] = await db
      .select()
      .from(dailyShiftReports)
      .where(eq(dailyShiftReports.shiftId, shiftId));
    return report || undefined;
  }

  async deleteDailyShiftReport(id: string): Promise<boolean> {
    const result = await db
      .delete(dailyShiftReports)
      .where(eq(dailyShiftReports.id, id));
    return true;
  }

  // ============= SPECIAL REQUEST METHODS =============

  async getSpecialRequest(id: string): Promise<SpecialRequest | undefined> {
    const [request] = await db
      .select()
      .from(specialRequests)
      .where(eq(specialRequests.id, id));
    return request || undefined;
  }

  async createSpecialRequest(request: InsertSpecialRequest): Promise<SpecialRequest> {
    console.log("Storage: Creating special request with data:", request);
    const [created] = await db
      .insert(specialRequests)
      .values({
        userId: request.userId,
        title: request.title,
        details: request.details,
        month: request.month,
        status: request.status || "sent_for_approval",
        archived: request.archived || false,
      })
      .returning();
    console.log("Storage: Created special request:", created);
    return created;
  }

  async updateSpecialRequest(id: string, data: Partial<InsertSpecialRequest>): Promise<SpecialRequest | undefined> {
    const [updated] = await db
      .update(specialRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(specialRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async getSpecialRequestsByUser(userId: string, month?: string): Promise<SpecialRequest[]> {
    let conditions = [eq(specialRequests.userId, userId)];

    if (month) {
      conditions.push(eq(specialRequests.month, month));
    }

    const requests = await db
      .select()
      .from(specialRequests)
      .where(and(...conditions))
      .orderBy(desc(specialRequests.createdAt));

    console.log(`Storage: Found ${requests.length} requests for user ${userId}, month: ${month}`);
    return requests;
  }

  async getSpecialRequestsByMonth(month: string): Promise<(SpecialRequest & { user: SafeUser })[]> {
    const requests = await db
      .select({
        id: specialRequests.id,
        userId: specialRequests.userId,
        title: specialRequests.title,
        details: specialRequests.details,
        status: specialRequests.status,
        month: specialRequests.month,
        archived: specialRequests.archived,
        createdAt: specialRequests.createdAt,
        updatedAt: specialRequests.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(specialRequests)
      .innerJoin(users, eq(specialRequests.userId, users.id))
      .where(eq(specialRequests.month, month))
      .orderBy(desc(specialRequests.createdAt));

    return requests as (SpecialRequest & { user: SafeUser })[];
  }

  async getSpecialRequestsByStatus(status: string, month?: string): Promise<(SpecialRequest & { user: SafeUser })[]> {
    let conditions = [eq(specialRequests.status, status)];

    if (month) {
      conditions.push(eq(specialRequests.month, month));
    }

    const requests = await db
      .select({
        id: specialRequests.id,
        userId: specialRequests.userId,
        title: specialRequests.title,
        details: specialRequests.details,
        status: specialRequests.status,
        month: specialRequests.month,
        archived: specialRequests.archived,
        createdAt: specialRequests.createdAt,
        updatedAt: specialRequests.updatedAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(specialRequests)
      .innerJoin(users, eq(specialRequests.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(specialRequests.createdAt));

    return requests as (SpecialRequest & { user: SafeUser })[];
  }

  async getSpecialRequestsByStatusWithUser(status: string, month: string): Promise<any[]> {
    console.log(`Storage: Fetching requests with status "${status}" for month "${month}"`);

    const requests = await db
      .select({
        id: specialRequests.id,
        userId: specialRequests.userId,
        title: specialRequests.title,
        details: specialRequests.details,
        status: specialRequests.status,
        month: specialRequests.month,
        archived: specialRequests.archived,
        createdAt: specialRequests.createdAt,
        updatedAt: specialRequests.updatedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          department: users.department,
          email: users.email,
        },
      })
      .from(specialRequests)
      .leftJoin(users, eq(specialRequests.userId, users.id))
      .where(
        and(
          eq(specialRequests.status, status),
          eq(specialRequests.month, month)
        )
      )
      .orderBy(desc(specialRequests.createdAt));

    console.log(`Storage: Found ${requests.length} requests`);
    return requests;
  }

  async getSpecialRequestsByMonthWithUser(month: string): Promise<any[]> {
    console.log(`Storage: Fetching all requests for month "${month}"`);

    const requests = await db
      .select({
        id: specialRequests.id,
        userId: specialRequests.userId,
        title: specialRequests.title,
        details: specialRequests.details,
        status: specialRequests.status,
        month: specialRequests.month,
        archived: specialRequests.archived,
        createdAt: specialRequests.createdAt,
        updatedAt: specialRequests.updatedAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          department: users.department,
          email: users.email,
        },
      })
      .from(specialRequests)
      .leftJoin(users, eq(specialRequests.userId, users.id))
      .where(eq(specialRequests.month, month))
      .orderBy(desc(specialRequests.createdAt));

    console.log(`Storage: Found ${requests.length} requests`);
    return requests;
  }

  async getAllSpecialRequests(): Promise<SpecialRequest[]> {
    const requests = await db
      .select()
      .from(specialRequests)
      .orderBy(desc(specialRequests.createdAt));

    console.log(`Storage: Total requests in database: ${requests.length}`);
    return requests;
  }

  // ============= REQUEST COMMENT METHODS =============

  async getRequestComments(requestId: string): Promise<(RequestComment & { user: SafeUser })[]> {
    const comments = await db
      .select({
        id: requestComments.id,
        requestId: requestComments.requestId,
        userId: requestComments.userId,
        comment: requestComments.comment,
        isAdminComment: requestComments.isAdminComment,
        statusChange: requestComments.statusChange,
        createdAt: requestComments.createdAt,
        user: {
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          department: users.department,
          position: users.position,
          salary: users.salary,
          status: users.status,
          shiftType: users.shiftType,
          shiftStartTime: users.shiftStartTime,
          shiftEndTime: users.shiftEndTime,
          morningShiftStart: users.morningShiftStart,
          morningShiftEnd: users.morningShiftEnd,
          eveningShiftStart: users.eveningShiftStart,
          eveningShiftEnd: users.eveningShiftEnd,
          openShiftRequiredHours: users.openShiftRequiredHours,
          phone: users.phone,
          whatsappPreference: users.whatsappPreference,
          address: users.address,
          emergencyContact: users.emergencyContact,
          isActive: users.isActive,
          createdAt: users.createdAt,
        },
      })
      .from(requestComments)
      .innerJoin(users, eq(requestComments.userId, users.id))
      .where(eq(requestComments.requestId, requestId))
      .orderBy(requestComments.createdAt);

    return comments as (RequestComment & { user: SafeUser })[];
  }

  async addRequestComment(comment: InsertRequestComment): Promise<RequestComment> {
    const [created] = await db
      .insert(requestComments)
      .values(comment)
      .returning();
    return created;
  }

  async getRequestCommentsWithUser(requestId: string): Promise<any[]> {
    const comments = await db
      .select({
        id: requestComments.id,
        requestId: requestComments.requestId,
        comment: requestComments.comment,
        isAdminComment: requestComments.isAdminComment,
        statusChange: requestComments.statusChange,
        createdAt: requestComments.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(requestComments)
      .leftJoin(users, eq(requestComments.userId, users.id))
      .where(eq(requestComments.requestId, requestId))
      .orderBy(requestComments.createdAt);

    return comments;
  }

  async getRequestCommentWithUser(commentId: string): Promise<any> {
    const [comment] = await db
      .select({
        id: requestComments.id,
        requestId: requestComments.requestId,
        comment: requestComments.comment,
        isAdminComment: requestComments.isAdminComment,
        statusChange: requestComments.statusChange,
        createdAt: requestComments.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(requestComments)
      .leftJoin(users, eq(requestComments.userId, users.id))
      .where(eq(requestComments.id, commentId));

    return comment || null;
  }

  // ============= ARCHIVE METHODS =============

  async getMonthlyArchive(month: string): Promise<MonthlyArchive | undefined> {
    const [archive] = await db
      .select()
      .from(monthlyArchive)
      .where(eq(monthlyArchive.month, month));
    return archive || undefined;
  }

  async archiveMonth(month: string): Promise<MonthlyArchive> {
    // Count reports for this month
    const reportCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(dailyShiftReports)
      .where(eq(dailyShiftReports.month, month));

    // Count requests for this month
    const requestCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(specialRequests)
      .where(eq(specialRequests.month, month));

    // Mark reports as archived
    await db
      .update(dailyShiftReports)
      .set({ archived: true })
      .where(eq(dailyShiftReports.month, month));

    // Mark requests as archived
    await db
      .update(specialRequests)
      .set({ archived: true })
      .where(eq(specialRequests.month, month));

    // Create archive record
    const [archive] = await db
      .insert(monthlyArchive)
      .values({
        month,
        totalReports: Number(reportCountResult[0]?.count || 0),
        totalRequests: Number(requestCountResult[0]?.count || 0),
      })
      .returning();

    return archive;
  }

  async getArchivedMonths(): Promise<MonthlyArchive[]> {
    return db
      .select()
      .from(monthlyArchive)
      .orderBy(desc(monthlyArchive.month));
  }

  async isMonthArchived(month: string): Promise<boolean> {
    const [archive] = await db
      .select()
      .from(monthlyArchive)
      .where(eq(monthlyArchive.month, month));
    return !!archive;
  }

  async getArchivedReports(month: string): Promise<DailyShiftReport[]> {
    return db
      .select()
      .from(dailyShiftReports)
      .where(and(
        eq(dailyShiftReports.month, month),
        eq(dailyShiftReports.archived, true)
      ))
      .orderBy(desc(dailyShiftReports.date));
  }

  async getArchivedRequests(month: string): Promise<SpecialRequest[]> {
    return db
      .select()
      .from(specialRequests)
      .where(and(
        eq(specialRequests.month, month),
        eq(specialRequests.archived, true)
      ))
      .orderBy(desc(specialRequests.createdAt));
  }

  async getShiftsForOvertimeCheck(): Promise<(Shift & { user: SafeUser })[]> {
    const today = new Date().toISOString().split('T')[0];

    // Get all shifts that are NOT closed (endTime is null) for today or previous days (technically overtime could span days)
    // We filter by status 'present' or 'late' (meaning active) and check checking clockOut columns.

    const activeShifts = await db
      .select({
        id: shifts.id,
        userId: shifts.userId,
        date: shifts.date,
        scheduledDate: shifts.scheduledDate,
        morningClockIn: shifts.morningClockIn,
        morningClockOut: shifts.morningClockOut,
        morningLateMinutes: shifts.morningLateMinutes,
        eveningClockIn: shifts.eveningClockIn,
        eveningClockOut: shifts.eveningClockOut,
        eveningLateMinutes: shifts.eveningLateMinutes,
        status: shifts.status,
        notes: shifts.notes,
        overtimeNotificationSent: shifts.overtimeNotificationSent,
        createdAt: shifts.createdAt,
        user: getSafeUserSelectFields()
      })
      .from(shifts)
      .innerJoin(users, eq(shifts.userId, users.id))
      .where(
        and(
          // Shifts that are active (clocked in but not out)
          // We check if either morning or evening is active
          or(
            and(isNotNull(shifts.morningClockIn), isNull(shifts.morningClockOut)),
            and(isNotNull(shifts.eveningClockIn), isNull(shifts.eveningClockOut))
          )
        )
      );

    return activeShifts;
  }

  async forceCloseActiveShiftsAndBreaks(): Promise<number> {
    const now = new Date();
    
    // Get Pakistan time for date calculations (UTC+5)
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const pakistanTime = new Date(utcTime + (5 * 60 * 60000));
    const todayPakistan = pakistanTime.toISOString().split('T')[0];

    console.log(`[9AM Cleanup] Today in Pakistan: ${todayPakistan}`);

    // 1. Force Close active shifts from BEFORE TODAY (Pakistan time)
    // Close shifts where date < today (Pakistan time)
    // Mark them as "incomplete" status with auto-close note

    // Close Morning Shifts
    const morningResult = await db.update(shifts)
      .set({ 
        morningClockOut: now,
        status: "incomplete",
        notes: sql`COALESCE(${shifts.notes}, '') || '\n[System] Auto-closed at 9 AM - Incomplete shift'`
      })
      .where(
        and(
          lt(shifts.date, todayPakistan),
          isNotNull(shifts.morningClockIn),
          isNull(shifts.morningClockOut)
        )
      )
      .returning({ id: shifts.id });

    // Close Evening Shifts
    const eveningResult = await db.update(shifts)
      .set({ 
        eveningClockOut: now,
        status: "incomplete",
        notes: sql`COALESCE(${shifts.notes}, '') || '\n[System] Auto-closed at 9 AM - Incomplete shift'`
      })
      .where(
        and(
          lt(shifts.date, todayPakistan),
          isNotNull(shifts.eveningClockIn),
          isNull(shifts.eveningClockOut)
        )
      )
      .returning({ id: shifts.id });

    const shiftsClosed = morningResult.length + eveningResult.length;
    console.log(`[9AM Cleanup] Closed ${morningResult.length} morning shifts, ${eveningResult.length} evening shifts`);

    // 2. Force End all active breaks from previous days
    const activeBreaks = await db.select().from(breaks)
      .where(
        and(
          isNull(breaks.endTime),
          lt(breaks.date, todayPakistan)
        )
      );

    for (const b of activeBreaks) {
      const duration = Math.floor((now.getTime() - new Date(b.startTime).getTime()) / 60000);

      await db.update(breaks)
        .set({
          endTime: now,
          durationMinutes: duration
        })
        .where(eq(breaks.id, b.id));
    }

    console.log(`[9AM Cleanup] Closed ${activeBreaks.length} active breaks`);

    return shiftsClosed + activeBreaks.length;
  }
}

export const storage = new DatabaseStorage();