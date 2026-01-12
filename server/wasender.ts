// server/wasender.ts

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual API endpoint if different. 
// You had "https://wasenderapi.com/api/send-message" in your snippet.
const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";

// Pakistan timezone offset (GMT+5)
const PAKISTAN_TIMEZONE_OFFSET = 5 * 60; // 5 hours in minutes

// --- TYPES ---
export interface WasenderSettings {
  instanceId?: string | null; // Added for compatibility with some DB schemas
  apiToken: string | null;
  groupId: string | null;
  isActive: boolean | null;
}

interface Employee {
  fullName: string;
  department: string;
  phone?: string | null;
  whatsappPreference?: string | null; // "both", "breaks_only", "shift_reports_only", "none"
}

// --- HELPER FUNCTIONS ---

function getPakistanTime(): Date {
  const now = new Date();
  // Get UTC time and add Pakistan offset
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (PAKISTAN_TIMEZONE_OFFSET * 60000));
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function getSessionType(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  return "Evening";
}

/**
 * Send WhatsApp message to a specific target (Group ID or Phone Number)
 */
async function sendToTarget(target: string, text: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(WASENDER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: target, // Note: Some APIs use 'to', some use 'number'. Your snippet used 'to', I switched to 'number' based on common WA APIs. Check your provider!
        message: text,  // Note: Some APIs use 'text', some use 'message'.
        // If your API specifically requires 'to' and 'text', revert these property names.
      }),
    });

    if (!response.ok) {
      console.error(`WASENDER API error for target ${target}:`, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Failed to send WhatsApp notification to ${target}:`, error);
    return false;
  }
}

/**
 * Main function to handle notification logic based on preferences
 */
async function sendNotification(
  message: string,
  employee: Employee,
  settings: WasenderSettings,
  notificationType: "shift" | "break" | "report" | "reminder"
): Promise<void> {
  // Skip if not configured or not active
  if (!settings.apiToken || !settings.isActive) {
    console.log("WASENDER not fully configured or not active, skipping notification");
    return;
  }

  const targets: string[] = [];
  const preference = employee.whatsappPreference || "both"; // Default to both if not set

  // 1. Determine if we should send to Group (Skip for private reminders)
  if (settings.groupId && notificationType !== "reminder") {
    targets.push(settings.groupId);
  }

  // 2. Determine if we should send to Individual
  // Check if employee has a phone number and their preference allows this notification type
  let shouldSendToIndividual = false;

  if (employee.phone) {
    if (notificationType === "reminder") {
      shouldSendToIndividual = true; // Always send reminders if phone exists
    } else {
      shouldSendToIndividual =
        preference === "both" ||
        (preference === "shift_reports_only" && (notificationType === "report" || notificationType === "shift")) ||
        (preference === "breaks_only" && notificationType === "break");
    }
  }

  if (shouldSendToIndividual && employee.phone) {
    targets.push(employee.phone);
  }

  if (targets.length === 0) {
    console.log("No targets to send WhatsApp notification to.");
    return;
  }

  console.log(`Sending WhatsApp notification (${notificationType}) to ${targets.length} targets...`);

  // Send to all targets sequentially with delay to avoid rate limits
  let successCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    // Add delay if not the first message
    if (i > 0) {
      console.log("Waiting 7 seconds before next message to respect rate limits...");
      await new Promise(resolve => setTimeout(resolve, 7000));
    }

    const success = await sendToTarget(target, message, settings.apiToken!);
    if (success) successCount++;
  }

  console.log(`WhatsApp notifications sent: ${successCount}/${targets.length} successful.`);
}

// --- EXPORTED NOTIFICATION FUNCTIONS ---

export async function notifyShiftStart(employee: Employee, settings: WasenderSettings): Promise<void> {
  const now = getPakistanTime();
  const message = `🌅 SHIFT STARTED

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
⏰ Session: ${getSessionType(now)}
🕐 Started at: ${formatTime(now)}

✅ Employee has checked in successfully.`;

  await sendNotification(message, employee, settings, "shift");
}

export async function notifyShiftEnd(
  employee: Employee,
  shiftStartTime: Date,
  totalWorkedMinutes: number,
  breaksTaken: number,
  totalBreakMinutes: number,
  lateMinutes: number = 0,
  settings: WasenderSettings
): Promise<void> {
  const now = getPakistanTime();
  const workedHours = Math.floor(totalWorkedMinutes / 60);
  const workedMins = totalWorkedMinutes % 60;

  // Convert shift start time to Pakistan time
  const utcStartTime = shiftStartTime.getTime() + (shiftStartTime.getTimezoneOffset() * 60000);
  const startTimePKT = new Date(utcStartTime + (PAKISTAN_TIMEZONE_OFFSET * 60000));

  const message = `🔴 SHIFT REPORT

⌛ Late By: ${lateMinutes} minutes
👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
⏰ Shift: ${getSessionType(startTimePKT)}
🌅 Shift Started At: ${formatTime(startTimePKT)}
🌇 Shift Ended At: ${formatTime(now)}

📊 Shift Summary:
✅ Total Worked Hours: ${workedHours}h ${workedMins}m
🕒 Required Working Hours: 8h 0m
☕ Breaks Taken: ${breaksTaken}
☕ Total break Duration: ${totalBreakMinutes} minutes

✅ Employee has checked out successfully.`;

  await sendNotification(message, employee, settings, "shift");
}

export async function notifyBreakStart(employee: Employee, breakType: string, settings: WasenderSettings): Promise<void> {
  const now = getPakistanTime();

  const breakEmoji = breakType === "prayer" ? "🕌" :
    breakType === "meal" ? "🍽️" :
      breakType === "urgent" ? "🚨" : "☕";

  const message = `${breakEmoji} BREAK STARTED

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
📋 Break Type: ${breakType}
🕐 Started at: ${formatTime(now)}

⏸️ Employee is now on break.`;

  await sendNotification(message, employee, settings, "break");
}

export async function notifyBreakEnd(
  employee: Employee,
  breakType: string,
  durationMinutes: number,
  settings: WasenderSettings
): Promise<void> {
  const now = getPakistanTime();

  const message = `🚨 BREAK ENDED

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
📋 Break Type: ${breakType}
🕐 Ended at: ${formatTime(now)}
⏱️ Duration: ${durationMinutes} minutes

▶️ Employee has resumed work.`;

  await sendNotification(message, employee, settings, "break");
}

export async function notifyDailyReportSubmitted(
  employee: Employee,
  workDetails: string,
  settings: WasenderSettings
): Promise<void> {
  const now = getPakistanTime();

  const message = `📝 DAILY REPORT SUBMITTED

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
🕐 Submitted at: ${formatTime(now)}

📋 Work Summary:
${workDetails.substring(0, 200)}${workDetails.length > 200 ? '...' : ''}

✅ Report submitted successfully.`;

  await sendNotification(message, employee, settings, "report");
}

// --- NEW FUNCTION FOR SCHEDULER REMINDER ---
export async function notifyShiftReportReminder(
  user: { fullName: string; phone: string | null; whatsappPreference: string | null },
  messageBody: string,
  settings: WasenderSettings
): Promise<void> {

  // Create a minimal employee object for the helper function
  const employee: Employee = {
    fullName: user.fullName,
    phone: user.phone,
    whatsappPreference: user.whatsappPreference,
    department: "N/A" // Not needed for reminder
  };

  const message = `⚠️ *Action Required: Shift Reminder*

Hello ${user.fullName},

${messageBody}

👉 Please log in to your dashboard to submit your report and end your shift.`;

  // Send as "reminder" type (usually goes to individual only)
  await sendNotification(message, employee, settings, "reminder");
}