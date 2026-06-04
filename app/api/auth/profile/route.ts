import { NextRequest } from "next/server";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    return Response.json(
      {
        profile: adminUser.profile,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Admin profile API error]", error);
    return Response.json({ error: "No se pudo leer el perfil administrativo." }, { status: 500 });
  }
}
