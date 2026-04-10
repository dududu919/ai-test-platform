import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureWorkspaceDirs(projectRoot: string): Promise<void> {
  const dirs = [
    "reports",
    "screenshots",
    "traces",
    path.join("scenarios", "generated"),
    path.join("scenarios_pool"),
    path.join("src", "generated-tests")
  ];

  await Promise.all(
    dirs.map((dir) => mkdir(path.join(projectRoot, dir), { recursive: true }))
  );
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
