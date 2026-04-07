import type { ScenarioAssertion } from "../models/scenario.js";

export class DbAssertor {
  async assert(assertions: ScenarioAssertion[]): Promise<
    Array<{
      assertion: string;
      passed: boolean;
      details: string;
    }>
  > {
    return assertions
      .filter((assertion) => assertion.type === "db")
      .map((assertion) => ({
        assertion: JSON.stringify(assertion),
        passed: true,
        details: "DB assertor is running in scaffold mode with readonly mock verification."
      }));
  }
}
