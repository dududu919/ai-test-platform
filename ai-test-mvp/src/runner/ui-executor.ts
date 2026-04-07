import type { Page } from "playwright";
import type { ProjectConfig } from "../models/project-config.js";
import type { Scenario } from "../models/scenario.js";

export class UiExecutor {
  async execute(page: Page, scenario: Scenario, config: ProjectConfig): Promise<void> {
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
  }
}

function resolveSelector(target: string, config: ProjectConfig): string {
  return config.selectors[target] ?? `[data-testid="${target}"]`;
}
