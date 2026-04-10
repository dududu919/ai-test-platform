export type ScenarioActionType =
  | "goto"
  | "fill"
  | "click"
  | "select"
  | "assertText"
  | "api.request";

export interface ScenarioStep {
  action: ScenarioActionType;
  target: string;
  value?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: Record<string, unknown> | string;
}

export interface ScenarioAssertion {
  type: "ui" | "db" | "api";
  target?: string;
  value?: string;
  table?: string;
  where?: Record<string, string>;
  expect?: Record<string, string>;
}

export interface ScenarioSetupStep {
  action: "db.insert" | "db.update" | "db.delete" | "db.truncate";
  table: string;
  data?: Record<string, unknown>;
  where?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  module: string;
  priority: "high" | "medium" | "low";
  preconditions: string[];
  setup?: ScenarioSetupStep[];
  steps: ScenarioStep[];
  assertions: ScenarioAssertion[];
  risk: "low" | "medium" | "high";
}
