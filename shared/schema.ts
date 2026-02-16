// shared/schema.ts
import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  varchar,
  timestamp,
  boolean,
  date,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Departments table
export const departments = pgTable("departments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  whatsappGroupId: text("whatsapp_group_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("employee"),
  department: text("department"),
  position: text("position"),
  salary: integer("salary"),
  status: text("status").notNull().default("active"),
  shiftType: text("shift_type").notNull().default("one_shift"),

  // One shift times
  shiftStartTime: text("shift_start_time"),
  shiftEndTime: text("shift_end_time"),

  // Two shift times
  morningShiftStart: text("morning_shift_start"),
  morningShiftEnd: text("morning_shift_end"),
  eveningShiftStart: text("evening_shift_start"),
  eveningShiftEnd: text("evening_shift_end"),

  phone: text("phone"),
  whatsappPreference: text("whatsapp_preference").default("both"),
  address: text("address"),
  emergencyContact: text("emergency_contact"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  // Changed from decimal to text to avoid type issues with `storage.ts` using `String(value)`
  openShiftRequiredHours: text("required_hours").default("8"),
});
// Add this new table definition in shared/schema.ts, for example, after the 'users' table

// Replace the old 'sessions' table definition with this one
export const sessions = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { mode: "date", withTimezone: true }).notNull(),
});
// BD TARGETS TABLE (Amounts changed to text for flexible precision)
export const bdTargets = pgTable("bd_targets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  month: text("month").notNull(), // Format: "YYYY-MM"
  targetType: text("target_type").default("revenue"),
  targetAmount: text("target_amount").notNull(), // Changed from decimal to text
  achievedAmount: text("achieved_amount").default("0"), // Changed from decimal to text
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Shifts table for daily clock in/out records (morning/evening shifts)
export const shifts = pgTable("shifts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  date: date("date").notNull(),
  // Scheduled date - the intended working date based on shift schedule (may differ from date for cross-midnight shifts)
  scheduledDate: date("scheduled_date"),
  // Morning shift
  morningClockIn: timestamp("morning_clock_in"),
  morningClockOut: timestamp("morning_clock_out"),
  morningLateMinutes: integer("morning_late_minutes").default(0),
  // Evening shift
  eveningClockIn: timestamp("evening_clock_in"),
  eveningClockOut: timestamp("evening_clock_out"),
  eveningLateMinutes: integer("evening_late_minutes").default(0),
  // Status
  status: text("status").notNull().default("not_started"), // 'not_started', 'present', 'absent', 'late', 'half_day'
  notes: text("notes"),
  overtimeNotificationSent: boolean("overtime_notification_sent").default(
    false,
  ),
  // Overtime window tracking
  lastOvertimeExtension: timestamp("last_overtime_extension"),
  overtimeReminderCount: integer("overtime_reminder_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Breaks table for tracking employee breaks
export const breaks = pgTable("breaks", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  shiftId: varchar("shift_id").references(() => shifts.id),
  date: date("date").notNull(),
  type: text("type").notNull(), // 'prayer', 'meal', 'urgent'
  shiftPeriod: text("shift_period").notNull().default("morning"), // 'morning' or 'evening'
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationMinutes: integer("duration_minutes"),
  lateNotificationSent: boolean("late_notification_sent").default(false),
  lastExceedNotificationAt: timestamp("last_exceed_notification_at"),
  exceedNotificationCount: integer("exceed_notification_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Targets table for meetings and orders tracking
export const targets = pgTable("targets", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  month: text("month").notNull(), // Format: 'YYYY-MM'
  meetingTarget: integer("meeting_target").default(0),
  orderTarget: integer("order_target").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Target items (meetings and orders)
export const targetItems = pgTable("target_items", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  targetId: varchar("target_id")
    .notNull()
    .references(() => targets.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // 'meeting' or 'order'
  name: text("name").notNull(),
  source: text("source"), // 'Top Upwork', 'B2B', etc.
  clientType: text("client_type"), // 'B2B' or 'B2C'
  contactLink: text("contact_link"),
  date: date("date").notNull(),
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  isRejected: boolean("is_rejected").default(false),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity logs for tracking all employee actions (ADDED metadata column)
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(), // 'clock_in', 'clock_out', 'break_start', 'break_end', etc.
  details: text("details"),
  metadata: jsonb("metadata"), // New metadata column
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// WASENDER API configuration with three separate group IDs
export const wasenderConfig = pgTable("wasender_config", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  instanceId: text("instance_id"),
  apiToken: text("api_token"),
  groupId: text("group_id"),
  requestsGroupId: text("requests_group_id"),
  shiftReportsGroupId: text("shift_reports_group_id"),
  trackingAlertsGroupId: text("tracking_alerts_group_id"),
  isActive: boolean("is_active").default(false),
  lastTested: timestamp("last_tested"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily Shift Reports table
export const dailyShiftReports = pgTable("daily_shift_reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  shiftId: varchar("shift_id")
    .notNull()
    .references(() => shifts.id),
  date: date("date").notNull(),
  workDetails: text("work_details").notNull(), // Main work description
  loomVideos: text("loom_videos"), // JSON array of video links
  notes: text("notes"), // Additional notes
  references: text("references"), // JSON array of reference links
  month: text("month").notNull(), // Format: 'YYYY-MM' for archiving
  shiftType: text("shift_type"), // 'morning' or 'evening'
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Special Requests table
export const specialRequests = pgTable("special_requests", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("sent_for_approval"), // 'sent_for_approval', 'approved', 'not_approved', 'revision', 'resolved'
  month: text("month").notNull(), // Format: 'YYYY-MM' for archiving
  // New fields for enhanced request system
  requestDates: jsonb("request_dates"), // JSON array of {date: string, shiftType: string}
  adminResponse: text("admin_response"), // Admin's official response message
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Request Comments/Revisions table (conversation thread)
export const requestComments = pgTable("request_comments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  requestId: varchar("request_id")
    .notNull()
    .references(() => specialRequests.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment").notNull(),
  isAdminComment: boolean("is_admin_comment").notNull().default(false),
  statusChange: text("status_change"), // Status change if this comment changed the request status
  createdAt: timestamp("created_at").defaultNow(),
});

// Monthly Archive table (tracks which months are archived)
export const monthlyArchive = pgTable("monthly_archive", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  month: text("month").notNull().unique(), // Format: 'YYYY-MM'
  archivedDate: timestamp("archived_date").defaultNow(),
  totalReports: integer("total_reports").default(0),
  totalRequests: integer("total_requests").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  shifts: many(shifts),
  breaks: many(breaks),
  targets: many(targets),
  targetItems: many(targetItems),
  activityLogs: many(activityLogs),
  dailyShiftReports: many(dailyShiftReports),
  specialRequests: many(specialRequests),
  requestComments: many(requestComments),
  bdTargets: many(bdTargets), // Added BD targets relation
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  user: one(users, {
    fields: [shifts.userId],
    references: [users.id],
  }),
  breaks: many(breaks),
}));

export const breaksRelations = relations(breaks, ({ one }) => ({
  user: one(users, {
    fields: [breaks.userId],
    references: [users.id],
  }),
  shift: one(shifts, {
    fields: [breaks.shiftId],
    references: [shifts.id],
  }),
}));

export const targetsRelations = relations(targets, ({ one, many }) => ({
  user: one(users, {
    fields: [targets.userId],
    references: [users.id],
  }),
  items: many(targetItems),
}));

export const targetItemsRelations = relations(targetItems, ({ one }) => ({
  target: one(targets, {
    fields: [targetItems.targetId],
    references: [targets.id],
  }),
  user: one(users, {
    fields: [targetItems.userId],
    references: [users.id],
  }),
  verifier: one(users, {
    fields: [targetItems.verifiedBy],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const dailyShiftReportsRelations = relations(
  dailyShiftReports,
  ({ one }) => ({
    user: one(users, {
      fields: [dailyShiftReports.userId],
      references: [users.id],
    }),
    shift: one(shifts, {
      fields: [dailyShiftReports.shiftId],
      references: [shifts.id],
    }),
  }),
);

export const specialRequestsRelations = relations(
  specialRequests,
  ({ one, many }) => ({
    user: one(users, {
      fields: [specialRequests.userId],
      references: [users.id],
    }),
    comments: many(requestComments),
  }),
);

export const requestCommentsRelations = relations(
  requestComments,
  ({ one }) => ({
    request: one(specialRequests, {
      fields: [requestComments.requestId],
      references: [specialRequests.id],
    }),
    user: one(users, {
      fields: [requestComments.userId],
      references: [users.id],
    }),
  }),
);

export const bdTargetsRelations = relations(bdTargets, ({ one }) => ({
  user: one(users, {
    fields: [bdTargets.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertShiftSchema = createInsertSchema(shifts).omit({
  id: true,
  createdAt: true,
});

export const insertBreakSchema = createInsertSchema(breaks).omit({
  id: true,
  createdAt: true,
});

export const insertTargetSchema = createInsertSchema(targets).omit({
  id: true,
  createdAt: true,
});

export const insertTargetItemSchema = createInsertSchema(targetItems).omit({
  id: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

// Updated WasenderConfig schema for insert
export const insertWasenderConfigSchema = createInsertSchema(
  wasenderConfig,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDailyShiftReportSchema = createInsertSchema(
  dailyShiftReports,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpecialRequestSchema = createInsertSchema(
  specialRequests,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRequestCommentSchema = createInsertSchema(
  requestComments,
).omit({
  id: true,
  createdAt: true,
});

export const insertMonthlyArchiveSchema = createInsertSchema(
  monthlyArchive,
).omit({
  id: true,
  createdAt: true,
});

export const insertBdTargetSchema = createInsertSchema(bdTargets).omit({
  id: true,
  createdAt: true,
});

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  role: z.enum(["superadmin", "admin", "employee"]),
});

// User roles constant for reference
export const USER_ROLES = ["superadmin", "admin", "employee"] as const;

// Types (automatically inferred from Drizzle schemas)
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

export type InsertBreak = z.infer<typeof insertBreakSchema>;
export type Break = typeof breaks.$inferSelect;

export type InsertTarget = z.infer<typeof insertTargetSchema>;
export type Target = typeof targets.$inferSelect;

export type InsertTargetItem = z.infer<typeof insertTargetItemSchema>;
export type TargetItem = typeof targetItems.$inferSelect;

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Updated WasenderConfig types
export type InsertWasenderConfig = z.infer<typeof insertWasenderConfigSchema>;
export type WasenderConfig = typeof wasenderConfig.$inferSelect;

export type InsertDailyShiftReport = z.infer<
  typeof insertDailyShiftReportSchema
>;
export type DailyShiftReport = typeof dailyShiftReports.$inferSelect;

export type InsertSpecialRequest = z.infer<typeof insertSpecialRequestSchema>;
export type SpecialRequest = typeof specialRequests.$inferSelect;

export type InsertRequestComment = z.infer<typeof insertRequestCommentSchema>;
export type RequestComment = typeof requestComments.$inferSelect;

export type InsertMonthlyArchive = z.infer<typeof insertMonthlyArchiveSchema>;
export type MonthlyArchive = typeof monthlyArchive.$inferSelect;

export type InsertBdTarget = z.infer<typeof insertBdTargetSchema>;
export type BdTarget = typeof bdTargets.$inferSelect;

export type LoginData = z.infer<typeof loginSchema>;

// User without password for frontend
export type SafeUser = Omit<User, "password">;

// Break limits configuration per shift type
export const BREAK_LIMITS_BY_SHIFT_TYPE = {
  one_shift: {
    prayer: { maxPerDay: 4, maxDuration: 16 },
    meal: { maxPerDay: 1, maxDuration: 31 },
    urgent: { maxPerDay: 2, maxDuration: 10 },
    allowedPeriods: ["morning", "evening"] as const,
  },
  two_shifts: {
    prayer: { maxPerDay: 3, maxDuration: 16 },
    meal: { maxPerDay: 1, maxDuration: 31 },
    urgent: { maxPerDay: 2, maxDuration: 10 },
    allowedPeriods: ["morning"] as const,
  },
  open: {
    prayer: { maxPerDay: 4, maxDuration: 16 },
    meal: { maxPerDay: 1, maxDuration: 31 },
    urgent: { maxPerDay: 2, maxDuration: 10 },
    allowedPeriods: ["morning", "evening"] as const,
  },
} as const;

// Default break limits (used by scheduler for duration checks)
export const BREAK_LIMITS = {
  prayer: { maxPerDay: 4, shiftPeriod: "any" as const, maxDuration: 16 },
  meal: { maxPerDay: 1, shiftPeriod: "any" as const, maxDuration: 31 },
  urgent: { maxPerShift: 2, shiftPeriod: "any" as const, maxDuration: 10 },
} as const;

// Departments list
export const DEPARTMENTS = [
  "Development",
  "Business Development",
  "Designing Team",
] as const;

// Shift types
export const SHIFT_TYPES = ["one_shift", "two_shifts", "open"] as const;

// WhatsApp preferences
export const WHATSAPP_PREFERENCES = [
  "both",
  "breaks_only",
  "shift_reports_only",
  "none",
] as const;

// Special Request statuses
export const SPECIAL_REQUEST_STATUSES = [
  "sent_for_approval",
  "approved",
  "not_approved",
  "revision",
  "resolved",
] as const;

// Business Development Sources
export const BUSINESS_SOURCES = [
  "FB Yousaf",
  "FB Abdullah",
  "FB Get Ai",
  "Insta Yousaf",
  "Insta Getai",
  "Linkedin Yousaf",
  "Linkedin Abdullah",
  "Linkedin Get Ai",
  "Discovery",
  "Top Upwork",
  "New Upwork",
  "Fiver Top",
] as const;

export const CLIENT_TYPES = ["B2B", "B2C"] as const;
