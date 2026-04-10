import { createServer } from "node:http";
import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const workspaceRoot = path.resolve(__dirname, "..");
const aiTestRoot = path.join(workspaceRoot, "ai-test-mvp");
const reportsDir = path.join(aiTestRoot, "reports");
const scenariosDir = path.join(aiTestRoot, "scenarios", "generated");
const scenariosPoolDir = path.join(aiTestRoot, "scenarios_pool");
const port = 3200;

let runState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  lastExitCode: null,
  log: ""
};

const server = createServer(async (req, res) => {
  const url = req.url ? new URL(req.url, `http://${req.headers.host}`) : null;
  const pathname = url?.pathname ?? "/";

  if (req.method === "GET" && pathname === "/") {
    return serveFile(res, path.join(publicDir, "index.html"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && pathname === "/styles.css") {
    return serveFile(res, path.join(publicDir, "styles.css"), "text/css; charset=utf-8");
  }

  if (req.method === "GET" && pathname === "/app.js") {
    return serveFile(res, path.join(publicDir, "app.js"), "text/javascript; charset=utf-8");
  }

  if (req.method === "GET" && pathname === "/api/status") {
    return sendJson(res, await buildStatusPayload());
  }

  if (req.method === "POST" && pathname === "/api/run") {
    return triggerPipeline(res);
  }

  if (req.method === "GET" && pathname === "/api/report") {
    return sendJson(res, await readJsonFile(path.join(reportsDir, "latest-report.json")));
  }

  if (req.method === "GET" && pathname === "/api/scenarios") {
    return sendJson(
      res,
      await readJsonFile(path.join(scenariosPoolDir, "scenarios.json")).catch(() => [])
    );
  }

  if (req.method === "GET" && pathname === "/report/latest") {
    return serveFile(
      res,
      path.join(reportsDir, "latest-report.html"),
      "text/html; charset=utf-8"
    );
  }

  if (req.method === "POST" && pathname === "/api/spider") {
    return handleSpider(req, res);
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Platform console running at http://127.0.0.1:${port}`);
});

async function serveFile(res, filePath, contentType) {
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function buildStatusPayload() {
  const reportExists = await exists(path.join(reportsDir, "latest-report.html"));
  const scenariosExist = await exists(path.join(scenariosDir, "scenarios.json"));
  const demoReachable = await canReachDemo();

  return {
    runState,
    links: {
      demoApp: "http://127.0.0.1:3000/login",
      report: reportExists ? "/report/latest" : null
    },
    artifacts: {
      reportExists,
      scenariosExist
    },
    demoReachable
  };
}

function triggerPipeline(res) {
  if (runState.status === "running") {
    return sendJson(res, { error: "Pipeline already running." }, 409);
  }

  runState = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastExitCode: null,
    log: ""
  };

  const child =
    process.platform === "win32"
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm run pipeline"], {
          cwd: aiTestRoot,
          windowsHide: true
        })
      : spawn("npm", ["run", "pipeline"], {
          cwd: aiTestRoot
        });

  child.stdout.on("data", (chunk) => {
    runState.log += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    runState.log += chunk.toString();
  });

  child.on("close", (code) => {
    runState = {
      ...runState,
      status: code === 0 ? "passed" : "failed",
      finishedAt: new Date().toISOString(),
      lastExitCode: code
    };
  });

  return sendJson(res, { ok: true, message: "Pipeline started." }, 202);
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function canReachDemo() {
  try {
    const response = await fetch("http://127.0.0.1:3000/login");
    return response.ok;
  } catch {
    return false;
  }
}

async function handleSpider(req, res) {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
  }

  const { url } = JSON.parse(body);
  if (!url) {
    return sendJson(res, { error: "URL is required" }, 400);
  }

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

    const discovered = await page.evaluate(() => {
      const forms = [];
      document.querySelectorAll("form").forEach((form) => {
        const inputs = [];
        const buttons = [];

        form.querySelectorAll("input, textarea, select").forEach((el) => {
          const input = {
            testid: el.getAttribute("data-testid"),
            id: el.getAttribute("id"),
            name: el.getAttribute("name"),
            type: el.getAttribute("type") || el.tagName.toLowerCase(),
            required: el.hasAttribute("required")
          };
          if (input.id || input.name || input.testid) inputs.push(input);
        });

        form.querySelectorAll("button, input[type='submit']").forEach((el) => {
          const btn = {
            testid: el.getAttribute("data-testid"),
            id: el.getAttribute("id"),
            text: el.textContent?.trim() || el.value,
            type: el.getAttribute("type") || "submit"
          };
          if (btn.testid || btn.id || btn.text) buttons.push(btn);
        });

        if (inputs.length > 0 || buttons.length > 0) {
          forms.push({ inputs, buttons });
        }
      });

      return { forms };
    });

    await browser.close();

    const scenarios = generateScenarios(url, discovered);
    await mkdir(scenariosPoolDir, { recursive: true });
    await writeFile(
      path.join(scenariosPoolDir, "scenarios.json"),
      JSON.stringify(scenarios, null, 2)
    );

    return sendJson(res, { ok: true, scenarios });
  } catch (err) {
    return sendJson(res, { error: err.message }, 500);
  }
}

function generateScenarios(baseUrl, discovered) {
  const scenarios = [];
  let id = 1;

  for (const form of discovered.forms) {
    const submitBtn = form.buttons.find(b => b.type === "submit") || form.buttons[0];
    const btnTarget = submitBtn?.testid || submitBtn?.id || "submit";
    const usernameField = form.inputs.find(i => i.testid === "login.username" || i.name === "username");
    const passwordField = form.inputs.find(i => i.testid === "login.password" || i.name === "password");

    if (!usernameField || !passwordField) continue;

    const userTarget = usernameField.testid || usernameField.name || usernameField.id;
    const passTarget = passwordField.testid || passwordField.name || passwordField.id;

    // 1. Empty form submission
    scenarios.push({
      id: `empty-submit-${id++}`,
      module: "form-validation",
      priority: "high",
      preconditions: [],
      steps: [
        { action: "goto", target: "/", value: baseUrl },
        { action: "click", target: btnTarget }
      ],
      assertions: [{ type: "ui", value: "必填" }],
      risk: "low"
    });

    // 2. SQL Injection - 10 variants for username
    const sqlPayloads = [
      "' OR '1'='1",
      "admin'--",
      "' OR 1=1--",
      "admin' OR '1'='1'--",
      "' UNION SELECT NULL--",
      "1' AND '1'='1",
      "' OR 'a'='a",
      "admin' #",
      "' OR ''='",
      "1' OR '1'='1' /*"
    ];

    sqlPayloads.forEach((payload, idx) => {
      scenarios.push({
        id: `sql-injection-username-${idx + 1}-${id++}`,
        module: "security-sql",
        priority: "critical",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: payload },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "错误" }],
        risk: "critical"
      });
    });

    // 3. SQL Injection - 10 variants for password
    sqlPayloads.forEach((payload, idx) => {
      scenarios.push({
        id: `sql-injection-password-${idx + 1}-${id++}`,
        module: "security-sql",
        priority: "critical",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: "admin" },
          { action: "fill", target: passTarget, value: payload },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "错误" }],
        risk: "critical"
      });
    });

    // 4. XSS - 10 variants for username
    const xssPayloads = [
      "<script>alert('xss')</script>",
      "<img src=x onerror=alert('xss')>",
      "<svg onload=alert('xss')>",
      "javascript:alert('xss')",
      "<iframe src='javascript:alert(1)'>",
      "<body onload=alert('xss')>",
      "<input onfocus=alert('xss') autofocus>",
      "<select onfocus=alert('xss') autofocus>",
      "<textarea onfocus=alert('xss') autofocus>",
      "<marquee onstart=alert('xss')>"
    ];

    xssPayloads.forEach((payload, idx) => {
      scenarios.push({
        id: `xss-username-${idx + 1}-${id++}`,
        module: "security-xss",
        priority: "high",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: payload },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "high"
      });
    });

    // 5. Boundary - 10 length variants for username
    const lengthTests = [1, 2, 3, 50, 100, 255, 256, 500, 1000, 10000];
    lengthTests.forEach((len, idx) => {
      scenarios.push({
        id: `boundary-username-length-${len}-${id++}`,
        module: "boundary-length",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: "a".repeat(len) },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 6. Special characters - 10 variants
    const specialChars = [
      "!@#$%^&*()",
      "user@domain.com",
      "user name",
      "user\nname",
      "user\tname",
      "用户名",
      "пользователь",
      "ユーザー",
      "user'name",
      "user\"name"
    ];

    specialChars.forEach((chars, idx) => {
      scenarios.push({
        id: `special-chars-username-${idx + 1}-${id++}`,
        module: "boundary-chars",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: chars },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 7. Valid credentials - different roles
    const validCreds = [
      { user: "admin", pass: "password" },
      { user: "viewer", pass: "password" },
      { user: "admin", pass: "admin123" },
      { user: "test", pass: "test123" },
      { user: "user1", pass: "pass1" }
    ];

    validCreds.forEach((cred, idx) => {
      scenarios.push({
        id: `valid-login-${idx + 1}-${id++}`,
        module: "happy-path",
        priority: "high",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: cred.user },
          { action: "fill", target: passTarget, value: cred.pass },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "当前角色" }],
        risk: "low"
      });
    });

    // 8. Case sensitivity tests
    const caseTests = [
      { user: "ADMIN", pass: "password" },
      { user: "Admin", pass: "password" },
      { user: "aDmIn", pass: "password" },
      { user: "admin", pass: "PASSWORD" },
      { user: "admin", pass: "Password" }
    ];

    caseTests.forEach((test, idx) => {
      scenarios.push({
        id: `case-sensitivity-${idx + 1}-${id++}`,
        module: "auth-logic",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: test.user },
          { action: "fill", target: passTarget, value: test.pass },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 9. Whitespace handling
    const whitespaceTests = [
      { user: " admin", pass: "password" },
      { user: "admin ", pass: "password" },
      { user: " admin ", pass: "password" },
      { user: "admin", pass: " password" },
      { user: "admin", pass: "password " }
    ];

    whitespaceTests.forEach((test, idx) => {
      scenarios.push({
        id: `whitespace-${idx + 1}-${id++}`,
        module: "boundary-whitespace",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: test.user },
          { action: "fill", target: passTarget, value: test.pass },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 10. Rapid submission / race condition
    for (let i = 0; i < 3; i++) {
      scenarios.push({
        id: `rapid-submit-${i + 1}-${id++}`,
        module: "stress",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: "admin" },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "medium"
      });
    }

    // 11. Password complexity tests - 10 variants
    const passwordTests = [
      { pass: "", desc: "empty" },
      { pass: "1", desc: "single-char" },
      { pass: "12345678", desc: "numeric-only" },
      { pass: "abcdefgh", desc: "lowercase-only" },
      { pass: "ABCDEFGH", desc: "uppercase-only" },
      { pass: "Pass123", desc: "mixed-short" },
      { pass: "P@ssw0rd!", desc: "complex" },
      { pass: "password".repeat(10), desc: "repeated-pattern" },
      { pass: "qwertyuiop", desc: "keyboard-pattern" },
      { pass: "admin123", desc: "common-weak" }
    ];

    passwordTests.forEach((test, idx) => {
      scenarios.push({
        id: `password-complexity-${test.desc}-${id++}`,
        module: "auth-security",
        priority: "medium",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: "admin" },
          { action: "fill", target: passTarget, value: test.pass },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 12. Unicode and emoji tests - 10 variants
    const unicodeTests = [
      "用户名123",
      "ユーザー",
      "пользователь",
      "مستخدم",
      "👤admin",
      "test🔒",
      "user\u0000name",
      "user\u200Bname",
      "test\uFEFFuser",
      "admin\u202E"
    ];

    unicodeTests.forEach((unicode, idx) => {
      scenarios.push({
        id: `unicode-username-${idx + 1}-${id++}`,
        module: "boundary-unicode",
        priority: "low",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: unicode },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    });

    // 13. Timing attacks - 5 variants
    for (let i = 0; i < 5; i++) {
      scenarios.push({
        id: `timing-attack-${i + 1}-${id++}`,
        module: "security-timing",
        priority: "low",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: `user${i}` },
          { action: "fill", target: passTarget, value: "a".repeat(i * 100) },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "low"
      });
    }

    // 14. NULL byte injection - 3 variants
    const nullTests = [
      "admin\x00",
      "\x00admin",
      "ad\x00min"
    ];

    nullTests.forEach((test, idx) => {
      scenarios.push({
        id: `null-byte-${idx + 1}-${id++}`,
        module: "security-injection",
        priority: "high",
        preconditions: [],
        steps: [
          { action: "goto", target: "/", value: baseUrl },
          { action: "fill", target: userTarget, value: test },
          { action: "fill", target: passTarget, value: "password" },
          { action: "click", target: btnTarget }
        ],
        assertions: [{ type: "ui", value: "登录" }],
        risk: "high"
      });
    });
  }

  return scenarios;
}
