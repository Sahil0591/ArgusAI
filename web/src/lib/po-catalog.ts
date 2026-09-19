// Static mirror of backend/seed/purchase_orders.json + vendors.json.
// The real backend never exposes PO data over the API (only events for lines
// actually logged), so this exists purely to render checklist rows for
// lines the clerk hasn't spoken yet. All actual matching/quantities/pricing
// come from the backend — this is display-only reference data.

export interface CatalogLine {
  EBELP: string;
  MATNR: string;
  MAKTX: string;
  MENGE: number;
  MEINS: string;
  NETPR: number;
}

export interface CatalogPO {
  EBELN: string;
  LIFNR: string;
  BEDAT: string;
  lines: CatalogLine[];
}

export interface CatalogVendor {
  LIFNR: string;
  NAME1: string;
  LAND1: string;
}

export const VENDORS: CatalogVendor[] = [
  { LIFNR: "V001", NAME1: "Stahl & Metall GmbH", LAND1: "DE" },
  { LIFNR: "V002", NAME1: "EuroFasteners B.V.", LAND1: "NL" },
  { LIFNR: "V003", NAME1: "Nordic Industrial Supply AB", LAND1: "SE" },
];

export const PURCHASE_ORDERS: CatalogPO[] = [
  {
    EBELN: "PO-4500001",
    LIFNR: "V001",
    BEDAT: "2026-09-10",
    lines: [
      { EBELP: "10", MATNR: "MAT-001", MAKTX: "M8 Hex Bolt Grade 8.8", MENGE: 50, MEINS: "CTN", NETPR: 18.5 },
      { EBELP: "20", MATNR: "MAT-002", MAKTX: "M10 Hex Bolt Grade 10.9", MENGE: 30, MEINS: "CTN", NETPR: 24.0 },
      { EBELP: "30", MATNR: "MAT-006", MAKTX: "DN50 PN16 Blind Flange Steel", MENGE: 20, MEINS: "PC", NETPR: 85.0 },
      { EBELP: "40", MATNR: "MAT-007", MAKTX: "DN80 PN25 Weld Neck Flange", MENGE: 10, MEINS: "PC", NETPR: 142.0 },
    ],
  },
  {
    EBELN: "PO-4500002",
    LIFNR: "V002",
    BEDAT: "2026-09-12",
    lines: [
      { EBELP: "10", MATNR: "MAT-003", MAKTX: "M8 Hex Nut DIN 934 Zinc", MENGE: 100, MEINS: "CTN", NETPR: 9.75 },
      { EBELP: "20", MATNR: "MAT-004", MAKTX: "M10 Flat Washer DIN 125", MENGE: 24, MEINS: "PKG", NETPR: 7.2 },
      { EBELP: "30", MATNR: "MAT-005", MAKTX: "M12 Spring Lock Washer", MENGE: 5, MEINS: "PKG", NETPR: 11.4 },
    ],
  },
  {
    EBELN: "PO-4500003",
    LIFNR: "V003",
    BEDAT: "2026-09-15",
    lines: [
      { EBELP: "10", MATNR: "MAT-009", MAKTX: "SKF 6205-2RS Deep Groove Ball Bearing", MENGE: 20, MEINS: "PC", NETPR: 449.0 },
      { EBELP: "20", MATNR: "MAT-008", MAKTX: "PTFE Spiral Wound Gasket DN50", MENGE: 50, MEINS: "PC", NETPR: 22.6 },
      { EBELP: "30", MATNR: "MAT-010", MAKTX: "M6 Pan Head Machine Screw A2", MENGE: 200, MEINS: "PKG", NETPR: 5.9 },
    ],
  },
];

export function getPO(po_number: string): CatalogPO | undefined {
  return PURCHASE_ORDERS.find((po) => po.EBELN === po_number);
}

export function getVendor(vendor_id: string): CatalogVendor | undefined {
  return VENDORS.find((v) => v.LIFNR === vendor_id);
}
