import type { ImportParsedCellValue, ImportParsedRow, ImportParsedSheet } from "@/lib/import-parser";

export type ImportFieldKey =
  | "month"
  | "period"
  | "dueDate"
  | "name"
  | "amount"
  | "telesShare"
  | "nicoleShare"
  | "category"
  | "notes"
  | "billMarker"
  | "debtMarker"
  | "expenseMarker"
  | "savingsMarker"
  | "paidStatus"
  | "variableMarker"
  | "recurringMarker"
  | "sourceLabel";

export type ImportSourceColumn = {
  id: string;
  label: string;
  index: number;
  headerName: string | null;
};

export type ImportColumnMapping = Partial<Record<ImportFieldKey, string>>;

export type ImportMappingConflict = {
  sourceColumnId: string;
  fields: ImportFieldKey[];
};

export type MappedImportPreviewRow = {
  sourceRowId: string;
  sourceRowNumber: number;
  fields: Record<ImportFieldKey, ImportParsedCellValue>;
};

export const IMPORT_CORE_FIELD_KEYS: ImportFieldKey[] = [
  "month",
  "period",
  "dueDate",
  "name",
  "amount",
  "telesShare",
  "nicoleShare",
  "category",
  "notes",
];

export const IMPORT_MARKER_FIELD_KEYS: ImportFieldKey[] = [
  "billMarker",
  "debtMarker",
  "expenseMarker",
  "savingsMarker",
];

export const IMPORT_OPTIONAL_FIELD_KEYS: ImportFieldKey[] = [
  "paidStatus",
  "variableMarker",
  "recurringMarker",
  "sourceLabel",
];

export const IMPORT_REQUIRED_CORE_FIELD_KEYS: ImportFieldKey[] = [
  "month",
  "period",
  "dueDate",
  "name",
  "amount",
];

const ALL_IMPORT_FIELD_KEYS: ImportFieldKey[] = [
  ...IMPORT_CORE_FIELD_KEYS,
  ...IMPORT_MARKER_FIELD_KEYS,
  ...IMPORT_OPTIONAL_FIELD_KEYS,
];

const IMPORT_FIELD_LABELS: Record<ImportFieldKey, string> = {
  month: "Month",
  period: "Pay period",
  dueDate: "Due date",
  name: "Bill / description",
  amount: "Amount",
  telesShare: "Teles share",
  nicoleShare: "Nicole share",
  category: "Category",
  notes: "Notes",
  billMarker: "Bill marker",
  debtMarker: "Debt marker",
  expenseMarker: "Expense marker",
  savingsMarker: "Savings marker",
  paidStatus: "Paid status",
  variableMarker: "Variable marker",
  recurringMarker: "Recurring / template marker",
  sourceLabel: "Source label",
};

type AutoDetectRule = {
  field: ImportFieldKey;
  patterns: RegExp[];
};

const AUTO_DETECT_RULES: AutoDetectRule[] = [
  {
    field: "telesShare",
    patterns: [/^teles(\s+(amount|share))?$/i, /^teles$/i],
  },
  {
    field: "nicoleShare",
    patterns: [/^nicole(\s+(amount|share))?$/i, /^nicole$/i],
  },
  {
    field: "dueDate",
    patterns: [/^due\s*date$/i, /^date$/i, /^vencimento$/i],
  },
  {
    field: "period",
    patterns: [/^period$/i, /^pay\s*period$/i, /^bucket$/i],
  },
  {
    field: "month",
    patterns: [/^month$/i, /^mes$/i, /^mês$/i],
  },
  {
    field: "amount",
    patterns: [/^amount$/i, /^total$/i, /^value$/i],
  },
  {
    field: "name",
    patterns: [/^name$/i, /^bill\s*name$/i, /^description$/i, /^merchant$/i],
  },
  {
    field: "category",
    patterns: [/^category$/i, /^categoria$/i],
  },
  {
    field: "notes",
    patterns: [/^notes?$/i, /^memo$/i],
  },
  {
    field: "debtMarker",
    patterns: [/^debt(\s+payment)?$/i],
  },
  {
    field: "expenseMarker",
    patterns: [/^expense$/i, /^manual\s+expense$/i],
  },
  {
    field: "savingsMarker",
    patterns: [/^savings?$/i, /^saving\s+goal$/i],
  },
  {
    field: "billMarker",
    patterns: [/^bill$/i, /^is\s+bill$/i],
  },
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getImportFieldLabel(field: ImportFieldKey): string {
  return IMPORT_FIELD_LABELS[field];
}

export function getImportFieldKeys(): ImportFieldKey[] {
  return [...ALL_IMPORT_FIELD_KEYS];
}

export function columnIndexToLetter(index: number): string {
  let label = "";
  let current = index;
  while (current >= 0) {
    label = String.fromCharCode((current % 26) + 65) + label;
    current = Math.floor(current / 26) - 1;
  }
  return label;
}

export function columnIndexToLabel(index: number): string {
  return `Column ${columnIndexToLetter(index)}`;
}

export function buildSourceColumnId(index: number): string {
  return `col:${index}`;
}

export function normalizeHeaderLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getSheetColumnCount(sheet: ImportParsedSheet): number {
  const fromHeaders = sheet.headers.length;
  const fromRows = sheet.rows.reduce(
    (max, row) => Math.max(max, row.values.length),
    0
  );
  return Math.max(fromHeaders, fromRows);
}

export function buildImportSourceColumns(sheet: ImportParsedSheet): ImportSourceColumn[] {
  const count = getSheetColumnCount(sheet);
  if (count === 0) {
    return [];
  }

  const columns: ImportSourceColumn[] = [];
  for (let index = 0; index < count; index += 1) {
    const rawHeader = sheet.headers[index]?.trim() ?? "";
    const headerName = rawHeader.length > 0 ? rawHeader : null;
    const label =
      headerName && !UUID_PATTERN.test(headerName) ? headerName : columnIndexToLabel(index);

    columns.push({
      id: buildSourceColumnId(index),
      label,
      index,
      headerName,
    });
  }

  return columns;
}

export function suggestImportColumnMapping(
  columns: ImportSourceColumn[]
): ImportColumnMapping {
  const mapping: ImportColumnMapping = {};
  const usedColumns = new Set<string>();

  for (const rule of AUTO_DETECT_RULES) {
    for (const column of columns) {
      if (usedColumns.has(column.id)) {
        continue;
      }

      const normalized = normalizeHeaderLabel(column.label);
      if (rule.patterns.some((pattern) => pattern.test(normalized))) {
        mapping[rule.field] = column.id;
        usedColumns.add(column.id);
        break;
      }
    }
  }

  return mapping;
}

export function createEmptyImportColumnMapping(): ImportColumnMapping {
  return {};
}

export function clearImportFieldMapping(
  mapping: ImportColumnMapping,
  field: ImportFieldKey
): ImportColumnMapping {
  const next = { ...mapping };
  delete next[field];
  return next;
}

export function applyImportMappingSelection(
  mapping: ImportColumnMapping,
  field: ImportFieldKey,
  sourceColumnId: string | null
): ImportColumnMapping {
  const next = { ...mapping };

  if (sourceColumnId === null || sourceColumnId === "") {
    delete next[field];
    return next;
  }

  for (const key of Object.keys(next) as ImportFieldKey[]) {
    if (key !== field && next[key] === sourceColumnId) {
      delete next[key];
    }
  }

  next[field] = sourceColumnId;
  return next;
}

export function resetImportColumnMapping(
  columns: ImportSourceColumn[],
  mode: "empty" | "suggested" = "empty"
): ImportColumnMapping {
  if (mode === "suggested") {
    return suggestImportColumnMapping(columns);
  }
  return createEmptyImportColumnMapping();
}

export function detectMappingConflicts(
  mapping: ImportColumnMapping
): ImportMappingConflict[] {
  const byColumn = new Map<string, ImportFieldKey[]>();

  for (const [field, columnId] of Object.entries(mapping) as [
    ImportFieldKey,
    string | undefined,
  ][]) {
    if (!columnId) {
      continue;
    }
    const fields = byColumn.get(columnId) ?? [];
    fields.push(field);
    byColumn.set(columnId, fields);
  }

  const conflicts: ImportMappingConflict[] = [];
  for (const [sourceColumnId, fields] of byColumn) {
    if (fields.length > 1) {
      conflicts.push({ sourceColumnId, fields });
    }
  }

  return conflicts;
}

export function buildRequiredFieldWarnings(mapping: ImportColumnMapping): string[] {
  return IMPORT_REQUIRED_CORE_FIELD_KEYS.filter((field) => !mapping[field]).map(
    (field) => `${getImportFieldLabel(field)} is not mapped yet.`
  );
}

export function createEmptyMappedFields(): Record<ImportFieldKey, ImportParsedCellValue> {
  const fields = {} as Record<ImportFieldKey, ImportParsedCellValue>;
  for (const field of ALL_IMPORT_FIELD_KEYS) {
    fields[field] = null;
  }
  return fields;
}

export function applyMappingToRow(
  row: ImportParsedRow,
  mapping: ImportColumnMapping,
  columns: ImportSourceColumn[]
): Record<ImportFieldKey, ImportParsedCellValue> {
  const fields = createEmptyMappedFields();
  const columnById = new Map(columns.map((column) => [column.id, column]));

  for (const [field, columnId] of Object.entries(mapping) as [
    ImportFieldKey,
    string | undefined,
  ][]) {
    if (!columnId) {
      continue;
    }
    const column = columnById.get(columnId);
    if (!column) {
      continue;
    }
    fields[field] = row.values[column.index] ?? null;
  }

  return fields;
}

export function buildMappedPreviewRows(
  sheet: ImportParsedSheet,
  mapping: ImportColumnMapping,
  columns: ImportSourceColumn[],
  limit = 5
): MappedImportPreviewRow[] {
  return buildAllMappedRows(sheet, mapping, columns).slice(0, limit);
}

export function buildAllMappedRows(
  sheet: ImportParsedSheet,
  mapping: ImportColumnMapping,
  columns: ImportSourceColumn[]
): MappedImportPreviewRow[] {
  return sheet.rows.map((row) => ({
    sourceRowId: row.id,
    sourceRowNumber: row.rowNumber,
    fields: applyMappingToRow(row, mapping, columns),
  }));
}

export function formatMappedCellValue(value: ImportParsedCellValue): string {
  if (value === null) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export function mappingUsesReadableLabels(mapping: ImportColumnMapping): boolean {
  return Object.keys(mapping).every((field) => {
    const label = getImportFieldLabel(field as ImportFieldKey);
    return label.length > 0 && !UUID_PATTERN.test(label);
  });
}

export function getMappedPreviewColumns(
  mapping: ImportColumnMapping
): ImportFieldKey[] {
  return ALL_IMPORT_FIELD_KEYS.filter((field) => Boolean(mapping[field]));
}
