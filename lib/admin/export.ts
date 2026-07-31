import "server-only";
import ExcelJS from "exceljs";
import { createServiceClient } from "@/lib/supabase/server";
import { putObject, BUCKET } from "@/lib/storage";
import { runList, type ListParams, type ListResource } from "./list-query";
import { writeAudit } from "./audit";
import type { AdminIdentity } from "./guard";

/**
 * Export — "produces a real file from the filtered set" (§3).
 *
 * Three properties that make this an export rather than a button that toasts:
 *   · it re-runs the SAME query the table ran, paging through ALL matching rows,
 *     so what lands in the file is what the admin was looking at — not the 50
 *     rows that happened to be on screen;
 *   · the file goes to a PRIVATE bucket of its own (0092). An export of user
 *     phone numbers behind a permanent public CDN URL would be a data leak;
 *   · it is audited as sensitive, and the `exports` row records whether personal
 *     fields were included, which is what A30 and any later DPDP request read.
 */

/** Fields carrying personal data — flagged on the row and warned about in the UI. */
const PERSONAL_FIELDS = new Set(["phone", "email", "name", "ip", "device", "actor_name"]);

const MAX_EXPORT_ROWS = 50_000;
const PAGE = 500;

export type ExportFormat = "csv" | "xlsx";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Quote when the value could otherwise break the row, and double inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type ExportCol = { header: string; field: string };

function toCsv(cols: ExportCol[], rows: Record<string, unknown>[]): Buffer {
  const lines = [cols.map((c) => csvCell(c.header)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c.field])).join(","));
  // BOM so Excel opens UTF-8 (Gujarati/Hindi names) without mojibake.
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

async function toXlsx(
  sheetName: string,
  cols: ExportCol[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31) || "Export");
  ws.addRow(cols.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow(
      cols.map((c) => {
        const v = r[c.field];
        if (v === null || v === undefined) return "";
        return typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean);
      }),
    );
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ExportOutcome = {
  id: string;
  rowCount: number;
  format: ExportFormat;
  containsPersonalData: boolean;
};

export async function runExport(
  me: AdminIdentity,
  resource: ListResource,
  params: ListParams,
  opts: { format: ExportFormat; fields: string[]; name?: string },
): Promise<ExportOutcome> {
  // Only columns the resource declares can be exported, so a crafted body cannot
  // pull a field the list itself would never show. Each survivor is resolved to
  // the ROW PROPERTY it reads — the UI key ("time") is not the data key
  // ("created_at"), and using the former writes a column of blanks.
  const selected = opts.fields
    .map((key) => {
      const col = resource.columns.find((c) => c.key === key);
      return col ? { header: col.label, field: col.field } : null;
    })
    .filter((c): c is { header: string; field: string } => c !== null);
  if (!selected.length) throw new Error("no exportable fields selected");

  const db = createServiceClient();
  const containsPersonalData = selected.some((c) => PERSONAL_FIELDS.has(c.field));
  const name = opts.name?.trim() || `${resource.name} export`;

  // The row is written BEFORE the work, as `processing`. If generation dies, the
  // row stays visible as a failure rather than the export silently never
  // existing — a status with no row is the dead end this avoids.
  const { data: created, error: insertError } = await db
    .from("exports")
    .insert({
      name,
      entity: resource.name,
      filters: (params.filters ?? {}) as Record<string, unknown>,
      format: opts.format,
      status: "processing",
      contains_personal_data: containsPersonalData,
      requested_by: me.id,
      requested_by_name: me.name,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !created) throw new Error(`export row failed: ${insertError?.message}`);

  try {
    // Page through the whole filtered set, not just the visible page.
    const rows: Record<string, unknown>[] = [];
    for (let page = 1; ; page++) {
      const chunk = await runList<Record<string, unknown>>(resource, {
        ...params,
        page,
        pageSize: PAGE,
      });
      rows.push(...chunk.rows);
      if (rows.length >= chunk.total || !chunk.rows.length || rows.length >= MAX_EXPORT_ROWS) break;
    }

    const body =
      opts.format === "xlsx"
        ? await toXlsx(resource.name, selected, rows)
        : toCsv(selected, rows);

    // Key is just the export id: the bucket already namespaces these, and
    // `admin-exports/admin-exports/…` is the kind of double prefix that later
    // makes a download quietly look in the wrong place.
    const key = `${created.id}.${opts.format}`;
    await putObject(
      key,
      body,
      opts.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv",
      BUCKET.adminExports,
    );

    await db
      .from("exports")
      .update({ status: "ready", row_count: rows.length, file_key: key })
      .eq("id", created.id);

    await writeAudit(me, {
      action: "export",
      entityType: "export",
      entityId: created.id,
      entityLabel: `${resource.name} · ${name}`,
      summary: `Exported ${rows.length} rows${containsPersonalData ? " (personal data included)" : ""}`,
      diff: {
        filters: params.filters ?? {},
        fields: selected.map((c) => c.field),
        format: opts.format,
      },
      sensitive: true,
    });

    return { id: created.id, rowCount: rows.length, format: opts.format, containsPersonalData };
  } catch (e) {
    await db
      .from("exports")
      .update({ status: "failed", reason: e instanceof Error ? e.message : "unknown" })
      .eq("id", created.id);
    throw e;
  }
}
