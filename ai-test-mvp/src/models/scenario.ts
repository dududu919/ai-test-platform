export type ScenarioActionType = "goto" | "fill" | "click" | "select" | "assertText";

export interface ScenarioStep {
  action: ScenarioActionType;
  target: string;
  value?: string;
}

export interface ScenarioAssertion {
  type: "ui" | "db";
  target?: string;
  value?: string;
  table?: string;
  where?: Record<string, string>;
  expect?: Record<string, string>;
}

export interface Scenario {
  id: string;
  module: string;
  priority: "high" | "medium" | "low";
  preconditions: string[];
  steps: ScenarioStep[];
  assertions: ScenarioAssertion[];
  risk: "low" | "medium" | "high";
}
