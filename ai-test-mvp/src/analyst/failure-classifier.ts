import type { ScenarioExecutionResult } from "../models/report.js";

export function classifyFailure(result: ScenarioExecutionResult): string {
  const message = result.errorMessage?.toLowerCase() ?? "";

  if (message.includes("getbytext") || message.includes("expect") || message.includes("assert")) {
    return "assertion-failure";
  }

  if (message.includes("locator") || message.includes("waiting for selector")) {
    return "element-locator-failure";
  }

  if (message.includes("403") || message.includes("permission") || message.includes("denied")) {
    return "permission-failure";
  }

  if (result.networkSummary.some((item) => / 5\d\d | 4\d\d /.test(` ${item} `))) {
    return "backend-api-failure";
  }

  if (result.dbAssertions.some((item) => !item.passed)) {
    return "db-persistence-failure";
  }

  return "unknown-failure";
}
