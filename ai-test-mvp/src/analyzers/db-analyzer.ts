import type { DbModel } from "../models/model-bundle.js";

export class DbAnalyzer {
  async analyze(_projectRoot: string): Promise<DbModel> {
    return {
      entities: [
        {
          table: "orders",
          fields: ["id", "user_id", "status", "amount"],
          statusValues: ["pending", "paid", "cancelled"],
          constraints: ["id primary key", "user_id not null", "amount not null"]
        }
      ],
      relationships: [
        {
          fromTable: "orders",
          toTable: "users",
          type: "many-to-one"
        }
      ],
      readonly: true
    };
  }
}
