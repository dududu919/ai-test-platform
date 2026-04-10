import type { ProjectConfig } from "../models/project-config.js";
import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

type DbClient = {
  type: "postgres" | "mysql" | "sqlite";
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  close: () => Promise<void>;
  placeholder: (index: number) => string;
};

export async function openDbClient(config: ProjectConfig): Promise<DbClient> {
  if (!config.db) {
    throw new Error("Missing database configuration in project.config.");
  }

  if (config.db.client === "sqlite") {
    const SQL = await initSqlJs();
    const dbPath = config.db.connectionString.replace("sqlite://", "");

    let db;
    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      throw new Error(`SQLite database not found: ${dbPath}`);
    }

    return {
      type: "sqlite",
      placeholder: () => "?",
      query: async (sql, params) => {
        const stmt = db.prepare(sql);
        stmt.bind(params as any[]);

        const rows: Array<Record<string, unknown>> = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();

        // Save database after write operations
        if (sql.trim().toUpperCase().startsWith("INSERT") ||
            sql.trim().toUpperCase().startsWith("UPDATE") ||
            sql.trim().toUpperCase().startsWith("DELETE") ||
            sql.trim().toUpperCase().startsWith("TRUNCATE")) {
          const data = db.export();
          writeFileSync(dbPath, data);
        }

        return { rows };
      },
      close: async () => {
        db.close();
      }
    };
  }

  if (config.db.client === "postgres") {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: config.db.connectionString });
    await client.connect();
    return {
      type: "postgres",
      placeholder: (index) => `$${index}`,
      query: async (sql, params) => {
        const result = await client.query(sql, params);
        return { rows: result.rows as Array<Record<string, unknown>> };
      },
      close: async () => {
        await client.end();
      }
    };
  }

  if (config.db.client === "mysql") {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection(config.db.connectionString);
    return {
      type: "mysql",
      placeholder: () => "?",
      query: async (sql, params) => {
        const [rows] = await connection.execute(sql, params as (string | number)[]);
        return { rows: rows as Array<Record<string, unknown>> };
      },
      close: async () => {
        await connection.end();
      }
    };
  }

  throw new Error(`Unsupported database client: ${config.db.client}`);
}

export function safeIdentifier(identifier: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error(`Unsafe identifier: ${identifier}`);
  }
  return identifier;
}
