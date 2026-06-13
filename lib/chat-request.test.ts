import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_LENGTH,
  parseChatMessageInput,
} from "./chat-request";

describe("parseChatMessageInput", () => {
  it("rechaza mensajes vacios o no textuales", () => {
    assert.deepEqual(parseChatMessageInput({ message: "   " }), {
      ok: false,
      error: "Mensaje requerido de maximo 2000 caracteres.",
    });
    assert.deepEqual(parseChatMessageInput({ message: 123 }), {
      ok: false,
      error: "Mensaje requerido de maximo 2000 caracteres.",
    });
  });

  it("rechaza mensajes demasiado largos", () => {
    assert.deepEqual(parseChatMessageInput({ message: "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) }), {
      ok: false,
      error: "Mensaje requerido de maximo 2000 caracteres.",
    });
  });

  it("recorta espacios y devuelve el mensaje valido", () => {
    assert.deepEqual(parseChatMessageInput({ message: "  stock critico por planta  " }), {
      ok: true,
      message: "stock critico por planta",
      history: [],
      plantaId: "nacional",
    });
  });

  it("acepta historial acotado y normaliza vista global", () => {
    assert.deepEqual(parseChatMessageInput({
      message: "continua",
      plantaId: "todas",
      history: [
        { role: "user", content: "  revisa guantes  " },
        { role: "assistant", content: "Hay stock bajo." },
      ],
    }), {
      ok: true,
      message: "continua",
      plantaId: "nacional",
      history: [
        { role: "user", content: "revisa guantes" },
        { role: "assistant", content: "Hay stock bajo." },
      ],
    });
  });

  it("rechaza historial excesivo y plantas desconocidas", () => {
    assert.deepEqual(parseChatMessageInput({
      message: "hola",
      history: Array.from({ length: MAX_CHAT_HISTORY_MESSAGES + 1 }, () => ({ role: "user", content: "x" })),
    }), { ok: false, error: "Historial de conversacion invalido." });

    assert.deepEqual(parseChatMessageInput({ message: "hola", plantaId: "otra" }), {
      ok: false,
      error: "Planta de consulta invalida.",
    });
  });
});
