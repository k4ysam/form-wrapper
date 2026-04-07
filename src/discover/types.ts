export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "password"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "file";

export interface CrawledField {
  id: string;
  type: FieldType;
  label: string;
  selector: string;
  ariaLabel?: string;
  nameAttr?: string;
  required: boolean;
  options?: string[];
  unsupported?: true;
}

export interface CrawledForm {
  url: string;
  fields: CrawledField[];
  isMultiStep: boolean;
}

export interface CrawlerOptions {
  headed?: boolean;
}
