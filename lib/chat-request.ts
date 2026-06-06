export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export type ChatMessageParseResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

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

  return { ok: true, message };
}
