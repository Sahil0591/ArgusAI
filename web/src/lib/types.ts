// Mirrors the REAL backend contract, verified directly against
// backend/models.py, backend/routes.py, backend/services.py, backend/policy.py,
// and live curl against https://sahil0591-argusai--argusai-web.modal.run.
// Enum values are lowercase strings — that's what the backend actually sends.

export type DiscrepancyType = "shortage" | "overage" | "wrong_item" | "damage";
export type Severity = "low" | "medium" | "high";
export type Decision = "auto_accept" | "auto_accept_with_claim" | "escalate";
export type EscalationStatus = "pending" | "accepted" | "rejected";
export type DeliveryStatus = "in_progress" | "completed";
export type EventType =
  | "line_logged"
  | "damage_reported"
  | "photo_uploaded"
  | "assessment_complete"
  | "policy_decision"
  | "escalation_created"
  | "escalation_decided"
  | "delivery_closed";

// --- Core domain models ---

export interface Discrepancy {
  id: string;
  type: DiscrepancyType;
  expected_qty: number | null;
  actual_qty: number | null;
  damage_description: string | null;
  unit_value_eur: number;
  total_value_eur: number;
  photo_id: string | null;
}

export interface DamageAssessment {
  item: string;
  severity: Severity;
  affected_quantity: number;
  confidence: number; // 0-1
  description: string;
  claim_sentence: string;
}

export interface SupplierClaim {
  vendor_name: string;
  po_number: string;
  material: string;
  damage_description: string;
  claimed_amount_eur: number;
  draft_email: string;
}

export interface PolicyDecision {
  decision: Decision;
  reason: string;
  claim: SupplierClaim | null;
}

// SAP movement type 101
export interface GRLine {
  EBELN: string; // PO number
  EBELP: string; // PO item (string!)
  MATNR: string; // material number
  MAKTX: string; // material description
  MENGE: number; // received quantity
  MEINS: string; // unit of measure
  BWART: string; // "101"
}

export interface GoodsReceiptDocument {
  BLDAT: string; // document date (ISO date string)
  BUDAT: string; // posting date (ISO date string)
  lines: GRLine[];
}

export interface QualityNotification {
  QMTYP: "Q1";
  MATNR: string;
  vendor: string;
  description: string;
  damage_assessment: DamageAssessment | null;
  decision: string;
  photos: string[];
}

// --- Deliveries ---

export interface DeliverySummary {
  id: string;
  po_number: string;
  vendor_id: string;
  status: DeliveryStatus;
}

export interface DeliveryEvent<TData = Record<string, unknown>> {
  id: number;
  type: EventType;
  data: TData;
  timestamp: string;
}

export interface DeliveryDetail extends DeliverySummary {
  events: DeliveryEvent[];
}

// --- Event `data` payload shapes, per event type (from backend/services.py & routes.py) ---

export interface LineLoggedEventData {
  po_line: string;
  material_number: string;
  material_description: string;
  ordered_qty: number;
  received_qty: number; // cumulative for this po_line within the delivery
  this_qty: number;
  unit_of_measure: string;
  pallet_number: number | null;
  discrepancies: Discrepancy[];
  // present instead of the above when the line couldn't be matched:
  error?: string;
  raw_transcript?: string;
}

export interface DamageReportedEventData {
  discrepancy: Discrepancy;
  material_description: string;
  material_number: string | null;
}

export interface PhotoUploadedEventData {
  photo_id: string;
  discrepancy_id: string;
  filename: string;
}

export interface AssessmentCompleteEventData {
  photo_id: string;
  discrepancy_id: string;
  assessment: DamageAssessment | null;
  vision_failed?: boolean;
}

export interface PolicyDecisionEventData {
  discrepancy_id: string;
  decision: Decision;
  reason: string;
  claim: SupplierClaim | null;
}

export interface EscalationCreatedEventData {
  escalation_id: string;
  discrepancy_id: string;
  reason: string;
}

export interface EscalationDecidedEventData {
  escalation_id: string;
  decision: EscalationStatus;
  decided_by: string | null;
}

// Backend quirk: `close_pallet` emits type "delivery_closed" (naming leftover,
// not an actual delivery-close signal) — don't treat this as "delivery done".
export interface DeliveryClosedEventData {
  pallet_number: number;
  line_count: number;
}

// --- SSE stream envelope (GET /stream?last_event_id=N) ---
// Sent as named SSE events (`event: <type>`), NOT plain `data:` messages.

export interface StreamEvent<TPayload = unknown> {
  type: EventType;
  delivery_id: string;
  event_id: number;
  payload: TPayload;
  needs_review: boolean;
  timestamp: string;
}

// --- Escalations (lean — enrich client-side from delivery events) ---

export interface Escalation {
  id: string;
  delivery_id: string;
  discrepancy_id: string;
  status: EscalationStatus;
  decided_at: string | null;
  decided_by: string | null;
}

// --- Tool endpoint request/response shapes ---

export interface StartDeliveryRequest {
  po_number: string;
}

export interface StartDeliveryResponse {
  delivery_id: string;
  po_number: string;
  status: DeliveryStatus;
}

export interface LogLineRequest {
  delivery_id: string;
  pallet_number?: number;
  material_description: string;
  quantity: number;
  unit_of_measure?: string;
  damage_noted?: string;
  raw_transcript?: string;
}

// Success and failure ("couldn't match to a PO line") shapes are merged;
// check `error`/`needs_review` to distinguish.
export interface LogLineResponse {
  speech: string;
  event_id?: number;
  po_line?: string;
  material_number?: string;
  discrepancies?: Discrepancy[];
  photo_requested?: boolean;
  error?: boolean;
  needs_review?: boolean;
}

export interface ReportDamageRequest {
  delivery_id: string;
  material_description: string;
  description: string;
  quantity?: number; // defaults to 1 server-side
}

export interface ReportDamageResponse {
  speech: string;
  event_id?: number;
  discrepancy_id?: string;
  photo_requested?: boolean;
  error?: boolean;
}

export interface ClosePalletRequest {
  delivery_id: string;
  pallet_number: number;
}

export interface ClosePalletResponse {
  speech: string;
  pallet_number?: number;
  line_count?: number;
  error?: boolean;
}

export interface DeliveryStatusLine {
  material: string;
  ordered: number;
  received: number;
}

export interface DeliveryStatusResponse {
  speech: string;
  delivery_id?: string;
  po_number?: string;
  status?: DeliveryStatus;
  lines?: DeliveryStatusLine[];
  total_ordered?: number;
  total_received?: number;
  error?: boolean;
}

export interface PhotoUploadResponse {
  photo_id: string;
  assessment: DamageAssessment | null;
  decision?: PolicyDecision;
  escalation_id?: string | null;
  speech: string;
  needs_review?: boolean;
}

export interface EscalationDecisionRequest {
  decision: "accepted" | "rejected";
  decided_by?: string;
}

export interface EscalationDecisionResponse {
  speech: string;
  escalation: {
    id: string;
    status: EscalationStatus;
    decided_by: string | null;
  };
}

export interface LiveTokenResponse {
  token: string;
  expires_at: string;
  model: string;
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LiveToolsResponse {
  system_instruction: string;
  tools: { function_declarations: FunctionDeclaration[] }[];
  model: string;
}

// --- View-models derived client-side from events (see lib/derive.ts) ---
// The backend never exposes structured receipt lines or enriched
// escalations directly — these are computed on the frontend.

export interface ReceiptLineView {
  po_line: string;
  material_number: string;
  material_description: string;
  ordered_qty: number;
  received_qty: number;
  unit_of_measure: string;
  discrepancies: Discrepancy[];
}

export interface EscalationView extends Escalation {
  material_description: string;
  discrepancy: Discrepancy | null;
  damage_assessment: DamageAssessment | null;
  policy_decision: PolicyDecision | null;
  photo_id: string | null;
}
