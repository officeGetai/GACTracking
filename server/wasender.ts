// server/wasender.ts

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual API endpoint if different.
const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";

// Pakistan timezone offset (GMT+5)
const PAKISTAN_TIMEZONE_OFFSET = 5 * 60; // 5 hours in minutes

// --- TYPES ---
export interface WasenderSettings {
  instanceId?: string | null;
  apiToken: string | null;
  // Removed: groupId: string | null; // Replaced by specific groups
  isActive: boolean | null;
  groups?: { // Added groups object as per shared/schema.ts
    requests?: string | null;       // For "GAC REQUESTS"
    shiftReports?: string | null;   // For "GAC SHIFT REPORTS"
    trackingAlerts?: string | null; // For "GAC TRACKING ALERTS"
  };
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
  if (hour >= 5 && hour < 23) return "Morning";
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
        to: target, // Changed from 'number' to 'to' per API error
        text: text, // Changed from 'message' to 'text' per API error
      }),
    });

    if (!response.ok) {
      console.error(`WASENDER API error for target ${target}: ${response.status} ${response.statusText}`, await response.text());
      return false;
    }

    console.log(`WASENDER message sent successfully to ${target}.`);
    return true;
  } catch (error) {
    console.error(`Failed to send WhatsApp notification to ${target}:`, error);
    return false;
  }
}

/**
 * Main function to handle notification logic based on preferences and notification type
 */
async function sendNotification(
  message: string,
  employee: Employee,
  settings: WasenderSettings,
  // Added "request" and "alert" for future use; "report" is already in use.
  notificationType: "shift" | "break" | "report" | "reminder" | "request" | "alert"
): Promise<void> {
  // Skip if not configured or not active
  if (!settings.apiToken || !settings.isActive) {
    console.log("WASENDER not fully configured or not active, skipping notification.");
    return;
  }

  const targets: string[] = [];
  const preference = employee.whatsappPreference || "both"; // Default to both if not set

  // Determine the correct group ID based on notificationType
  let groupToSendTo: string | null | undefined = null;
  if (settings.groups) {
    switch (notificationType) {
      case "report":
        // Only shift reports go to "GAC SHIFT REPORTS" group
        groupToSendTo = settings.groups.shiftReports;
        break;
      case "shift":
      case "break":
      case "alert":
        // Shift status, breaks, and alerts (late arrival, reminders, etc) go to "GAC TRACKING ALERTS" group
        groupToSendTo = settings.groups.trackingAlerts;
        break;
      case "request":
        // Special requests go to "GAC REQUESTS" group
        groupToSendTo = settings.groups.requests;
        break;
      // "reminder" notifications are typically individual, so no group for them
      default:
        console.log(`Unknown notification type '${notificationType}', no specific group assigned.`);
    }
  }

  // 1. Determine if we should send to Group
  // Only send to group if a group ID is configured for this type and it's not a personal reminder.
  if (groupToSendTo && groupToSendTo.trim() !== "" && notificationType !== "reminder") {
    targets.push(groupToSendTo);
  }

  // 2. Determine if we should send to Individual
  // Check if employee has a phone number and their preference allows this notification type
  let shouldSendToIndividual = false;

  if (employee.phone && employee.phone.trim() !== "") {
    if (notificationType === "reminder") {
      shouldSendToIndividual = true; // Always send reminders to individual if phone exists
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
    console.log(`No valid targets found for WhatsApp notification type '${notificationType}'.`);
    return;
  }

  console.log(`Sending WhatsApp notification (${notificationType}) to ${targets.length} targets: ${targets.join(', ')}...`);

  // Send to all targets sequentially with delay to avoid rate limits
  let successCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    // Add delay if not the first message
    if (i > 0) {
      console.log("Waiting 7 seconds before next message to respect rate limits...");
      await new Promise(resolve => setTimeout(resolve, 7000));
    }

    // Ensure apiToken is not null or undefined before passing
    if (settings.apiToken) {
      const success = await sendToTarget(target, message, settings.apiToken);
      if (success) successCount++;
    } else {
      console.error("WASENDER API token is missing, cannot send message.");
      break; // Stop sending if token is missing
    }
  }

  console.log(`WhatsApp notifications sent: ${successCount}/${targets.length} successful for type '${notificationType}'.`);
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

  await sendNotification(message, employee, settings, "report");
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
  settings: WasenderSettings,
  shiftType?: string
): Promise<void> {
  const now = getPakistanTime();
  // Fallback to time-based session type if shiftType is not provided
  const sessionTypeFromTime = getSessionType(now);
  const displayShiftType = shiftType && (shiftType === 'morning' || shiftType === 'evening')
    ? shiftType.charAt(0).toUpperCase() + shiftType.slice(1)
    : sessionTypeFromTime;

  const message = `📝 SHIFT REPORT SUBMITTED

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
🕐 Submitted at: ${formatTime(now)}
🌅 Shift Type: ${displayShiftType}

📋 Work Summary:
${workDetails.substring(0, 200)}${workDetails.length > 200 ? '...' : ''}

✅ Report submitted successfully.`;

  // Shift reports go to 'shiftReports' group
  await sendNotification(message, employee, settings, "report");
}

export async function notifySpecialRequestCreated(
  employee: Employee,
  title: string,
  details: string,
  settings: WasenderSettings
): Promise<void> {
  const now = getPakistanTime();

  const message = `📨 *NEW SPECIAL REQUEST*

👤 Employee: ${employee.fullName}
🏢 Department: ${employee.department}
🕐 Submitted at: ${formatTime(now)}

📌 *Title:* ${title}
📝 *Details:* 
${details.substring(0, 300)}${details.length > 300 ? '...' : ''}

👉 Please review this request in the admin portal.`;

  await sendNotification(message, employee, settings, "request");
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
    department: "N/A" // Department is not critical for a personal reminder
  };

  const message = `⚠️ *Action Required: Shift Reminder*

Hello ${user.fullName},

${messageBody}

👉 Please log in to your dashboard to submit your report and end your shift.`;

  // Send as "reminder" type (usually goes to individual only, not to a group)
  await sendNotification(message, employee, settings, "reminder");
}

export async function sendTestMessage(settings: WasenderSettings): Promise<{ success: boolean; message: string }> {
  if (!settings.apiToken) {
    return { success: false, message: "API Token is missing" };
  }

  // Find a target to send to (prioritize groups)
  let target = settings.groups?.requests || settings.groups?.shiftReports || settings.groups?.trackingAlerts;

  if (!target) {
    return { success: false, message: "No WhatsApp groups configured to test with." };
  }

  const message = `🔔 *GAC Trackings System Test*

✅ Connection successful!
This message confirms that your WhatsApp integration is working correctly.

timestamp: ${new Date().toISOString()}`;

  const sent = await sendToTarget(target, message, settings.apiToken);

  if (sent) {
    return { success: true, message: `Test message sent to group ${target}` };
  } else {
    return { success: false, message: "Failed to send message via WASENDER API" };
  }
}