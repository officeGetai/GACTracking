import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { startShiftScheduler } from "./shiftScheduler";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function ensureAdminExists() {
  try {
    // Check if superadmin exists (by username 'superadmin' or role 'superadmin')
    const existingSuperAdmin = await db
      .select()
      .from(users)
      .where(eq(users.username, "superadmin"))
      .limit(1);

    const hashedPassword = await bcrypt.hash("superadmin123", 10);

    if (existingSuperAdmin.length === 0) {
      // Create the superadmin user
      await db.insert(users).values({
        username: "superadmin",
        password: hashedPassword,
        firstName: "Super",
        lastName: "Administrator",
        email: "superadmin@gactrackings.com",
        role: "superadmin",
        department: "Administration",
        position: "Super Admin",
        isActive: true,
      });
      log("Default superadmin user created (superadmin/superadmin123)");
    } else {
      // Ensure the superadmin role is set correctly and password is reset
      await db.update(users)
        .set({
          password: hashedPassword,
          role: "superadmin"
        })
        .where(eq(users.username, "superadmin"));
      log("Superadmin password reset to default");
    }

    // Also ensure the legacy admin user exists for backward compatibility
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.username, "admin"))
      .limit(1);

    if (existingAdmin.length === 0) {
      const adminHashedPassword = await bcrypt.hash("admin123", 10);
      await db.insert(users).values({
        username: "admin",
        password: adminHashedPassword,
        firstName: "System",
        lastName: "Administrator",
        email: "admin@gactrackings.com",
        role: "admin",
        department: "Administration",
        position: "System Admin",
        isActive: true,
      });
      log("Default admin user created (admin/admin123)");
    }
  } catch (error) {
    console.error("Failed to ensure admin exists:", error);
  }
}

import { startScheduler } from "./scheduler";

(async () => {
  await ensureAdminExists();
  startScheduler(); // Start the background scheduler
  await registerRoutes(httpServer, app);

  // Start the background shift scheduler
  startShiftScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
