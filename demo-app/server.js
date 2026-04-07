import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = 3000;

const routes = new Map([
  ["/", "login.html"],
  ["/login", "login.html"],
  ["/users", "users.html"],
  ["/users/new", "user-create.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"]
]);

const server = createServer(async (req, res) => {
  const url = req.url ? new URL(req.url, `http://${req.headers.host}`) : null;
  const pathname = url?.pathname ?? "/";
  const file = routes.get(pathname);

  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  try {
    const content = await readFile(path.join(publicDir, file));
    res.writeHead(200, { "Content-Type": getContentType(file) });
    res.end(content);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Demo app running at http://127.0.0.1:${port}`);
});

function getContentType(file) {
  if (file.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (file.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (file.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}
