import { setTimeout as delay } from "node:timers/promises";


const serviceUrl = process.env.SERVICE_URL?.replace(/\/$/, "");
const expectedProject = process.env.FIREBASE_PROJECT_ID;
const expectedDatabase = process.env.FIREBASE_DATABASE_ID;

if (!serviceUrl || !expectedProject || !expectedDatabase) {
  throw new Error("SERVICE_URL, FIREBASE_PROJECT_ID, and FIREBASE_DATABASE_ID are required.");
}

async function request(path, expectedStatus, headers = {}) {
  const url = new URL(path, `${serviceUrl}/`);
  let lastError;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt < 7) {
        await delay(5_000);
        continue;
      }
      break;
    }

    const body = await response.text();
    if ([500, 502, 503, 504].includes(response.status) && attempt < 7) {
      await delay(5_000);
      continue;
    }
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected HTTP ${expectedStatus} from ${url}, got ${response.status}: ${body.slice(0, 500)}`,
      );
    }
    return { body, headers: response.headers };
  }

  throw new Error(`Smoke request failed for ${url}: ${lastError}`);
}

const configResponse = await request("/firebase-config.json", 200);
const config = JSON.parse(configResponse.body);
if (config.projectId !== expectedProject) {
  throw new Error("Runtime Firebase project does not match the protected environment.");
}
if (config.firestoreDatabaseId !== expectedDatabase) {
  throw new Error("Runtime Firestore database does not match the protected environment.");
}
if (!configResponse.headers.get("cache-control")?.toLowerCase().includes("no-store")) {
  throw new Error("Runtime Firebase configuration must not be cached.");
}
if (configResponse.headers.get("cross-origin-opener-policy")?.toLowerCase() !== "same-origin-allow-popups") {
  throw new Error("Expected the Google popup-compatible COOP header.");
}

await request("/api/kiosk/session", 401, {
  "Sec-Fetch-Site": "same-origin",
});

const crossSiteResponse = await request("/api/kiosk/session", 403, {
  "Sec-Fetch-Site": "cross-site",
});
if (crossSiteResponse.headers.get("set-cookie")) {
  throw new Error("A rejected cross-site request must not emit cookies.");
}

console.log(
  `Smoke tests passed for ${serviceUrl} (${expectedProject}/${expectedDatabase}).`,
);
