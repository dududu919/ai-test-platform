import type { ProjectConfig } from "../models/project-config.js";
import type { FailureReport, RunnerResult } from "../models/report.js";
import type { Scenario } from "../models/scenario.js";
import { classifyFailure } from "./failure-classifier.js";

export class ResultAnalyst {
  async analyze(input: {
    projectRoot: string;
    config: ProjectConfig;
    runResult: RunnerResult;
    scenarios: Scenario[];
  }): Promise<FailureReport> {
    const scenarioMap = new Map(input.scenarios.map((scenario) => [scenario.id, scenario]));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        total: input.runResult.results.length,
        passed: input.runResult.results.filter((item) => item.status === "passed").length,
        failed: input.runResult.results.filter((item) => item.status === "failed").length,
        skipped: input.runResult.results.filter((item) => item.status === "skipped").length
      },
      scenarioReports: input.runResult.results.map((result) => {
        const classification =
          result.status === "failed" ? classifyFailure(result) : "passed";
        const scenario = scenarioMap.get(result.scenarioId);

        if (!scenario) {
          throw new Error(`Scenario not found for result ${result.scenarioId}`);
        }

        return {
          scenario,
          classification,
          summary:
            result.status === "passed"
              ? "场景执行成功。"
              : `场景执行失败：${result.errorMessage ?? "未知错误"}`,
          suggestedFix:
            result.status === "passed"
              ? "无需处理。"
              : suggestNextAction(classification)
        };
      })
    };
  }
}

function suggestNextAction(classification: string): string {
  switch (classification) {
    case "element-locator-failure":
      return "检查 project.config.yaml 中的选择器映射，以及页面结构是否发生变化。";
    case "assertion-failure":
      return "对比当前页面文案和场景断言，确认预期文本或业务规则是否一致。";
    case "permission-failure":
      return "检查角色设置、测试账号权限和访问控制预期是否一致。";
    case "backend-api-failure":
      return "检查失败的网络请求、后端日志以及环境依赖数据。";
    case "db-persistence-failure":
      return "检查事务提交行为以及数据库断言的查询条件。";
    default:
      return "查看截图、控制台日志和场景定义，进一步定位失败原因。";
  }
}
