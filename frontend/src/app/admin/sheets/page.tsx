"use client";

import { Protected } from "../../../components/app-shell";
import { SheetsAdministration } from "../../../components/operator-pages";

export default function SheetsPage() {
  return <Protected roles={["ADMIN"]}><SheetsAdministration /></Protected>;
}
