import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { renderHtmlReport } from "../analyst/html-report.js";
import { loadProjectConfig } from "../config/load-config.js";
import { ResultAnalyst } from "../analyst/result-analyst.js";
import { DbAnalyzer } from "../analyzers/db-analyzer.js";
import { RepoAnalyzer } from "../analyzers/repo-analyzer.js";
import type { FailureReport } from "../models/report.js";
import type { DbModel, RepoModel } from "../models/model-bundle.js";
import { PlaywrightRunner } from "../runner/playwright-runner.js";
import { ScenarioGenerator } from "../generator/scenario-generator.js";
import { ensureWorkspaceDirs, writeJson } from "../shared/fs-utils.js";

type Command = "analyze" | "generate" | "run" | "pipeline";

function parseArgs(args: string[]): { command: Command; target: string } {
  const command = parseCommand(args[0] ?? "pipeline");
  // --target <path>
  const targetIndex = args.indexOf("--target");
  const target = targetIndex !== -1 ? args[targetIndex + 1] ?? "../demo-app" : "../demo-app";
  return { command, target };
}

export async function runCli(args: string[]): Promise<void> {
  const { command, target: appRoot } = parseArgs(args);
  const projectRoot = process.cwd();
  const config = await loadProjectConfig(path.join(projectRoot, "project.config.yaml"));

  await ensureWorkspaceDirs(projectRoot);

  const repoAnalyzer = new RepoAnalyzer();
  const dbAnalyzer = new DbAnalyzer();
  const scenarioGenerator = new ScenarioGenerator();
  const runner = new PlaywrightRunner();
  const analyst = new ResultAnalyst();

  switch (command) {
    case "analyze": {
      const bundle = await analyze(appRoot, repoAnalyzer, dbAnalyzer);
      await persistAnalysis(projectRoot, bundle.repoModel, bundle.dbModel);
      break;
    }
    case "generate": {
      const bundle = await analyze(appRoot, repoAnalyzer, dbAnalyzer);
      await persistAnalysis(projectRoot, bundle.repoModel, bundle.dbModel);
      const scenarios = await scenarioGenerator.generate({
        config,
        repoModel: bundle.repoModel,
        dbModel: bundle.dbModel
      });
      const generatedPath = path.join(projectRoot, "scenarios", "generated", "scenarios.json");
      const poolPath = path.join(projectRoot, "scenarios_pool", "scenarios.json");
      await writeJson(generatedPath, scenarios);
      await writeJson(poolPath, scenarios);
      break;
    }
    case "run": {
      const bundle = await analyze(appRoot, repoAnalyzer, dbAnalyzer);
      const scenarios = await scenarioGenerator.generate({
        config,
        repoModel: bundle.repoModel,
        dbModel: bundle.dbModel
      });
      const runResult = await runner.run({
        projectRoot,
        config,
        scenarios
      });
      const report = await analyst.analyze({
        projectRoot,
        config,
        runResult,
        scenarios
      });
      await persistReport(projectRoot, report);
      break;
    }
    case "pipeline": {
      const bundle = await analyze(appRoot, repoAnalyzer, dbAnalyzer);
      await persistAnalysis(projectRoot, bundle.repoModel, bundle.dbModel);

      // Read scenarios from pool instead of regenerating
      const poolPath = path.join(projectRoot, "scenarios_pool", "scenarios.json");
      let scenarios;
      try {
        const poolContent = await readFile(poolPath, "utf8");
        scenarios = JSON.parse(poolContent);
        console.log(`Loaded ${scenarios.length} scenarios from pool`);
      } catch {
        console.log("No scenarios in pool, generating new ones...");
        scenarios = await scenarioGenerator.generate({
          config,
          repoModel: bundle.repoModel,
          dbModel: bundle.dbModel
        });
        const generatedPath = path.join(projectRoot, "scenarios", "generated", "scenarios.json");
        await writeJson(generatedPath, scenarios);
        await writeJson(poolPath, scenarios);
      }

      const runResult = await runner.run({
        projectRoot,
        config,
        scenarios
      });
      const report = await analyst.analyze({
        projectRoot,
        config,
        runResult,
        scenarios
      });
      await persistReport(projectRoot, report);
      break;
    }
  }
}

function parseCommand(input?: string): Command {
  switch (input) {
    case "analyze":
    case "generate":
    case "run":
    case "pipeline":
      return input;
    default:
      return "pipeline";
  }
}

async function analyze(
  appRoot: string,
  repoAnalyzer: RepoAnalyzer,
  dbAnalyzer: DbAnalyzer
): Promise<{ repoModel: RepoModel; dbModel: DbModel }> {
  const [repoModel, dbModel] = await Promise.all([
    repoAnalyzer.analyze(appRoot),
    dbAnalyzer.analyze(appRoot)
  ]);

  return { repoModel, dbModel };
}

async function persistAnalysis(
  projectRoot: string,
  repoModel: RepoModel,
  dbModel: DbModel
): Promise<void> {
  await writeJson(path.join(projectRoot, "reports", "repo-model.json"), repoModel);
  await writeJson(path.join(projectRoot, "reports", "db-model.json"), dbModel);
}

async function persistReport(projectRoot: string, report: FailureReport): Promise<void> {
  const reportDir = path.join(projectRoot, "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "latest-report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(path.join(reportDir, "latest-report.html"), renderHtmlReport(report), "utf8");
}
