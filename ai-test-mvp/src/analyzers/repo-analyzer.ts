import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RepoModel } from "../models/model-bundle.js";

export interface ParsedInput {
  testid?: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  label?: string;
  selector?: string;
}

export interface ParsedButton {
  testid?: string;
  id?: string;
  text?: string;
  type?: string;
  disabled?: boolean;
  ariaDisabled?: boolean;
  href?: string;
  selector?: string;
}

export interface ParsedForm {
  name: string;
  pageRoute: string;
  testid?: string;
  fields: ParsedInput[];
  buttons: ParsedButton[];
  submitAction?: string;
  redirectOnSuccess?: string;
}

export interface ParsedPage {
  route: string;
  htmlFile: string;
  jsFile?: string;
  pageName: string;
  forms: ParsedForm[];
  navLinks: Array<{ text?: string; href: string; testid?: string }>;
  heading?: string;
  roleGuard?: string;
}

export interface ValidationRule {
  field: string;
  testid?: string;
  rule: string;
  errorMessage?: string;
}

export interface RoleGuard {
  pageRoute: string;
  requiredRole: string;
  errorMessage?: string;
}

export interface NavigationMap {
  from: string;
  to: string;
  trigger: "form-submit" | "link-click" | "button-click" | "redirect";
  formName?: string;
}

export interface ParsedApp {
  pages: ParsedPage[];
  forms: ParsedForm[];
  navigationMap: NavigationMap[];
  validations: ValidationRule[];
  roleGuards: RoleGuard[];
  roles: string[];
  businessTerms: string[];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export class RepoAnalyzer {
  async analyze(projectRoot: string): Promise<RepoModel> {
    const files = await listFiles(projectRoot);
    const appFiles = files.filter(
      (file) =>
        !file.includes(`${path.sep}node_modules${path.sep}`) &&
        !file.includes(`${path.sep}ai-test-mvp${path.sep}`)
    );

    const htmlFiles = appFiles.filter((f) => f.endsWith(".html"));
    const jsFiles = appFiles.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

    const jsContentMap = await buildJsContentMap(jsFiles);
    const parsedApp = await parseApp(htmlFiles, jsContentMap, projectRoot);

    const routes = parsedApp.pages.map((p) => p.route);
    const roles = inferRoles(parsedApp);
    const businessTerms = collectBusinessTerms(parsedApp);

    return {
      pages: parsedApp.pages.map(toPageModel),
      forms: parsedApp.forms.map(toFormModel),
      routes,
      apis: [], // static HTML demo app has no REST APIs
      roles,
      existingTests: [], // none in demo-app
      businessTerms,
      // extended fields (available via RepoModel augmentation)
      _parsed: parsedApp,
    };
  }
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

function parseHtml(htmlContent: string, filePath: string, projectRoot: string): {
  page: ParsedPage;
  forms: ParsedForm[];
} {
  const normalized = htmlContent.replace(/\r\n/g, "\n");

  const route = htmlPathToRoute(filePath, projectRoot);
  const pageName = path.basename(filePath, ".html");

  // Page-level role guard: aria-disabled on buttons suggests RBAC
  const pageRoleGuards = parseRoleGuards(normalized);

  // Navigation links
  const navLinks = parseNavLinks(normalized);

  // Heading
  const headingMatch = normalized.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const heading = headingMatch?.[1]?.trim();

  // Forms
  const formBlocks = normalized.match(/<form[^>]*>[\s\S]*?<\/form>/gi) ?? [];
  const forms: ParsedForm[] = formBlocks.map((block) => parseForm(block, route));

  const page: ParsedPage = {
    route,
    htmlFile: path.relative(projectRoot, filePath),
    pageName,
    forms,
    navLinks,
    heading,
    roleGuard: pageRoleGuards[route],
  };

  return { page, forms };
}

function parseForm(htmlBlock: string, pageRoute: string): ParsedForm {
  const nameMatch = htmlBlock.match(/data-form=["']([^"']+)["']/);
  const name = nameMatch?.[1] ?? "unknown";

  const fields: ParsedInput[] = [];
  const buttons: ParsedButton[] = [];

  // All <input>, <select>, <textarea> inside the form
  const inputBlocks = htmlBlock.match(/<input[\s\S]*?>/gi) ?? [];
  for (const block of inputBlocks) {
    const field = parseInput(block);
    if (field) fields.push({ ...field, selector: buildInputSelector(field) });
  }

  const selectBlocks = htmlBlock.match(/<select[\s\S]*?<\/select>/gi) ?? [];
  for (const block of selectBlocks) {
    const field = parseSelect(block);
    if (field) fields.push({ ...field, selector: buildInputSelector(field) });
  }

  // Buttons (including <a class="button-link">)
  const buttonBlocks = htmlBlock.match(/<button[\s\S]*?<\/button>/gi) ?? [];
  for (const block of buttonBlocks) {
    const btn = parseButton(block);
    if (btn) buttons.push({ ...btn, selector: buildButtonSelector(btn) });
  }

  const linkBlocks = htmlBlock.match(/<a[^>]*class="[^"]*button[^"]*"[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  for (const block of linkBlocks) {
    const hrefMatch = block.match(/href=["']([^"']+)["']/);
    const textMatch = block.match(/>([^<]+)</);
    const testidMatch = block.match(/data-testid=["']([^"']+)["']/);
    if (hrefMatch) {
      buttons.push({
        text: textMatch?.[1]?.trim(),
        href: hrefMatch[1],
        testid: testidMatch?.[1],
        selector: buildLinkSelector(hrefMatch[1]),
      });
    }
  }

  // Helper text that hints at validation
  const helperMatch = htmlBlock.match(/<p class="helper">([^<]+)<\/p>/i);

  return {
    name,
    pageRoute,
    testid: htmlBlock.match(/data-form=["']([^"']+)["']/)?.[1],
    fields,
    buttons,
    redirectOnSuccess: inferRedirectFromForm(htmlBlock),
  };
}

function parseInput(block: string): ParsedInput | null {
  const tag = block.match(/<input/i)?.[0];
  if (!tag) return null;

  const testidMatch = block.match(/data-testid=["']([^"']+)["']/);
  const idMatch = block.match(/id=["']([^"']+)["']/);
  const nameMatch = block.match(/name=["']([^"']+)["']/);
  const typeMatch = block.match(/type=["']([^"']+)["']/);
  const placeholderMatch = block.match(/placeholder=["']([^"']+)["']/);
  const requiredMatch = block.match(/required/i);
  const minLengthMatch = block.match(/minlength=["'](\d+)["']/i);
  const maxLengthMatch = block.match(/maxlength=["'](\d+)["']/i);
  const patternMatch = block.match(/pattern=["']([^"']+)["']/);
  const labelMatch = block.match(/<label[^>]*>([^<]+)<\/label>/i);

  return {
    testid: testidMatch?.[1],
    id: idMatch?.[1],
    name: nameMatch?.[1],
    type: typeMatch?.[1] ?? "text",
    placeholder: placeholderMatch?.[1],
    required: !!requiredMatch,
    minLength: minLengthMatch ? parseInt(minLengthMatch[1]) : undefined,
    maxLength: maxLengthMatch ? parseInt(maxLengthMatch[1]) : undefined,
    pattern: patternMatch?.[1],
    label: labelMatch?.[1]?.trim(),
  };
}

function parseSelect(block: string): ParsedInput | null {
  const testidMatch = block.match(/data-testid=["']([^"']+)["']/);
  const idMatch = block.match(/id=["']([^"']+)["']/);
  const nameMatch = block.match(/name=["']([^"']+)["']/);
  const labelMatch = block.match(/<label[^>]*>([^<]+)<\/label>/i);
  const requiredMatch = block.match(/required/i);

  if (!testidMatch && !idMatch && !nameMatch) return null;

  const options = (block.match(/<option[^>]*value=["']([^"']+)["']/gi) ?? []).map((o) =>
    o.match(/value=["']([^"']+)["']/)?.[1]
  );

  return {
    testid: testidMatch?.[1],
    id: idMatch?.[1],
    name: nameMatch?.[1],
    type: "select",
    required: !!requiredMatch,
    label: labelMatch?.[1]?.trim(),
    // embed options in placeholder as a hint
    placeholder: options.filter(Boolean).join("|"),
  };
}

function parseButton(block: string): ParsedButton | null {
  const testidMatch = block.match(/data-testid=["']([^"']+)["']/);
  const idMatch = block.match(/id=["']([^"']+)["']/);
  const typeMatch = block.match(/type=["']([^"']+)["']/);
  const textMatch = block.match(/>([^<]+)</);
  const disabledMatch = block.match(/disabled/i);
  const ariaDisabledMatch = block.match(/aria-disabled=["']true["']/i);
  const hrefMatch = block.match(/href=["']([^"']+)["']/);

  const text = textMatch?.[1]?.trim();
  if (!text && !testidMatch && !idMatch) return null;

  return {
    testid: testidMatch?.[1],
    id: idMatch?.[1],
    text,
    type: typeMatch?.[1] ?? "submit",
    disabled: !!disabledMatch,
    ariaDisabled: !!ariaDisabledMatch,
    href: hrefMatch?.[1],
  };
}

function parseNavLinks(html: string): Array<{ text?: string; href: string; testid?: string }> {
  const links: Array<{ text?: string; href: string; testid?: string }> = [];
  const anchorBlocks = html.match(/<a[\s\S]*?<\/a>/gi) ?? [];
  for (const block of anchorBlocks) {
    const hrefMatch = block.match(/href=["']([^"']+)["']/);
    if (!hrefMatch) continue;
    const textMatch = block.match(/>([^<]+)</);
    const testidMatch = block.match(/data-testid=["']([^"']+)["']/);
    links.push({
      text: textMatch?.[1]?.trim(),
      href: hrefMatch[1],
      testid: testidMatch?.[1],
    });
  }
  return links;
}

function parseRoleGuards(html: string): Record<string, string> {
  const guards: Record<string, string> = {};
  const roleChipMatch = html.match(/data-testid="current-role"[^>]*>([^<]+)/i);
  if (roleChipMatch) {
    const roleMatch = roleChipMatch[1].match(/\b(admin|viewer|editor|guest|operator)\b/i);
    if (roleMatch) guards[html.match(/data-page=["']([^"']+)["']/)?.[1] ?? ""] = roleMatch[1].toLowerCase();
  }
  return guards;
}

function inferRedirectFromForm(htmlBlock: string): string | undefined {
  // Look for helper text like "提交后会跳转到 /users"
  const hintMatch = htmlBlock.match(/跳转到\s+(\/[^\s<"']+)/);
  if (hintMatch) return hintMatch[1];

  // Look for <a href="/users"> 返回列表</a> near the form
  const backLink = htmlBlock.match(/href=["']([^"']+)["'][^>]*>返回/);
  if (backLink) return backLink[1];

  return undefined;
}

function buildInputSelector(field: ParsedInput): string {
  if (field.testid) return `[data-testid="${field.testid}"]`;
  if (field.id) return `#${field.id}`;
  if (field.name) return `[name="${field.name}"]`;
  return field.label ? `text="${field.label}"` : "input";
}

function buildButtonSelector(btn: ParsedButton): string {
  if (btn.testid) return `[data-testid="${btn.testid}"]`;
  if (btn.id) return `#${btn.id}`;
  if (btn.href) return `a[href="${btn.href}"]`;
  if (btn.text) return `button[type="${btn.type}"] >> text="${btn.text}"`;
  return "button";
}

function buildLinkSelector(href: string): string {
  return `a[href="${href}"]`;
}

// ─── JS Parsing ───────────────────────────────────────────────────────────────

function parseJsForValidations(
  jsContent: string,
  forms: ParsedForm[]
): ValidationRule[] {
  const rules: ValidationRule[] = [];

  for (const form of forms) {
    // Match: if (!fieldName || !fieldName2) { setMessage(...) }
    const ifNotPattern = /if\s*\(\s*!(\w+)\s*\|\|\s*!(\w+)\s*\)\s*\{[\s\S]*?setMessage\([^,]+,\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = ifNotPattern.exec(jsContent)) !== null) {
      for (const fieldName of [m[1], m[2]]) {
        const field = form.fields.find(
          (f) => f.name === fieldName || f.testid === fieldName
        );
        if (field) {
          rules.push({
            field: fieldName,
            testid: field.testid,
            rule: "required",
            errorMessage: m[3],
          });
        }
      }
    }

    // Match: if (!fieldName) { setMessage(...) }
    const ifSingleNot = /if\s*\(\s*!(\w+)\s*\)\s*\{[\s\S]*?setMessage\([^,]+,\s*["']([^"']+)["']/g;
    while ((m = ifSingleNot.exec(jsContent)) !== null) {
      const fieldName = m[1];
      if (!form.fields.find((f) => f.name === fieldName || f.testid === fieldName)) continue;
      // Avoid double-adding the same rule
      if (rules.some((r) => r.field === fieldName && r.rule === "required")) continue;
      rules.push({
        field: fieldName,
        testid: form.fields.find(
          (f) => f.name === fieldName || f.testid === fieldName
        )?.testid,
        rule: "required",
        errorMessage: m[2],
      });
    }
  }

  return rules;
}

function parseJsForNavigation(
  jsContent: string,
  forms: ParsedForm[]
): NavigationMap[] {
  const maps: NavigationMap[] = [];

  for (const form of forms) {
    // window.location.href = "/path"
    const redirectMatch = jsContent.match(
      new RegExp(`window\\.location\\.href\\s*=\\s*["']([^"']+)["']`, "g")
    );
    if (redirectMatch) {
      for (const match of redirectMatch) {
        const urlMatch = match.match(/=["']([^"']+)["']/);
        if (urlMatch?.[1]) {
          maps.push({
            from: form.pageRoute,
            to: urlMatch[1],
            trigger: "form-submit",
            formName: form.name,
          });
        }
      }
    }

    // window.location.href = "/path" in a click handler
    const clickRedirect = jsContent.matchAll(
      /addEventListener\(["']click["'][\s\S]*?window\.location\.href\s*=\s*["']([^"']+)["']/gi
    );
    for (const match of clickRedirect) {
      maps.push({
        from: form.pageRoute,
        to: match[1],
        trigger: "button-click",
      });
    }
  }

  return maps;
}

function parseJsForRoleGuards(
  jsContent: string,
  pages: ParsedPage[]
): RoleGuard[] {
  const guards: RoleGuard[] = [];

  // Match: if (currentUser?.role !== "admin") { ...setMessage(..., "无权限...") }
  const guardPattern =
    /if\s*\(\s*\w+\?\.role\s*!==\s*["']([^"']+)["']\s*\)\s*\{[\s\S]*?setMessage\([^,]+,\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = guardPattern.exec(jsContent)) !== null) {
    const page = pages.find((p) =>
      jsContent.includes(`page === "${p.pageName}"`)
    );
    guards.push({
      pageRoute: page?.route ?? "",
      requiredRole: m[1],
      errorMessage: m[2],
    });
  }

  return guards;
}

async function parseApp(
  htmlFiles: string[],
  jsContentMap: Map<string, string>,
  projectRoot: string
): Promise<ParsedApp> {
  const allPages: ParsedPage[] = [];
  const allForms: ParsedForm[] = [];
  const navigationMap: NavigationMap[] = [];
  const validations: ValidationRule[] = [];
  const roleGuards: RoleGuard[] = [];

  for (const htmlFile of htmlFiles) {
    const raw = await safeRead(htmlFile);
    if (!raw) continue;

    const { page, forms } = parseHtml(raw, htmlFile, projectRoot);
    allPages.push(page);
    allForms.push(...forms);
  }

  // Parse each JS file against the forms found on matching pages
  for (const [jsFile, jsContent] of jsContentMap) {
    const pageMatch = jsContent.match(/page === ["']([^"']+)["']/);
    const pageName = pageMatch?.[1];

    // Find pages that this JS mounts
    const relevantPages = allPages.filter(
      (p) => p.pageName === pageName || jsFile.includes(p.htmlFile.replace(".html", ""))
    );

    for (const page of relevantPages) {
      const pageValidations = parseJsForValidations(jsContent, page.forms);
      validations.push(...pageValidations);

      const pageNavigation = parseJsForNavigation(jsContent, page.forms);
      navigationMap.push(...pageNavigation);

      const pageGuards = parseJsForRoleGuards(jsContent, allPages);
      roleGuards.push(...pageGuards);
    }
  }

  // Collect unique roles from JS content
  const allJsContent = [...jsContentMap.values()].join("\n");
  const roleMatches = allJsContent.match(/\b(admin|viewer|editor|guest|operator)\b/gi) ?? [];
  const roles = [...new Set(roleMatches.map((r) => r.toLowerCase()))];

  return {
    pages: allPages,
    forms: allForms,
    navigationMap: deduplicateNavigation(navigationMap),
    validations,
    roleGuards: deduplicateRoleGuards(roleGuards),
    roles,
    businessTerms: [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deduplicateNavigation(maps: NavigationMap[]): NavigationMap[] {
  const seen = new Set<string>();
  return maps.filter((m) => {
    const key = `${m.from}|${m.to}|${m.trigger}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateRoleGuards(guards: RoleGuard[]): RoleGuard[] {
  const seen = new Set<string>();
  return guards.filter((g) => {
    const key = `${g.pageRoute}|${g.requiredRole}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferRoles(parsed: ParsedApp): string[] {
  const roles = new Set<string>(parsed.roles);
  for (const guard of parsed.roleGuards) {
    roles.add(guard.requiredRole);
  }
  return [...roles];
}

function collectBusinessTerms(parsed: ParsedApp): string[] {
  const terms = new Set<string>();
  for (const page of parsed.pages) {
    if (page.heading) {
      const words = page.heading.match(/\b\w{3,}\b/g) ?? [];
      words.forEach((w) => terms.add(w.toLowerCase()));
    }
    for (const form of page.forms) {
      for (const field of form.fields) {
        if (field.name) terms.add(field.name.toLowerCase());
        if (field.label) {
          const words = field.label.match(/\b\w{3,}\b/g) ?? [];
          words.forEach((w) => terms.add(w.toLowerCase()));
        }
      }
    }
  }
  return [...terms];
}

function htmlPathToRoute(filePath: string, projectRoot: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(projectRoot.replace(/\\/g, "/"), "");
  const name = path.basename(filePath, ".html");

  const routeMap: Record<string, string> = {
    "login": "/login",
    "index": "/",
    "users": "/users",
    "user-create": "/users/new",
  };

  return routeMap[name] ?? `/${name}`;
}

function toPageModel(page: ParsedPage): {
  name: string;
  route: string;
  sourceFile?: string;
  actions: string[];
} {
  return {
    name: page.pageName,
    route: page.route,
    sourceFile: page.htmlFile,
    actions: page.forms.flatMap((f) =>
      f.buttons.filter((b) => b.type === "submit" || b.href).map((b) => b.text ?? b.testid ?? "submit")
    ),
  };
}

function toFormModel(form: ParsedForm): {
  page: string;
  fields: string[];
  validators: string[];
} {
  return {
    page: form.pageRoute,
    fields: form.fields.map((f) => f.testid ?? f.name ?? f.id ?? "unknown"),
    validators: form.fields
      .filter((f) => f.required)
      .map((f) => `${f.name ?? f.testid}: required`),
  };
}

async function listFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
  } catch {
    return [];
  }
}

async function safeRead(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function buildJsContentMap(
  jsFiles: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    jsFiles.map(async (file) => {
      const content = await safeRead(file);
      map.set(file, content);
    })
  );
  return map;
}

// Extend RepoModel with the parsed data (avoid breaking existing consumers)
declare module "../models/model-bundle.js" {
  interface RepoModel {
    _parsed?: ParsedApp;
  }
}
