import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { ProjectConfig } from "../models/project-config.js";
import type { RunnerResult, ScenarioExecutionResult } from "../models/report.js";
import type { Scenario } from "../models/scenario.js";
import { DbAssertor } from "./db-assertor.js";
import { openDbClient, safeIdentifier } from "./db-client.js";
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
    const concurrency = 5;

    try {
      for (let i = 0; i < input.scenarios.length; i += concurrency) {
        const batch = input.scenarios.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(scenario => this.runScenario(scenario, browser, input))
        );
        results.push(...batchResults);
      }
    } finally {
      await browser.close();
    }

    return { results };
  }

  private async runScenario(
    scenario: Scenario,
    browser: any,
    input: { projectRoot: string; config: ProjectConfig }
  ): Promise<ScenarioExecutionResult> {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(5000);

    const consoleLogs: string[] = [];
    const networkSummary: string[] = [];
    page.on("console", (message: { text: () => string }) => consoleLogs.push(message.text()));
    page.on("response", (response: { status: () => number; url: () => string }) => {
      if (response.status() >= 400) {
        networkSummary.push(`${response.status()} ${response.url()}`);
      }
    });

    const startedAt = new Date().toISOString();
    let result: ScenarioExecutionResult;

    try {
      await executeSetupSteps(scenario, input.config);
      const apiResponses = await this.uiExecutor.execute(page, scenario, input.config);

      // Validate API assertions
      for (const assertion of scenario.assertions) {
        if (assertion.type === "api") {
          const apiResponse = apiResponses.get(assertion.target || "");
          if (!apiResponse) {
            throw new Error(`No API response found for target: ${assertion.target}`);
          }

          // Check status code
          if (assertion.expect?.status) {
            const expectedStatus = parseInt(assertion.expect.status);
            if (apiResponse.status !== expectedStatus) {
              throw new Error(`API status mismatch: expected ${expectedStatus}, got ${apiResponse.status}`);
            }
          }

          // Check response body fields
          if (assertion.expect && typeof apiResponse.body === "object" && apiResponse.body !== null) {
            for (const [key, value] of Object.entries(assertion.expect)) {
              if (key === "status") continue;
              const actualValue = (apiResponse.body as Record<string, unknown>)[key];
              if (String(actualValue) !== String(value)) {
                throw new Error(`API body mismatch: ${key} expected ${value}, got ${actualValue}`);
              }
            }
          }
        }
      }

      const dbAssertions = await this.dbAssertor.assert(scenario.assertions, input.config);

      // Check if any DB assertions failed
      const failedDbAssertions = dbAssertions.filter(a => !a.passed);
      if (failedDbAssertions.length > 0) {
        throw new Error(`DB assertions failed: ${failedDbAssertions.map(a => a.details).join(", ")}`);
      }

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
        dbAssertions: await this.dbAssertor.assert(scenario.assertions, input.config)
      };
    } finally {
      await context.close();
    }

    return result;
  }
}

async function executeSetupSteps(scenario: Scenario, config: ProjectConfig): Promise<void> {
  if (!scenario.setup || scenario.setup.length === 0) {
    return;
  }

  const client = await openDbClient(config);
  try {
    for (const step of scenario.setup) {
      const table = safeIdentifier(step.table);
      switch (step.action) {
        case "db.insert": {
          if (!step.data || Object.keys(step.data).length === 0) {
            throw new Error(`db.insert requires data for table ${table}`);
          }
          const keys = Object.keys(step.data);
          const columns = keys.map((key) => safeIdentifier(key)).join(", ");
          const placeholders = keys.map((_, index) => client.placeholder(index + 1)).join(", ");
          const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
          const params = keys.map((key) => step.data?.[key]);
          await client.query(sql, params);
          break;
        }
        case "db.update": {
          if (!step.data || Object.keys(step.data).length === 0) {
            throw new Error(`db.update requires data for table ${table}`);
          }
          if (!step.where || Object.keys(step.where).length === 0) {
            throw new Error(`db.update requires where clause for table ${table}`);
          }
          const dataKeys = Object.keys(step.data);
          const whereKeys = Object.keys(step.where);
          const setClause = dataKeys
            .map((key, index) => `${safeIdentifier(key)} = ${client.placeholder(index + 1)}`)
            .join(", ");
          const whereClause = whereKeys
            .map(
              (key, index) =>
                `${safeIdentifier(key)} = ${client.placeholder(index + 1 + dataKeys.length)}`
            )
            .join(" AND ");
          const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
          const params = [
            ...dataKeys.map((key) => step.data?.[key]),
            ...whereKeys.map((key) => step.where?.[key])
          ];
          await client.query(sql, params);
          break;
        }
        case "db.delete": {
          if (!step.where || Object.keys(step.where).length === 0) {
            throw new Error(`db.delete requires where clause for table ${table}`);
          }
          const whereKeys = Object.keys(step.where);
          const whereClause = whereKeys
            .map((key, index) => `${safeIdentifier(key)} = ${client.placeholder(index + 1)}`)
            .join(" AND ");
          const sql = `DELETE FROM ${table} WHERE ${whereClause}`;
          const params = whereKeys.map((key) => step.where?.[key]);
          await client.query(sql, params);
          break;
        }
        case "db.truncate": {
          // SQLite doesn't support TRUNCATE, use DELETE instead
          const sql = `DELETE FROM ${table}`;
          await client.query(sql, []);
          break;
        }
      }
    }
  } finally {
    await client.close();
  }
}
