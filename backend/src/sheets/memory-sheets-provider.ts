import { Injectable } from "@nestjs/common";
import { SheetTab, SheetsProvider } from "./sheets-provider.port";

@Injectable()
export class MemorySheetsProvider implements SheetsProvider {
  private readonly tabs = new Map<string, string[][]>();

  async replaceTabs(tabs: readonly SheetTab[]): Promise<void> {
    for (const tab of tabs) {
      this.tabs.set(
        tab.title,
        tab.values.map((row) => row.map((value) => String(value))),
      );
    }
  }

  snapshot(): Record<string, string[][]> {
    return Object.fromEntries(
      [...this.tabs.entries()].map(([title, values]) => [title, values.map((row) => [...row])]),
    );
  }
}
