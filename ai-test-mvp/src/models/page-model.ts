export interface PageModel {
  name: string;
  route: string;
  sourceFile?: string;
  actions: string[];
}

export interface FormModel {
  page: string;
  fields: string[];
  validators: string[];
}
