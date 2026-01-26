import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

import { URL } from "node:url";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Low-level fix for IPv6 ETIMEDOUT issues:
// 1. Resolve hostname to an IPv4 address AT BOOT
// 2. Use the IP address directly for the connection
// 3. Keep SSL working by specifying the servername
const dbUrl = new URL(process.env.DATABASE_URL);
const originalHost = dbUrl.hostname;

// Synchronous resolve is not possible in node:dns, so we use a pre-resolved IP or the first one found
let resolvedIp = originalHost;
try {
  const addresses = await dns.promises.resolve4(originalHost);
  if (addresses.length > 0) {
    resolvedIp = addresses[0];
    console.log(`[DB] Resolved ${originalHost} to ${resolvedIp}`);
  }
} catch (err) {
  console.error(`[DB] DNS Resolve Error: ${err instanceof Error ? err.message : String(err)}`);
}

export const pool = new Pool({
  host: resolvedIp,
  port: parseInt(dbUrl.port || "5432"),
  user: dbUrl.username,
  password: decodeURIComponent(dbUrl.password || ""),
  database: dbUrl.pathname.substring(1),
  ssl: {
    rejectUnauthorized: false, // Typical for Neon/Cloud DBs
    servername: originalHost,   // REQUIRED for SNI
  },
  // Stability settings
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,
} as any);

// Pool event monitoring
pool.on('connect', () => console.log('[DB] New client connected to pool'));
pool.on('error', (err: any) => console.error('[DB] Unexpected pool error:', err));

export const db = drizzle(pool, { schema });
