import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CHAT_MESSAGE_LENGTH, parseChatMessageInput } from "./chat-request";

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
    });
  });
});
