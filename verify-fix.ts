
import { storage } from "./server/storage";

// Helper functions copied from routes.ts
function getScheduledStartTime(
    user: any,
    shiftPeriod: 'morning' | 'evening'
): string | null {
    if (!user) return null;
    if (user.shiftType === 'open') return null;
    if (user.shiftType === 'one_shift') return user.shiftStartTime || null;
    if (user.shiftType === 'two_shifts') {
        if (shiftPeriod === 'morning') return user.morningShiftStart || null;
        else return user.eveningShiftStart || null;
    }
    return user.shiftStartTime || null;
}

// Mocked functions for testing
function mockGetTodayDate(mockedDate: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(mockedDate);
}

function mockGetPakistaniHour(mockedDate: Date): number {
    return parseInt(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi',
        hour: '2-digit',
        hour12: false
    }).format(mockedDate), 10);
}

function mockGetDateInPakistan(mockedDate: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(mockedDate);
}

// Logic to test (extracted from routes.ts)
async function testGetEffectiveWorkingDate(userId: string, mockedNow: Date): Promise<string> {
    const now = mockedNow;
    let workingDateCandidate = mockGetTodayDate(now);
    const pktHour = mockGetPakistaniHour(now);

    console.log(`Testing at: ${now.toISOString()} (Mocked PKT Hour: ${pktHour})`);

    if (pktHour < 5) {
        try {
            const user = await storage.getUser(userId);
            const scheduledEveningStart = getScheduledStartTime(user, 'evening');

            if (scheduledEveningStart) {
                const [startHour] = scheduledEveningStart.split(':').map(Number);
                if (startHour >= 18) {
                    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    workingDateCandidate = mockGetDateInPakistan(yesterday);
                    console.log(`  [MATCH] Evening worker ${user?.username} (${scheduledEveningStart}). Shifting to ${workingDateCandidate}`);
                }
            }
        } catch (err) {
            console.error("Error:", err);
        }
    }

    return workingDateCandidate;
}

async function runTests() {
    try {
        const allUsers = await storage.getAllUsers();

        // Hamza Sajid
        const hamza = allUsers.find(u => u.username === "dev_hamza_sajid");
        const hamzaId = hamza?.id || "d2849f95-5798-4b9e-9d8d-3c9c7d66d5f9";

        // A morning worker
        const morningWorker = allUsers.find(u => u.shiftType === 'one_shift' && u.shiftStartTime && u.shiftStartTime.startsWith("09"));
        const morningWorkerId = morningWorker?.id;

        console.log("--- STARTING TESTS ---");

        // Scenario 1: Hamza clock-in at 00:15 AM (Jan 27)
        const hamzaClockIn = new Date("2026-01-27T00:15:00+05:00");
        const result1 = await testGetEffectiveWorkingDate(hamzaId, hamzaClockIn);
        console.log(`Scenario 1 (Hamza 00:15 Jan 27): Expected 2026-01-26, Got ${result1}`);
        if (result1 === "2026-01-26") console.log("✅ PASS"); else console.log("❌ FAIL");

        // Scenario 2: Morning worker at 01:00 AM (Jan 27)
        if (morningWorkerId) {
            const morningClockIn = new Date("2026-01-27T01:00:00+05:00");
            const result2 = await testGetEffectiveWorkingDate(morningWorkerId, morningClockIn);
            console.log(`Scenario 2 (Morning Worker ${morningWorker?.username} 01:00 Jan 27): Expected 2026-01-27, Got ${result2}`);
            if (result2 === "2026-01-27") console.log("✅ PASS"); else console.log("❌ FAIL");
        }

        process.exit(0);
    } catch (err) {
        console.error("Test Error:", err);
        process.exit(1);
    }
}

runTests();
