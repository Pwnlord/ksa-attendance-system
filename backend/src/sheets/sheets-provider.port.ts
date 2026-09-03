export const SHEETS_PROVIDER = Symbol("SHEETS_PROVIDER");

export interface SheetTab {
  title: string;
  values: readonly (readonly string[])[];
}

export interface SheetsProvider {
  replaceTabs(tabs: readonly SheetTab[]): Promise<void>;
}
