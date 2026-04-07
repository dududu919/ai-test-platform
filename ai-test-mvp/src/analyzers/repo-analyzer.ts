import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { RepoModel } from "../models/model-bundle.js";

export class RepoAnalyzer {
  async analyze(projectRoot: string): Promise<RepoModel> {
    const files = await listFiles(projectRoot);
    const repoFiles = files.filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));

    const routes = repoFiles.filter((file) => file.match(/[\\/]pages[\\/]|[\\/]app[\\/]/));
    const existingTests = repoFiles.filter((file) => file.match(/(\.spec\.|\.test\.)/));
    const sourceSnippets = await Promise.all(
      repoFiles
        .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
        .slice(0, 20)
        .map(async (file) => ({ file, content: await safeRead(file) }))
    );

    const businessTerms = collectTerms(sourceSnippets.map((item) => item.content).join("\n"));

    return {
      pages: routes.slice(0, 10).map((file) => ({
        name: path.basename(file, path.extname(file)),
        route: guessRoute(file),
        sourceFile: path.relative(projectRoot, file),
        actions: []
      })),
      forms: [],
      routes: routes.map((file) => guessRoute(file)),
      apis: repoFiles
        .filter((file) => file.match(/[\\/]api[\\/]/))
        .map((file) => path.relative(projectRoot, file)),
      roles: inferRoles(sourceSnippets.map((item) => item.content)),
      existingTests: existingTests.map((file) => path.relative(projectRoot, file)),
      businessTerms
    };
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function safeRead(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function guessRoute(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const appIndex = normalized.lastIndexOf("/app/");
  const pagesIndex = normalized.lastIndexOf("/pages/");
  const sliceIndex = Math.max(appIndex, pagesIndex);

  if (sliceIndex === -1) {
    return "/";
  }

  const routePart = normalized.slice(sliceIndex).split("/").slice(2).join("/");
  return `/${routePart.replace(/\.(tsx?|jsx?)$/, "").replace(/index$/, "")}`.replace(/\/+/g, "/");
}

function inferRoles(chunks: string[]): string[] {
  const matches = chunks.join("\n").match(/\b(admin|editor|viewer|operator|guest)\b/gi) ?? [];
  return [...new Set(matches.map((match) => match.toLowerCase()))];
}

function collectTerms(content: string): string[] {
  const matches = content.match(/\b(order|user|inventory|customer|approve|login|role)\b/gi) ?? [];
  return [...new Set(matches.map((term) => term.toLowerCase()))];
}
