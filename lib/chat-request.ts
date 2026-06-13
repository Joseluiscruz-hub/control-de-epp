import { isPlantId, type PlantScope } from "./plants";

export const MAX_CHAT_MESSAGE_LENGTH = 2000;
export const MAX_CHAT_HISTORY_MESSAGES = 8;
export const MAX_CHAT_HISTORY_MESSAGE_LENGTH = 1000;
export const MAX_CHAT_HISTORY_TOTAL_LENGTH = 5000;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatMessageParseResult =
  | {
      ok: true;
      message: string;
      history: ChatHistoryMessage[];
      plantaId: PlantScope;
    }
  | { ok: false; error: string };

function parsePlantScope(value: unknown): PlantScope | null {
  if (value === undefined || value === null || value === "" || value === "todas" || value === "nacional") {
    return "nacional";
  }
  return isPlantId(value) ? value : null;
}

function parseHistory(value: unknown): ChatHistoryMessage[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CHAT_HISTORY_MESSAGES) return null;

  const history: ChatHistoryMessage[] = [];
  let totalLength = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const role = "role" in entry ? entry.role : null;
    const content = "content" in entry && typeof entry.content === "string"
      ? entry.content.trim()
      : "";
    if ((role !== "user" && role !== "assistant") || !content || content.length > MAX_CHAT_HISTORY_MESSAGE_LENGTH) {
      return null;
    }
    totalLength += content.length;
    if (totalLength > MAX_CHAT_HISTORY_TOTAL_LENGTH) return null;
    history.push({ role, content });
  }
  return history;
}

export function parseChatMessageInput(body: unknown): ChatMessageParseResult {
  const message =
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message?: unknown }).message === "string"
      ? (body as { message: string }).message.trim()
      : "";

  if (!message || message.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { ok: false, error: "Mensaje requerido de maximo 2000 caracteres." };
  }

  const history = body && typeof body === "object" && "history" in body
    ? parseHistory((body as { history?: unknown }).history)
    : [];
  if (!history) {
    return { ok: false, error: "Historial de conversacion invalido." };
  }

  const plantaId = body && typeof body === "object" && "plantaId" in body
    ? parsePlantScope((body as { plantaId?: unknown }).plantaId)
    : "nacional";
  if (!plantaId) {
    return { ok: false, error: "Planta de consulta invalida." };
  }

  return { ok: true, message, history, plantaId };
}
