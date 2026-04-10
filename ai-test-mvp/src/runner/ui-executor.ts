import type { Page } from "playwright";
import type { ProjectConfig } from "../models/project-config.js";
import type { Scenario, ScenarioStep } from "../models/scenario.js";

export interface ApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export class UiExecutor {
  private apiResponses: Map<string, ApiResponse> = new Map();

  async execute(page: Page, scenario: Scenario, config: ProjectConfig): Promise<Map<string, ApiResponse>> {
    this.apiResponses.clear();
    for (const step of scenario.steps) {
      switch (step.action) {
        case "goto":
          await page.goto(new URL(step.target, config.baseUrl).toString());
          break;
        case "fill": {
          const selector = resolveSelector(step.target, config);
          if (!step.value) {
            throw new Error(`Missing fill value for target ${step.target}`);
          }
          await page.locator(selector).fill(step.value);
          break;
        }
        case "click": {
          const selector = resolveSelector(step.target, config);
          await page.locator(selector).click();
          break;
        }
        case "select": {
          const selector = resolveSelector(step.target, config);
          if (!step.value) {
            throw new Error(`Missing select value for target ${step.target}`);
          }
          await page.locator(selector).selectOption(step.value);
          break;
        }
        case "assertText": {
          await page.getByText(step.value ?? "").waitFor();
          break;
        }
        case "api.request": {
          const apiResponse = await executeApiRequest(step, config);
          this.apiResponses.set(step.target, apiResponse);
          break;
        }
      }
    }

    for (const assertion of scenario.assertions) {
      if (assertion.type !== "ui" || !assertion.value) {
        continue;
      }

      await page.getByText(assertion.value, { exact: false }).first().waitFor({
        state: "visible",
        timeout: 5_000
      });
    }

    return this.apiResponses;
  }
}

function resolveSelector(target: string, config: ProjectConfig): string {
  return config.selectors[target] ?? `[data-testid="${target}"]`;
}

async function executeApiRequest(step: ScenarioStep, config: ProjectConfig): Promise<ApiResponse> {
  const method = step.method ?? "GET";
  const url = new URL(step.target, config.baseUrl).toString();
  const headers = step.headers ?? {};
  let body: string | undefined;
  if (step.body !== undefined) {
    if (typeof step.body === "string") {
      body = step.body;
    } else {
      body = JSON.stringify(step.body);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body
  });

  let responseBody: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    responseBody = await response.json();
  } else {
    responseBody = await response.text();
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    body: responseBody,
    headers: responseHeaders
  };
}
