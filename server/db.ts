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

const dbUrl = new URL(process.env.DATABASE_URL);
const originalHost = dbUrl.hostname;
const isProduction = process.env.NODE_ENV === "production";

let resolvedIp = originalHost;

function createPool(host: string) {
  const poolConfig: any = {
    host: host,
    port: parseInt(dbUrl.port || "5432"),
    user: dbUrl.username,
    password: decodeURIComponent(dbUrl.password || ""),
    database: dbUrl.pathname.substring(1),
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 20,
  };

  if (isProduction) {
    poolConfig.ssl = {
      rejectUnauthorized: false,
      servername: originalHost,
    };
  }

  return new Pool(poolConfig);
}

export let pool = createPool(resolvedIp);

if (isProduction) {
  (async () => {
    try {
      const addresses = await dns.promises.resolve4(originalHost);
      if (addresses.length > 0) {
        resolvedIp = addresses[0];
        console.log(`[DB] Resolved ${originalHost} to ${resolvedIp}`);
        pool = createPool(resolvedIp);
      }
    } catch (err) {
      console.error(`[DB] DNS Resolve Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

pool.on('connect', () => console.log('[DB] New client connected to pool'));
pool.on('error', (err: any) => console.error('[DB] Unexpected pool error:', err));

export const db = drizzle(pool, { schema });
