import { chromium, type Browser, type Page } from "playwright";
import type { RepoModel } from "../models/model-bundle.js";

export interface SpiderAnalyzerOptions {
  baseUrl: string;
  maxDepth?: number;
  concurrency?: number;
}

interface DiscoveredInput {
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  testid?: string;
  label?: string;
}

interface DiscoveredButton {
  testid?: string;
  id?: string;
  text?: string;
  type?: string;
}

interface DiscoveredForm {
  action?: string;
  method?: string;
  inputs: DiscoveredInput[];
  buttons: DiscoveredButton[];
}

interface DiscoveredPage {
  url: string;
  title?: string;
  forms: DiscoveredForm[];
  links: string[];
}

export class SpiderAnalyzer {
  private browser: Browser | null = null;
  private visited = new Set<string>();

  async analyze(options: SpiderAnalyzerOptions): Promise<RepoModel> {
    const { baseUrl, maxDepth = 2, concurrency = 3 } = options;

    this.browser = await chromium.launch({ headless: true });
    const discoveredPages: DiscoveredPage[] = [];

    try {
      const queue: string[] = [baseUrl];
      const inProgress = new Set<string>();

      while (queue.length > 0 || inProgress.size > 0) {
        while (queue.length > 0 && inProgress.size < concurrency) {
          const url = queue.shift()!;
          if (this.visited.has(url)) continue;

          inProgress.add(url);
          this.discoverPage(url, queue, maxDepth, discoveredPages)
            .finally(() => {
              inProgress.delete(url);
            });
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      await this.browser.close();
      this.browser = null;
      this.visited.clear();
    }

    return this.convertToRepoModel(discoveredPages, baseUrl);
  }

  private async discoverPage(
    url: string,
    queue: string[],
    maxDepth: number,
    results: DiscoveredPage[]
  ): Promise<void> {
    if (!this.browser) return;

    const page = await this.browser.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      this.visited.add(url);

      const pageResult = await page.evaluate(() => {
        const forms: DiscoveredForm[] = [];
        const links: string[] = [];

        // Find all forms
        document.querySelectorAll("form").forEach((form) => {
          const inputs: DiscoveredInput[] = [];
          const buttons: DiscoveredButton[] = [];

          form.querySelectorAll("input, textarea, select").forEach((el) => {
            const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            const input: DiscoveredInput = {};

            const testid = el.getAttribute("data-testid");
            if (testid) input.testid = testid;

            const id = el.getAttribute("id");
            if (id) input.id = id;

            const name = el.getAttribute("name");
            if (name) input.name = name;

            const type = el.getAttribute("type") || inputEl.tagName.toLowerCase();
            input.type = type;

            const placeholder = el.getAttribute("placeholder");
            if (placeholder) input.placeholder = placeholder;

            const required = el.hasAttribute("required");
            input.required = required;

            // Try to find label
            const labelEl = form.querySelector(`label[for="${id}"]`) ||
              el.closest("label");
            if (labelEl) {
              input.label = labelEl.textContent?.trim() || undefined;
            }

            if (id || name || testid) {
              inputs.push(input);
            }
          });

          form.querySelectorAll("button, input[type='submit'], input[type='button']").forEach((el) => {
            const btn: DiscoveredButton = {};
            const testid = el.getAttribute("data-testid");
            if (testid) btn.testid = testid;

            const id = el.getAttribute("id");
            if (id) btn.id = id;

            const text = el.textContent?.trim() || (el as HTMLInputElement).value;
            if (text) btn.text = text;

            const type = el.getAttribute("type");
            btn.type = type || "submit";

            if (testid || id || text) {
              buttons.push(btn);
            }
          });

          if (inputs.length > 0 || buttons.length > 0) {
            forms.push({
              action: (form as HTMLFormElement).action,
              method: (form as HTMLFormElement).method,
              inputs,
              buttons
            });
          }
        });

        // Find links for navigation discovery
        document.querySelectorAll("a[href]").forEach((el) => {
          const href = el.getAttribute("href");
          if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
            links.push(href);
          }
        });

        return {
          title: document.title,
          forms,
          links
        };
      });

      results.push({
        url,
        ...pageResult
      });

      // Add new URLs to queue
      if (maxDepth > 1) {
        const baseUrlObj = new URL(url);
        for (const link of pageResult.links) {
          try {
            const linkUrl = new URL(link, baseUrlObj.href).href;
            if (linkUrl.startsWith(baseUrlObj.origin) && !this.visited.has(linkUrl)) {
              queue.push(linkUrl);
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }
    } catch {
      // Page failed to load, skip
    } finally {
      await page.close();
    }
  }

  private convertToRepoModel(pages: DiscoveredPage[], baseUrl: string): RepoModel {
    const routes: string[] = [];
    const pageModels: { name: string; route: string; sourceFile?: string; actions: string[] }[] = [];
    const formModels: { page: string; fields: string[]; validators: string[] }[] = [];

    // Extended data for ScenarioGenerator
    const parsedPages: {
      route: string;
      htmlFile: string;
      pageName: string;
      forms: {
        name: string;
        pageRoute: string;
        fields: {
          testid?: string;
          id?: string;
          name?: string;
          type?: string;
          placeholder?: string;
          required?: boolean;
          label?: string;
        }[];
        buttons: {
          testid?: string;
          id?: string;
          text?: string;
          type?: string;
        }[];
      }[];
      navLinks: { text?: string; href: string }[];
    }[] = [];

    const roles = ["admin", "viewer"];
    const businessTerms: string[] = [];

    for (const page of pages) {
      const urlObj = new URL(page.url);
      const path = urlObj.pathname || "/";
      const pageName = this.extractPageName(path);

      routes.push(path);

      // Page model
      const actions: string[] = [];
      for (const form of page.forms) {
        for (const btn of form.buttons) {
          if (btn.text || btn.testid) {
            actions.push(btn.text || btn.testid || "submit");
          }
        }
      }

      pageModels.push({
        name: pageName,
        route: path,
        actions
      });

      // Form model
      for (const form of page.forms) {
        const fields = form.inputs
          .map((f) => f.testid || f.id || f.name || "")
          .filter(Boolean);
        const validators = form.inputs
          .filter((f) => f.required)
          .map((f) => `${f.name || f.id}: required`);

        formModels.push({
          page: path,
          fields,
          validators
        });

        // Extract business terms
        for (const input of form.inputs) {
          if (input.name) businessTerms.push(input.name.toLowerCase());
          if (input.label) {
            const words = input.label.match(/\b\w{3,}\b/g) || [];
            words.forEach((w) => businessTerms.push(w.toLowerCase()));
          }
        }
      }

      // Parsed page for ScenarioGenerator
      const parsedPageForms = page.forms.map((form, idx) => ({
        name: `form-${pageName}-${idx}`,
        pageRoute: path,
        fields: form.inputs.map((f) => ({
          testid: f.testid,
          id: f.id,
          name: f.name,
          type: f.type,
          placeholder: f.placeholder,
          required: f.required,
          label: f.label
        })),
        buttons: form.buttons.map((b) => ({
          testid: b.testid,
          id: b.id,
          text: b.text,
          type: b.type
        }))
      }));

      parsedPages.push({
        route: path,
        htmlFile: `spider:${page.url}`,
        pageName,
        forms: parsedPageForms,
        navLinks: page.links.map((href) => ({
          href,
          text: undefined
        }))
      });
    }

    return {
      pages: pageModels,
      forms: formModels,
      routes,
      apis: [],
      roles,
      existingTests: [],
      businessTerms: [...new Set(businessTerms)],
      // Extended data for ScenarioGenerator
      _parsed: {
        pages: parsedPages,
        forms: parsedPages.flatMap((p) => p.forms),
        navigationMap: this.extractNavigationMap(pages),
        validations: [],
        roleGuards: [],
        roles,
        businessTerms: [...new Set(businessTerms)]
      }
    };
  }

  private extractNavigationMap(pages: DiscoveredPage[]): {
    from: string;
    to: string;
    trigger: "form-submit" | "link-click" | "button-click" | "redirect";
  }[] {
    const maps: { from: string; to: string; trigger: "form-submit" | "link-click" | "button-click" | "redirect" }[] = [];

    for (const page of pages) {
      const urlObj = new URL(page.url);
      const from = urlObj.pathname || "/";

      // Link navigation
      for (const link of page.links) {
        try {
          const toUrl = new URL(link, urlObj.href);
          const to = toUrl.pathname || "/";
          maps.push({ from, to, trigger: "link-click" });
        } catch {
          // Invalid URL
        }
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return maps.filter((m) => {
      const key = `${m.from}|${m.to}|${m.trigger}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private extractPageName(path: string): string {
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "index";
  }
}