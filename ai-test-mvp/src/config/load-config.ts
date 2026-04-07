import { readFile } from "node:fs/promises";
import YAML from "js-yaml";
import { z } from "zod";
import type { ProjectConfig } from "../models/project-config.js";

const configSchema = z.object({
  baseUrl: z.string().url(),
  loginPage: z.string(),
  modules: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  criticalFlows: z.array(z.string()).default([]),
  readonlyTables: z.array(z.string()).default([]),
  forbiddenActions: z.array(z.string()).default([]),
  selectors: z.record(z.string()).default({}),
  db: z
    .object({
      client: z.enum(["postgres", "mysql"]),
      connectionString: z.string().min(1)
    })
    .optional(),
  llm: z
    .object({
      provider: z.string(),
      model: z.string()
    })
    .optional()
});

export async function loadProjectConfig(configPath: string): Promise<ProjectConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = YAML.load(raw);
  return configSchema.parse(parsed);
}
