// Single point of contact with the backend. Every page/component goes
// through here, never through raw fetch.
//
// Defaults to Sahil's live Modal backend. NEXT_PUBLIC_API_BASE isn't a
// secret (NEXT_PUBLIC_* vars are inlined into the client bundle anyway),
// so the real URL is just the code-level default — override via env var
// only if pointing at something else (e.g. a local backend).
//
// NOTE: the backend only allows CORS from http://localhost:5173 — run the
// dev server on that port (`npm run dev`, see package.json).

import type {
  ClosePalletRequest,
  ClosePalletResponse,
  DeliveryDetail,
  DeliverySummary,
  DeliveryStatusResponse,
  Escalation,
  EscalationDecisionRequest,
  EscalationDecisionResponse,
  GoodsReceiptDocument,
  DeliveryReport,
  LiveToolsResponse,
  LiveTokenResponse,
  LogLineRequest,
  LogLineResponse,
  PhotoUploadResponse,
  QualityNotification,
  ReportDamageRequest,
  ReportDamageResponse,
  StartDeliveryRequest,
  StartDeliveryResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://sahil0591-argusai--argusai-web.modal.run";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { detail?: string; error?: string });
    throw new Error(body.detail ?? body.error ?? `Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  streamUrl: (lastEventId = 0) => `${API_BASE}/stream?last_event_id=${lastEventId}`,

  listDeliveries: () => request<DeliverySummary[]>("/deliveries"),
  startDelivery: (delivery_id: string, body: StartDeliveryRequest) =>
    request<StartDeliveryResponse>(`/deliveries/${delivery_id}/start`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getDelivery: (id: string) => request<DeliveryDetail>(`/deliveries/${id}`),

  exportGoodsReceipt: (id: string) => request<GoodsReceiptDocument>(`/deliveries/${id}/export/gr`),
  exportQualityNotifications: (id: string) => request<QualityNotification[]>(`/deliveries/${id}/export/qn`),
  exportReport: (id: string) => request<DeliveryReport>(`/deliveries/${id}/export/report`),
  photoUrl: (photoId: string) => `${API_BASE}/photos/${encodeURIComponent(photoId)}`,

  logLine: (body: LogLineRequest) =>
    request<LogLineResponse>("/tools/log_line", { method: "POST", body: JSON.stringify(body) }),
  reportDamage: (body: ReportDamageRequest) =>
    request<ReportDamageResponse>("/tools/report_damage", { method: "POST", body: JSON.stringify(body) }),
  closePallet: (body: ClosePalletRequest) =>
    request<ClosePalletResponse>("/tools/close_pallet", { method: "POST", body: JSON.stringify(body) }),
  deliveryStatus: (delivery_id: string) =>
    request<DeliveryStatusResponse>(`/tools/delivery_status?delivery_id=${encodeURIComponent(delivery_id)}`),

  uploadPhoto: async (delivery_id: string, discrepancy_id: string, file: Blob): Promise<PhotoUploadResponse> => {
    const form = new FormData();
    form.append("delivery_id", delivery_id);
    form.append("discrepancy_id", discrepancy_id);
    form.append("file", file, "photo.jpg");
    const res = await fetch(`${API_BASE}/photos`, { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as { detail?: string });
      throw new Error(body.detail ?? `Photo upload failed: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<PhotoUploadResponse>;
  },

  listEscalations: (delivery_id?: string) =>
    request<Escalation[]>(delivery_id ? `/escalations?delivery_id=${encodeURIComponent(delivery_id)}` : "/escalations"),
  decideEscalation: (id: string, body: EscalationDecisionRequest) =>
    request<EscalationDecisionResponse>(`/escalations/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  liveToken: () => request<LiveTokenResponse>("/live/token", { method: "POST" }),
  liveTools: () => request<LiveToolsResponse>("/live/tools"),
};
