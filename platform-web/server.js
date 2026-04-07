import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const workspaceRoot = path.resolve(__dirname, "..");
const aiTestRoot = path.join(workspaceRoot, "ai-test-mvp");
const reportsDir = path.join(aiTestRoot, "reports");
const scenariosDir = path.join(aiTestRoot, "scenarios", "generated");
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
      await readJsonFile(path.join(scenariosDir, "scenarios.json")).catch(() => [])
    );
  }

  if (req.method === "GET" && pathname === "/report/latest") {
    return serveFile(
      res,
      path.join(reportsDir, "latest-report.html"),
      "text/html; charset=utf-8"
    );
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
