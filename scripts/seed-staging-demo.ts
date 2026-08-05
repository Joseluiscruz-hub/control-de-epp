import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  buildStagingDemoDocuments,
  validateStagingDemoTarget,
} from "../lib/staging-demo-seed";

function readArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function printPlanSummary(documents: ReturnType<typeof buildStagingDemoDocuments>) {
  const byCollection = new Map<string, number>();
  for (const document of documents) {
    byCollection.set(document.collection, (byCollection.get(document.collection) ?? 0) + 1);
  }

  console.log("Staging demo seed plan:");
  for (const [collection, count] of Array.from(byCollection.entries()).sort()) {
    console.log(`  ${collection}: ${count}`);
  }
  console.log(`  total: ${documents.length}`);
}

async function main() {
  const projectId = readArgument("project");
  const databaseId = readArgument("database") || "(default)";
  const confirmation = readArgument("confirm");
  const apply = process.argv.includes("--apply");
  const target = validateStagingDemoTarget({ projectId, databaseId, confirmation });
  const documents = buildStagingDemoDocuments();

  console.log(`Target project: ${target.projectId}`);
  console.log(`Target database: ${target.databaseId}`);
  printPlanSummary(documents);

  if (!apply) {
    console.log("Dry run only. Add --apply to create missing demo documents.");
    return;
  }

  const app = initializeApp(
    {
      credential: applicationDefault(),
      projectId: target.projectId,
    },
    `staging-demo-seed-${process.pid}`
  );

  try {
    const db = target.databaseId === "(default)"
      ? getFirestore(app)
      : getFirestore(app, target.databaseId);
    const refs = documents.map((document) => db.collection(document.collection).doc(document.id));
    const snapshots = await db.getAll(...refs);
    const missing = documents.filter((_, index) => !snapshots[index].exists);

    if (missing.length === 0) {
      console.log(`No writes needed. All ${documents.length} demo documents already exist.`);
      return;
    }

    const batch = db.batch();
    for (const document of missing) {
      batch.create(db.collection(document.collection).doc(document.id), document.data);
    }
    await batch.commit();

    console.log(`Created ${missing.length} demo documents.`);
    console.log(`Skipped ${documents.length - missing.length} existing documents.`);
  } finally {
    await deleteApp(app);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
