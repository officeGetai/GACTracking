
import { storage } from "./server/storage";
import { db } from "./server/db";
import { users, shifts } from "./shared/schema";
import { eq, and, lt } from "drizzle-orm";

async function investigate() {
    try {
        console.log("--- INVESTIGATING USERS ---");
        const allUsers = await db.select().from(users);
        const hamza = allUsers.find(u =>
            (u.firstName + " " + u.lastName).toLowerCase().includes("hamza sajid") ||
            u.username.toLowerCase().includes("hamza")
        );

        if (!hamza) {
            console.log("Hamza Sajid not found. All users:", allUsers.map(u => `${u.firstName} ${u.lastName} (${u.username})`));
            // process.exit(0);
        } else {
            console.log(`Found Hamza Sajid: ID=${hamza.id}, Username=${hamza.username}, ShiftType=${hamza.shiftType}`);
            console.log(`  Morning: ${hamza.morningShiftStart} - ${hamza.morningShiftEnd}`);
            console.log(`  Evening: ${hamza.eveningShiftStart} - ${hamza.eveningShiftEnd}`);
            console.log(`  OneShift: ${hamza.shiftStartTime} - ${hamza.shiftEndTime}`);
        }

        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const pakistanTime = new Date(utcTime + (5 * 60 * 60000));
        const todayPakistan = pakistanTime.toISOString().split('T')[0];

        console.log(`\n--- SHIFT CHECK ---`);
        console.log(`Current Time (UTC): ${now.toISOString()}`);
        console.log(`Pakistan Date: ${todayPakistan}`);

        const hamzaShifts = hamza ? await db.select().from(shifts).where(eq(shifts.userId, hamza.id)) : [];
        console.log(`\nHamza's Shifts (last 5):`);
        hamzaShifts.sort((a, b) => b.id - a.id).slice(0, 5).forEach(s => {
            console.log(JSON.stringify(s, null, 2));
        });

        console.log(`\nActive Shifts right now:`);
        const activeShifts = await storage.getActiveShiftsNeedingClosure();
        activeShifts.forEach(s => {
            console.log(`User: ${s.user.username} (${s.user.firstName} ${s.user.lastName}), Date: ${s.date}, ScheduledDate: ${s.scheduledDate}`);
            console.log(`  Morning: ${s.morningClockIn} - ${s.morningClockOut}`);
            console.log(`  Evening: ${s.eveningClockIn} - ${s.eveningClockOut}`);
        });

        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

investigate();
