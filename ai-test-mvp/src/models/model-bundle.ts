import type { FormModel, PageModel } from "./page-model.js";

export interface RepoModel {
  pages: PageModel[];
  forms: FormModel[];
  routes: string[];
  apis: string[];
  roles: string[];
  existingTests: string[];
  businessTerms: string[];
}

export interface DbEntityModel {
  table: string;
  fields: string[];
  statusValues: string[];
  constraints: string[];
}

export interface DbModel {
  entities: DbEntityModel[];
  relationships: Array<{
    fromTable: string;
    toTable: string;
    type: "one-to-many" | "many-to-one" | "many-to-many" | "unknown";
  }>;
  readonly: boolean;
}
