export interface ProjectConfig {
  baseUrl: string;
  loginPage: string;
  modules: string[];
  roles: string[];
  criticalFlows: string[];
  readonlyTables: string[];
  forbiddenActions: string[];
  selectors: Record<string, string>;
  db?: {
    client: "postgres" | "mysql";
    connectionString: string;
  };
  llm?: {
    provider: string;
    model: string;
  };
}
