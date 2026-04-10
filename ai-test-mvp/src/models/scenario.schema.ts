import { z } from "zod";

/**
 * Permissive Zod schema for Scenario.
 * Supports all action types (including api.request, db.query),
 * setup steps, and optional fields.
 */

export const scenarioStepSchema = z.object({
  action: z.enum([
    "goto",
    "fill",
    "click",
    "select",
    "assertText",
    "assertVisible",
    "assertHidden",
    "wait",
    "api.request",
    "api.assert",
    "db.query",
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  // api.request / api.assert fields
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.union([z.record(z.unknown()), z.string()]).optional(),
  // assertVisible / assertHidden
  timeout: z.number().optional(),
  // generic passthrough
  extras: z.record(z.unknown()).optional(),
});

export const scenarioSetupStepSchema = z.object({
  action: z.enum(["db.insert", "db.update", "db.delete", "db.truncate"]),
  table: z.string(),
  data: z.record(z.unknown()).optional(),
  where: z.record(z.unknown()).optional(),
});

export const scenarioAssertionSchema = z.object({
  type: z.enum(["ui", "db", "api"]),
  target: z.string().optional(),
  value: z.string().optional(),
  table: z.string().optional(),
  where: z.record(z.string()).optional(),
  expect: z.record(z.string()).optional(),
  url: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  status: z.number().optional(),
  bodyContains: z.string().optional(),
});

export const scenarioSchema = z.object({
  id: z.string().min(1),
  module: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  preconditions: z.array(z.string()).default([]),
  setup: z.array(scenarioSetupStepSchema).optional(),
  steps: z.array(scenarioStepSchema),
  assertions: z.array(scenarioAssertionSchema).default([]),
  risk: z.enum(["low", "medium", "high"]).default("low"),
});

export const scenarioArraySchema = z.array(scenarioSchema);

export type ScenarioStepInput = z.infer<typeof scenarioStepSchema>;
export type ScenarioSetupStepInput = z.infer<typeof scenarioSetupStepSchema>;
export type ScenarioAssertionInput = z.infer<typeof scenarioAssertionSchema>;
export type ScenarioInput = z.infer<typeof scenarioSchema>;
