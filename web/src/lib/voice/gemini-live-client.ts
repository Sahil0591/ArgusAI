"use client";

// Direct browser -> Google WebSocket client for the Gemini Live API.
// Protocol verified live against Google's official example repo
// (github.com/google-gemini/gemini-live-api-examples/tree/main/gemini-live-ephemeral-tokens-websocket)
// rather than assumed from memory — in particular:
//   - ephemeral-token connections use the BidiGenerateContentConstrained
//     endpoint with an `access_token` query param, NOT `key=` (that's for
//     raw API keys) — docs/api-notes.md and docs/FRONTEND.md both have
//     this wrong.
//   - the setup message's tools use camelCase `functionDeclarations`, but
//     our backend's GET /live/tools returns snake_case
//     `function_declarations` (FastAPI/Python convention) — translated
//     below.
//   - audio capture/playback use two separate AudioContexts (16kHz in,
//     24kHz out) with AudioWorklets, not ScriptProcessor.

import { apiClient } from "../api-client";
import { arrayBufferToBase64, base64ToInt16Array, float32ToPcm16, pcm16ToFloat32 } from "./pcm";
import type { ClosePalletRequest, FunctionDeclaration, LogLineRequest, ReportDamageRequest } from "../types";

export type VoiceState = "idle" | "connecting" | "listening" | "error";

interface ToolCallPart {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiLiveCallbacks {
  onStateChange: (state: VoiceState) => void;
  onSpeech: (text: string) => void;
  onPhotoRequested: (discrepancyId: string, material: string) => void;
  onError: (message: string) => void;
}

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private captureContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private captureNode: AudioWorkletNode | null = null;
  private playbackNode: AudioWorkletNode | null = null;
  private micStream: MediaStream | null = null;
  private deliveryId: string;
  private callbacks: GeminiLiveCallbacks;
  private stopped = false;
  private handledToolCalls = new Set<string>();

  constructor(deliveryId: string, callbacks: GeminiLiveCallbacks) {
    this.deliveryId = deliveryId;
    this.callbacks = callbacks;
  }

  async start() {
    this.stopped = false;
    this.callbacks.onStateChange("connecting");
    try {
      const [tools, token] = await Promise.all([apiClient.liveTools(), apiClient.liveToken()]);

      await this.setupAudio();

      const model = token.model.startsWith("models/") ? token.model : `models/${token.model}`;
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token.token)}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        const functionDeclarations: FunctionDeclaration[] = tools.tools.flatMap((t) => t.function_declarations);
        ws.send(
          JSON.stringify({
            setup: {
              model,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: {
                parts: [
                  {
                    text: `${tools.system_instruction} The current delivery_id is "${this.deliveryId}" — always use exactly this value for the delivery_id parameter on every tool call, never ask the clerk for it.`,
                  },
                ],
              },
              tools: [{ functionDeclarations }],
            },
          })
        );
      };

      ws.onmessage = async (event) => {
        const text = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
        this.handleServerMessage(JSON.parse(text));
      };

      ws.onerror = () => {
        this.callbacks.onError("Voice connection error.");
        this.callbacks.onStateChange("error");
      };

      ws.onclose = () => {
        if (!this.stopped) {
          this.callbacks.onStateChange("error");
        }
      };

      this.callbacks.onStateChange("listening");
    } catch (err) {
      this.callbacks.onError((err as Error).message);
      this.callbacks.onStateChange("error");
      this.stop();
    }
  }

  stop() {
    this.stopped = true;
    this.handledToolCalls.clear();
    this.ws?.close();
    this.ws = null;
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    this.captureNode?.disconnect();
    this.playbackNode?.disconnect();
    this.captureContext?.close().catch(() => {});
    this.playbackContext?.close().catch(() => {});
    this.captureContext = null;
    this.playbackContext = null;
    this.callbacks.onStateChange("idle");
  }

  // Inject text for Gemini to speak aloud without it coming from a tool
  // call — used when a manager's decision arrives via SSE while the clerk
  // is mid-session, so they hear it in their earbuds per the pitch.
  sayAloud(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: `[System notice — relay this to the clerk verbatim, briefly]: ${text}` }] }],
          turnComplete: true,
        },
      })
    );
  }

  private async setupAudio() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.captureContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    await this.captureContext.audioWorklet.addModule("/worklets/capture-processor.js");
    const source = this.captureContext.createMediaStreamSource(this.micStream);
    this.captureNode = new AudioWorkletNode(this.captureContext, "capture-processor");
    this.captureNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const pcm16 = float32ToPcm16(event.data);
      const base64 = arrayBufferToBase64(pcm16.buffer);
      this.ws.send(
        JSON.stringify({
          realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` } },
        })
      );
    };
    source.connect(this.captureNode);

    this.playbackContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    await this.playbackContext.audioWorklet.addModule("/worklets/playback-processor.js");
    this.playbackNode = new AudioWorkletNode(this.playbackContext, "playback-processor");
    this.playbackNode.connect(this.playbackContext.destination);
  }

  private handleServerMessage(msg: Record<string, unknown>) {
    const serverContent = msg.serverContent as
      | { modelTurn?: { parts?: { inlineData?: { data: string } }[] }; interrupted?: boolean }
      | undefined;

    if (serverContent?.interrupted) {
      this.playbackNode?.port.postMessage("clear");
    }

    const parts = serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const int16 = base64ToInt16Array(part.inlineData.data);
        const float32 = pcm16ToFloat32(int16);
        this.playbackNode?.port.postMessage(float32);
      }
    }

    const toolCall = msg.toolCall as { functionCalls?: ToolCallPart[] } | undefined;
    if (toolCall?.functionCalls) {
      for (const call of toolCall.functionCalls) {
        // Live API messages can be replayed while a tool response is in
        // flight. Replaying log_line would create a second receipt line.
        // Function-call IDs are stable across those replayed messages.
        const callKey = call.id || `${call.name}:${JSON.stringify(call.args)}`;
        if (this.handledToolCalls.has(callKey)) continue;
        this.handledToolCalls.add(callKey);
        this.dispatchToolCall(call);
      }
    }
  }

  private async dispatchToolCall(call: ToolCallPart) {
    const args: Record<string, unknown> = { ...call.args, delivery_id: this.deliveryId };
    let result: unknown;
    try {
      switch (call.name) {
        case "log_line":
          result = await apiClient.logLine(args as unknown as LogLineRequest);
          break;
        case "report_damage": {
          const res = await apiClient.reportDamage(args as unknown as ReportDamageRequest);
          result = res;
          if (res.photo_requested && res.discrepancy_id) {
            this.callbacks.onPhotoRequested(res.discrepancy_id, (args.material_description as string) ?? "item");
          }
          break;
        }
        case "close_pallet":
          result = await apiClient.closePallet(args as unknown as ClosePalletRequest);
          break;
        case "delivery_status":
          result = await apiClient.deliveryStatus(this.deliveryId);
          break;
        default:
          result = { error: `Unknown tool: ${call.name}` };
      }
      const speech = (result as { speech?: string })?.speech;
      if (speech) this.callbacks.onSpeech(speech);
    } catch (err) {
      result = { error: (err as Error).message };
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: [{ id: call.id, name: call.name, response: { result } }],
        },
      })
    );
  }
}
