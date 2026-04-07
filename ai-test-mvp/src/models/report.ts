import type { Scenario } from "./scenario.js";

export interface ScenarioExecutionResult {
  scenarioId: string;
  status: "passed" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
  screenshotPath?: string;
  tracePath?: string;
  consoleLogs: string[];
  networkSummary: string[];
  dbAssertions: Array<{
    assertion: string;
    passed: boolean;
    details: string;
  }>;
}

export interface RunnerResult {
  results: ScenarioExecutionResult[];
}

export interface FailureReport {
  generatedAt: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  scenarioReports: Array<{
    scenario: Scenario;
    classification: string;
    summary: string;
    suggestedFix: string;
  }>;
}
