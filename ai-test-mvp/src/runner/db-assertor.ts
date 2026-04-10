import type { ProjectConfig } from "../models/project-config.js";
import type { ScenarioAssertion } from "../models/scenario.js";
import { openDbClient, safeIdentifier } from "./db-client.js";

export class DbAssertor {
  async assert(assertions: ScenarioAssertion[], config: ProjectConfig): Promise<
    Array<{
      assertion: string;
      passed: boolean;
      details: string;
    }>
  > {
    const dbAssertions = assertions.filter((assertion) => assertion.type === "db");
    if (dbAssertions.length === 0) {
      return [];
    }

    const client = await openDbClient(config);
    try {
      const results: Array<{ assertion: string; passed: boolean; details: string }> = [];
      for (const assertion of dbAssertions) {
        const table = assertion.table;
        if (!table) {
          results.push({
            assertion: JSON.stringify(assertion),
            passed: false,
            details: "Missing table for db assertion."
          });
          continue;
        }

        const where = assertion.where ?? {};
        const expect = assertion.expect ?? {};
        const whereKeys = Object.keys(where);
        const whereClauses = whereKeys.map(
          (key, index) => `${safeIdentifier(key)} = ${client.placeholder(index + 1)}`
        );
        const sql =
          whereClauses.length > 0
            ? `SELECT * FROM ${safeIdentifier(table)} WHERE ${whereClauses.join(" AND ")}`
            : `SELECT * FROM ${safeIdentifier(table)}`;
        const params = whereKeys.map((key) => where[key]);
        const { rows } = await client.query(sql, params);
        const row = rows[0];

        if (!row) {
          results.push({
            assertion: JSON.stringify(assertion),
            passed: false,
            details: "No rows matched assertion."
          });
          continue;
        }

        const mismatches = Object.entries(expect).filter(([key, value]) => {
          const actual = row[key];
          return String(actual) !== String(value);
        });

        if (mismatches.length > 0) {
          results.push({
            assertion: JSON.stringify(assertion),
            passed: false,
            details: `Mismatched fields: ${mismatches.map(([key]) => key).join(", ")}`
          });
          continue;
        }

        results.push({
          assertion: JSON.stringify(assertion),
          passed: true,
          details: "DB assertion passed."
        });
      }

      return results;
    } finally {
      await client.close();
    }
  }
}
