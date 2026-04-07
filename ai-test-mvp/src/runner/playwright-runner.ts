import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { ProjectConfig } from "../models/project-config.js";
import type { RunnerResult, ScenarioExecutionResult } from "../models/report.js";
import type { Scenario } from "../models/scenario.js";
import { DbAssertor } from "./db-assertor.js";
import { UiExecutor } from "./ui-executor.js";

export class PlaywrightRunner {
  private readonly uiExecutor = new UiExecutor();

  private readonly dbAssertor = new DbAssertor();

  async run(input: {
    projectRoot: string;
    config: ProjectConfig;
    scenarios: Scenario[];
  }): Promise<RunnerResult> {
    await mkdir(path.join(input.projectRoot, "screenshots"), { recursive: true });
    await mkdir(path.join(input.projectRoot, "traces"), { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const results: ScenarioExecutionResult[] = [];

    try {
      for (const scenario of input.scenarios) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const consoleLogs: string[] = [];
        const networkSummary: string[] = [];
        page.on("console", (message) => consoleLogs.push(message.text()));
        page.on("response", (response) => {
          if (response.status() >= 400) {
            networkSummary.push(`${response.status()} ${response.url()}`);
          }
        });

        const startedAt = new Date().toISOString();
        let result: ScenarioExecutionResult;

        try {
          await this.uiExecutor.execute(page, scenario, input.config);
          const dbAssertions = await this.dbAssertor.assert(scenario.assertions);
          result = {
            scenarioId: scenario.id,
            status: "passed",
            startedAt,
            finishedAt: new Date().toISOString(),
            consoleLogs,
            networkSummary,
            dbAssertions
          };
        } catch (error) {
          const screenshotPath = path.join("screenshots", `${scenario.id}.png`);
          await page.screenshot({
            path: path.join(input.projectRoot, screenshotPath),
            fullPage: true
          });

          result = {
            scenarioId: scenario.id,
            status: "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            errorMessage: error instanceof Error ? error.message : String(error),
            screenshotPath,
            tracePath: undefined,
            consoleLogs,
            networkSummary,
            dbAssertions: await this.dbAssertor.assert(scenario.assertions)
          };
        } finally {
          await context.close();
        }

        results.push(result);
      }
    } finally {
      await browser.close();
    }

    return { results };
  }
}
