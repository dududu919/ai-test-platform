import type { DbModel, RepoModel } from "../models/model-bundle.js";
import type { ProjectConfig } from "../models/project-config.js";
import type { Scenario } from "../models/scenario.js";

export class ScenarioGenerator {
  async generate(input: {
    config: ProjectConfig;
    repoModel: RepoModel;
    dbModel: DbModel;
  }): Promise<Scenario[]> {
    const moduleName = input.config.modules[0] ?? input.repoModel.businessTerms[0] ?? "core";
    const moduleId = moduleName.replace(/\s+/g, "-");

    return [
      {
        id: `${moduleId}-login-happy-path`,
        module: moduleName,
        priority: "high",
        preconditions: ["匿名用户进入登录页"],
        steps: [
          { action: "goto", target: input.config.loginPage },
          { action: "fill", target: "login.username", value: "admin" },
          { action: "fill", target: "login.password", value: "password" },
          { action: "click", target: "login.submit" }
        ],
        assertions: [
          { type: "ui", target: "page", value: "用户列表" }
        ],
        risk: "low"
      },
      {
        id: `${moduleId}-validation`,
        module: moduleName,
        priority: "medium",
        preconditions: ["管理员先登录"],
        steps: [
          { action: "goto", target: input.config.loginPage },
          { action: "fill", target: "login.username", value: "admin" },
          { action: "fill", target: "login.password", value: "password" },
          { action: "click", target: "login.submit" },
          { action: "goto", target: `/${moduleName}/new` },
          { action: "click", target: "submit" }
        ],
        assertions: [
          { type: "ui", target: "validation", value: "必填" }
        ],
        risk: "low"
      },
      {
        id: `${moduleId}-create-success`,
        module: moduleName,
        priority: "high",
        preconditions: ["管理员先登录"],
        steps: [
          { action: "goto", target: input.config.loginPage },
          { action: "fill", target: "login.username", value: "admin" },
          { action: "fill", target: "login.password", value: "password" },
          { action: "click", target: "login.submit" },
          { action: "goto", target: `/${moduleName}` },
          { action: "click", target: "create" },
          { action: "fill", target: "user.name", value: "Jamie Operator" },
          { action: "fill", target: "user.email", value: "jamie@example.com" },
          { action: "select", target: "user.role", value: "viewer" },
          { action: "click", target: "submit" }
        ],
        assertions: [
          { type: "ui", target: "users", value: "用户创建成功" },
          { type: "ui", target: "users", value: "Jamie Operator" },
          {
            type: "db",
            table: input.dbModel.entities[0]?.table ?? "orders",
            where: { status: "pending" },
            expect: { status: "pending" }
          }
        ],
        risk: "medium"
      },
      {
        id: `${moduleId}-failure-demo`,
        module: moduleName,
        priority: "medium",
        preconditions: ["管理员先登录，此用例用于演示失败报告"],
        steps: [
          { action: "goto", target: input.config.loginPage },
          { action: "fill", target: "login.username", value: "admin" },
          { action: "fill", target: "login.password", value: "password" },
          { action: "click", target: "login.submit" },
          { action: "goto", target: `/${moduleName}` }
        ],
        assertions: [
          { type: "ui", target: "users", value: "这是一条故意不存在的提示" }
        ],
        risk: "low"
      }
    ];
  }
}
