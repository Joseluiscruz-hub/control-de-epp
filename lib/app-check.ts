import type { NextRequest } from "next/server";
import { getAdminAppCheck } from "@/lib/firebase-admin";

export class AppCheckHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AppCheckHttpError";
    this.status = status;
  }
}

export async function requireAppCheck(req: NextRequest) {
  if (process.env.FIREBASE_APP_CHECK_REQUIRED !== "true") return;

  const token = req.headers.get("x-firebase-appcheck");
  if (!token) {
    throw new AppCheckHttpError("App Check requerido.", 401);
  }

  try {
    await getAdminAppCheck().verifyToken(token);
  } catch {
    throw new AppCheckHttpError("App Check invalido.", 403);
  }
}
