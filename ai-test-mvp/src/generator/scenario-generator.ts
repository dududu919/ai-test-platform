import type { ProjectConfig } from "../models/project-config.js";
import type { Scenario } from "../models/scenario.js";
import type { RepoModel } from "../models/model-bundle.js";
import type { DbModel } from "../models/model-bundle.js";
import type { ParsedApp, ParsedForm, ParsedPage, ValidationRule, RoleGuard, NavigationMap } from "../analyzers/repo-analyzer.js";

export class ScenarioGenerator {
  async generate(input: {
    config: ProjectConfig;
    repoModel: RepoModel;
    dbModel: DbModel;
  }): Promise<Scenario[]> {
    const parsed = (input.repoModel as RepoModel & { _parsed?: ParsedApp })._parsed;
    if (!parsed) {
      console.warn("No parsed app data found. Run analyze first.");
      return [];
    }

    const scenarios: Scenario[] = [];
    const baseUrl = input.config.baseUrl;
    const loginPage = input.config.loginPage;

    // Generate login scenarios
    scenarios.push(...this.generateLoginScenarios(baseUrl, loginPage));

    // Generate page render scenarios
    for (const page of parsed.pages) {
      scenarios.push(...this.generatePageRenderScenarios(page, baseUrl));
    }

    // Generate form validation scenarios
    for (const form of parsed.forms) {
      scenarios.push(...this.generateFormValidationScenarios(form, baseUrl));
    }

    // Generate form success scenarios (with valid data)
    for (const form of parsed.forms) {
      scenarios.push(...this.generateFormSuccessScenarios(form, baseUrl, parsed.roles));
    }

    // Generate role-based access scenarios
    for (const guard of parsed.roleGuards) {
      scenarios.push(...this.generateRoleGuardScenarios(guard, baseUrl));
    }

    // Generate navigation scenarios
    for (const nav of parsed.navigationMap) {
      scenarios.push(...this.generateNavigationScenarios(nav, baseUrl));
    }

    return this.dedupeById(scenarios);
  }

  private generateLoginScenarios(baseUrl: string, loginPage: string): Scenario[] {
    const scenarios: Scenario[] = [];

    // Empty login
    scenarios.push({
      id: "login-empty",
      module: "auth",
      priority: "high",
      preconditions: [],
      steps: [
        { action: "goto", target: loginPage, value: baseUrl + loginPage },
        { action: "click", target: "submit" },
      ],
      assertions: [
        { type: "ui", value: "用户名和密码必填" },
      ],
      risk: "low",
    });

    // Login as admin
    scenarios.push({
      id: "login-success-admin",
      module: "auth",
      priority: "high",
      preconditions: [],
      steps: [
        { action: "goto", target: loginPage, value: baseUrl + loginPage },
        { action: "fill", target: "login.username", value: "admin" },
        { action: "fill", target: "login.password", value: "password" },
        { action: "click", target: "submit" },
      ],
      assertions: [
        { type: "ui", value: "当前角色" },
      ],
      risk: "low",
    });

    // Login as viewer
    scenarios.push({
      id: "login-success-viewer",
      module: "auth",
      priority: "high",
      preconditions: [],
      steps: [
        { action: "goto", target: loginPage, value: baseUrl + loginPage },
        { action: "fill", target: "login.username", value: "viewer" },
        { action: "fill", target: "login.password", value: "password" },
        { action: "click", target: "submit" },
      ],
      assertions: [
        { type: "ui", value: "viewer" },
      ],
      risk: "low",
    });

    return scenarios;
  }

  private generatePageRenderScenarios(page: ParsedPage, baseUrl: string): Scenario[] {
    const scenarios: Scenario[] = [];

    // Skip login page - handled by login scenarios
    if (page.route === "/login") return scenarios;

    scenarios.push({
      id: `${page.pageName}-render`,
      module: page.pageName,
      priority: "medium",
      preconditions: [],
      steps: [
        { action: "goto", target: page.route, value: baseUrl + page.route },
      ],
      assertions: [
        { type: "ui", value: page.heading || page.pageName },
      ],
      risk: "low",
    });

    return scenarios;
  }

  private generateFormValidationScenarios(form: ParsedForm, baseUrl: string): Scenario[] {
    const scenarios: Scenario[] = [];

    // Submit without filling any fields
    const requiredFields = form.fields.filter(f => f.required);
    if (requiredFields.length > 0) {
      scenarios.push({
        id: `${form.name}-empty-submit`,
        module: form.pageRoute,
        priority: "high",
        preconditions: [],
        steps: [
          { action: "goto", target: form.pageRoute, value: baseUrl + form.pageRoute },
          { action: "click", target: form.buttons.find(b => b.type === "submit")?.testid || "submit" },
        ],
        assertions: [
          { type: "ui", value: "必填" },
        ],
        risk: "low",
      });
    }

    // Fill partial fields
    if (requiredFields.length >= 2) {
      const firstField = requiredFields[0];
      const fieldTarget = firstField.testid || firstField.name;
      if (!fieldTarget) return scenarios; // skip if no valid selector
      const btnTarget = form.buttons.find(b => b.type === "submit")?.testid || "submit";
      scenarios.push({
        id: `${form.name}-partial-fill`,
        module: form.pageRoute,
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: form.pageRoute, value: baseUrl + form.pageRoute },
          { action: "fill", target: fieldTarget, value: "test" },
          { action: "click", target: btnTarget },
        ],
        assertions: [
          { type: "ui", value: "必填" },
        ],
        risk: "low",
      });
    }

    return scenarios;
  }

  private generateFormSuccessScenarios(form: ParsedForm, baseUrl: string, roles: string[]): Scenario[] {
    const scenarios: Scenario[] = [];

    // Skip login form - handled by login scenarios
    if (form.name === "login") return scenarios;

    const submitButton = form.buttons.find(b => b.type === "submit");
    const formFields = form.fields.filter(f => f.name || f.testid);

    if (!submitButton || formFields.length === 0) return scenarios;

    // For each role, try to submit with valid data
    for (const role of roles) {
      const validData = this.generateValidFormData(formFields, role);

      scenarios.push({
        id: `${form.name}-success-${role}`,
        module: form.pageRoute,
        priority: "high",
        preconditions: [`login as ${role}`],
        steps: [
          { action: "goto", target: form.pageRoute, value: baseUrl + form.pageRoute },
          ...validData.map(f => ({
            action: f.type === "select" ? "select" : "fill",
            target: f.target,
            value: f.value,
          } as const)),
          { action: "click", target: submitButton.testid || "submit" },
        ],
        assertions: form.redirectOnSuccess
          ? [{ type: "ui", value: "成功" }]
          : [{ type: "ui", value: form.pageRoute }],
        risk: "medium",
      });
    }

    return scenarios;
  }

  private generateRoleGuardScenarios(guard: RoleGuard, baseUrl: string): Scenario[] {
    const scenarios: Scenario[] = [];

    // Get the target page from navigation or direct access
    const targetPage = guard.pageRoute;
    if (!targetPage) return scenarios;

    // Viewer tries to access admin page
    scenarios.push({
      id: `${this.extractPageName(targetPage)}-no-permission`,
      module: targetPage,
      priority: "high",
      preconditions: ["login as viewer"],
      steps: [
        { action: "goto", target: targetPage, value: baseUrl + targetPage },
      ],
      assertions: [
        { type: "ui", value: guard.errorMessage || "无权限" },
      ],
      risk: "medium",
    });

    return scenarios;
  }

  private generateNavigationScenarios(nav: NavigationMap, baseUrl: string): Scenario[] {
    const scenarios: Scenario[] = [];

    // Only generate navigation scenarios that aren't already covered by form submit
    if (nav.trigger === "form-submit") {
      // Already covered by form success scenarios
      return scenarios;
    }

    if (nav.trigger === "link-click" || nav.trigger === "button-click") {
      scenarios.push({
        id: `nav-${this.extractPageName(nav.from)}-to-${this.extractPageName(nav.to)}`,
        module: this.extractPageName(nav.from),
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: nav.from, value: baseUrl + nav.from },
          { action: "click", target: nav.to },
        ],
        assertions: [
          { type: "ui", value: nav.to },
        ],
        risk: "low",
      });
    }

    return scenarios;
  }

  private generateValidFormData(
    fields: Array<{ name?: string; testid?: string; type?: string; placeholder?: string }>,
    role: string
  ): Array<{ target: string; value: string; type: string }> {
    return fields.map(f => {
      const target = f.testid || f.name || "";
      const type = f.type || "text";

      // Generate realistic test data based on field name/placeholder
      let value = "test-value";
      if (target.includes("email") || f.placeholder?.includes("email")) {
        value = "test@example.com";
      } else if (target.includes("name") || f.placeholder?.includes("name")) {
        value = "Test User";
      } else if (target.includes("role") || type === "select") {
        // Parse options from placeholder (format: "option1|option2|option3")
        const options = f.placeholder?.split("|") || ["admin", "viewer"];
        value = role === "viewer" ? "viewer" : (options.includes("admin") ? "admin" : options[0]);
      }

      return { target, value, type };
    });
  }

  private extractPageName(route: string): string {
    return route.replace(/^\//, "").replace(/\//g, "-") || "index";
  }

  private dedupeById(scenarios: Scenario[]): Scenario[] {
    const seen = new Set<string>();
    return scenarios.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }
}
