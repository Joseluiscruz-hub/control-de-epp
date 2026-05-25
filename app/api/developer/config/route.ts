import { readFile, stat } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { AuthHttpError, getServerAdminEmails, getServerDeveloperEmails, requireDeveloperUser } from "@/lib/server-auth";

export const runtime = "nodejs";

function splitEmails(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function maskValue(value: string | undefined, visibleStart = 6, visibleEnd = 4) {
  if (!value) {
    return { configured: false, value: "No configurado" };
  }

  if (value.length <= visibleStart + visibleEnd) {
    return { configured: true, value: "*".repeat(value.length) };
  }

  return {
    configured: true,
    value: `${value.slice(0, visibleStart)}...${value.slice(-visibleEnd)}`,
  };
}

async function readRulesFile() {
  const rulesPath = path.join(process.cwd(), "firestore.rules");

  try {
    const [content, fileStat] = await Promise.all([
      readFile(rulesPath, "utf8"),
      stat(rulesPath),
    ]);

    return {
      available: true,
      path: "firestore.rules",
      content,
      bytes: Buffer.byteLength(content, "utf8"),
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return {
      available: false,
      path: "firestore.rules",
      content: "",
      bytes: 0,
      updatedAt: null,
    };
  }
}

function analyzeRules(content: string, configuredAdmins: string[]) {
  const missingAdmins = configuredAdmins.filter((email) => !content.includes(`'${email}'`) && !content.includes(`"${email}"`));
  const hasLockedKioskRequests = /match\s+\/kiosk_requests\/\{requestId\}[\s\S]*?allow\s+create:\s+if\s+false;/.test(content);
  const hasLockedPinAttempts = /match\s+\/kiosk_pin_attempts\/\{attemptId\}[\s\S]*?allow\s+read,\s+write:\s+if\s+false;/.test(content);

  return {
    missingAdmins,
    hasLockedKioskRequests,
    hasLockedPinAttempts,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireDeveloperUser(req);
    const serverAdminEmails = getServerAdminEmails();
    const developerEmails = getServerDeveloperEmails();
    const publicAdminEmails = splitEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS);
    const rules = await readRulesFile();
    const rulesAnalysis = analyzeRules(rules.content, serverAdminEmails);
    const kioskSecretLength = process.env.KIOSK_SESSION_SECRET?.length ?? 0;

    return Response.json({
      user: {
        uid: user.uid,
        email: user.email,
        isDeveloper: developerEmails.includes(user.email),
        isServerAdmin: serverAdminEmails.includes(user.email),
      },
      firebase: {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
        databaseId: process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)",
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: maskValue(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
        appId: maskValue(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
        apiKey: maskValue(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      },
      permissions: {
        publicAdminEmails: publicAdminEmails.length > 0 ? publicAdminEmails : serverAdminEmails,
        serverAdminEmails,
        developerEmails,
        missingAdminsInRules: rulesAnalysis.missingAdmins,
      },
      runtime: {
        nodeEnv: process.env.NODE_ENV || "development",
        googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "",
        service: process.env.K_SERVICE || "",
        revision: process.env.K_REVISION || "",
        region: process.env.K_REGION || "",
      },
      secrets: {
        kioskSessionSecret: {
          configured: kioskSecretLength > 0,
          lengthOk: kioskSecretLength >= 32,
          length: kioskSecretLength,
        },
        geminiApiKey: {
          configured: Boolean(process.env.GEMINI_API_KEY),
        },
        firebaseServiceAccountJson: {
          configured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
        },
      },
      rules: {
        ...rules,
        hasLockedKioskRequests: rulesAnalysis.hasLockedKioskRequests,
        hasLockedPinAttempts: rulesAnalysis.hasLockedPinAttempts,
      },
      links: {
        firebaseRules: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
          ? `https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/firestore/rules`
          : "",
        githubActions: "https://github.com/Joseluiscruz-hub/control-de-epp/actions",
        githubSecrets: "https://github.com/Joseluiscruz-hub/control-de-epp/settings/secrets/actions",
      },
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Developer config API error]", error);
    return Response.json({ error: "No se pudo cargar la configuración de desarrollador." }, { status: 500 });
  }
}
