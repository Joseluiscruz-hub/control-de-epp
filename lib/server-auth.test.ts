import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { NextRequest } from "next/server";

const mockVerifyIdToken = mock.fn();
const mockGet = mock.fn();

mock.module("./firebase-admin", {
  namedExports: {
    getAdminAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
    getAdminDb: () => ({
      collection: () => ({ doc: () => ({ get: mockGet }) }),
    }),
  },
});

const serverAuthModule = import("./server-auth");

async function getServerAuth() {
  return serverAuthModule;
}

function makeRequest(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return { headers } as unknown as NextRequest;
}

function makeDecodedToken(overrides: Record<string, unknown> = {}) {
  return { uid: "uid-123", email: "admin@example.com", name: "Admin Test", ...overrides };
}

function makeProfileSnap(data: Record<string, unknown> | null) {
  return {
    exists: data !== null,
    data: () => data ?? undefined,
  };
}

describe("requireAdminUser", () => {
  it("lanza AuthHttpError 401 si no hay Authorization header", async () => {
    const { AuthHttpError, requireAdminUser } = await getServerAuth();
    await assert.rejects(
      () => requireAdminUser(makeRequest()),
      (error) => error instanceof AuthHttpError && error.status === 401
    );
  });

  it("lanza AuthHttpError 401 si el token es invalido", async () => {
    const { AuthHttpError, requireAdminUser } = await getServerAuth();
    mockVerifyIdToken.mock.mockImplementationOnce(async () => {
      throw new Error("invalid token");
    });

    await assert.rejects(
      () => requireAdminUser(makeRequest("bad-token")),
      (error) => error instanceof AuthHttpError && error.status === 401
    );
  });

  it("lanza AuthHttpError 403 si la cuenta no tiene email", async () => {
    const { AuthHttpError, requireAdminUser } = await getServerAuth();
    mockVerifyIdToken.mock.mockImplementationOnce(async () => makeDecodedToken({ email: undefined }));

    await assert.rejects(
      () => requireAdminUser(makeRequest("valid-token")),
      (error) => error instanceof AuthHttpError && error.status === 403
    );
  });

  it("lanza AuthHttpError 403 si el perfil esta desactivado", async () => {
    const { AuthHttpError, requireAdminUser } = await getServerAuth();
    mockVerifyIdToken.mock.mockImplementationOnce(async () => makeDecodedToken());
    mockGet.mock.mockImplementationOnce(async () =>
      makeProfileSnap({ role: "admin_local", plantaId: "cuautitlan", active: false })
    );

    await assert.rejects(
      () => requireAdminUser(makeRequest("valid-token")),
      (error) => error instanceof AuthHttpError && error.status === 403
    );
  });

  it("retorna AdminSession para admin_local con perfil valido", async () => {
    const { requireAdminUser } = await getServerAuth();
    mockVerifyIdToken.mock.mockImplementationOnce(async () => makeDecodedToken());
    mockGet.mock.mockImplementationOnce(async () =>
      makeProfileSnap({ role: "admin_local", plantaId: "cuautitlan", active: true })
    );

    const session = await requireAdminUser(makeRequest("valid-token"));
    assert.equal(session.uid, "uid-123");
    assert.equal(session.email, "admin@example.com");
    assert.equal(session.role, "admin_local");
    assert.equal(session.plantaId, "cuautitlan");
  });
});

describe("requireGlobalAdminUser", () => {
  it("lanza 403 si el usuario es admin_local", async () => {
    const { AuthHttpError, requireGlobalAdminUser } = await getServerAuth();
    mockVerifyIdToken.mock.mockImplementationOnce(async () => makeDecodedToken());
    mockGet.mock.mockImplementationOnce(async () =>
      makeProfileSnap({ role: "admin_local", plantaId: "toluca", active: true })
    );

    await assert.rejects(
      () => requireGlobalAdminUser(makeRequest("valid-token")),
      (error) => error instanceof AuthHttpError && error.status === 403
    );
  });
});

describe("canAdminUsePlant", () => {
  it("global admin puede usar cualquier planta", async () => {
    const { canAdminUsePlant } = await getServerAuth();
    const globalAdmin = { role: "admin_global", plantaId: "nacional" } as Parameters<typeof canAdminUsePlant>[0];

    assert.equal(canAdminUsePlant(globalAdmin, "toluca"), true);
    assert.equal(canAdminUsePlant(globalAdmin, "cuautitlan"), true);
    assert.equal(canAdminUsePlant(globalAdmin, null), true);
  });

  it("local admin solo puede usar su planta", async () => {
    const { canAdminUsePlant } = await getServerAuth();
    const localAdmin = { role: "admin_local", plantaId: "cuautitlan" } as Parameters<typeof canAdminUsePlant>[0];

    assert.equal(canAdminUsePlant(localAdmin, "cuautitlan"), true);
    assert.equal(canAdminUsePlant(localAdmin, "toluca"), false);
  });

  it("local admin puede usar plantaId null o undefined", async () => {
    const { canAdminUsePlant } = await getServerAuth();
    const localAdmin = { role: "admin_local", plantaId: "cuautitlan" } as Parameters<typeof canAdminUsePlant>[0];

    assert.equal(canAdminUsePlant(localAdmin, null), true);
    assert.equal(canAdminUsePlant(localAdmin, undefined), true);
  });
});
