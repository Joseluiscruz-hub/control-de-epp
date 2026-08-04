import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStagingDemoDocuments,
  validateStagingDemoTarget,
} from "./staging-demo-seed";

test("only accepts explicitly confirmed isolated staging targets", () => {
  assert.deepEqual(
    validateStagingDemoTarget({
      projectId: "assetguard-staging-jlc",
      databaseId: "(default)",
      confirmation: "assetguard-staging-jlc",
    }),
    { projectId: "assetguard-staging-jlc", databaseId: "(default)" }
  );

  assert.throws(() => validateStagingDemoTarget({
    projectId: "gen-lang-client-0970386796",
    databaseId: "(default)",
    confirmation: "gen-lang-client-0970386796",
  }));
  assert.throws(() => validateStagingDemoTarget({
    projectId: "assetguard-staging-jlc",
    databaseId: "production-named-db",
    confirmation: "assetguard-staging-jlc",
  }));
  assert.throws(() => validateStagingDemoTarget({
    projectId: "assetguard-staging-jlc",
    databaseId: "(default)",
    confirmation: "wrong-project",
  }));
});

test("builds a unique fictional dataset with public catalog minimization", () => {
  const documents = buildStagingDemoDocuments(new Date("2026-08-04T12:00:00.000Z"));
  const keys = documents.map((document) => `${document.collection}/${document.id}`);
  assert.equal(new Set(keys).size, keys.length);

  const employees = documents.filter((document) => document.collection === "employees");
  assert.equal(employees.length, 4);
  assert.ok(employees.every((document) => document.id.startsWith("9000000")));
  assert.ok(employees.every((document) => document.data.demoData === true));

  const privateSleeves = documents.filter((document) => (
    document.collection === "ppe_catalog" &&
    (document.data.material === "26008560" || document.data.material === "26008561")
  ));
  assert.equal(privateSleeves.length, 4);
  assert.ok(privateSleeves.every((document) => document.data.stock === 25));
  assert.ok(privateSleeves.every((document) => document.data.unitsPerPackage === 25));
  assert.ok(privateSleeves.every((document) => document.data.stockPackageInput === 1));

  const publicCatalog = documents.filter((document) => document.collection === "kiosk_catalog");
  const forbiddenPublicFields = [
    "unitCost",
    "location",
    "material",
    "durationRuleSapMaterial",
    "stock",
    "minStock",
    "reorderPoint",
    "stockPackageInput",
    "packageRuleId",
  ];
  assert.equal(publicCatalog.length, 8);
  assert.ok(publicCatalog.every((document) => (
    forbiddenPublicFields.every((field) => !(field in document.data))
  )));

  assert.ok(documents.some((document) => (
    document.collection === "kiosk_requests" && document.data.status === "pending"
  )));
  assert.ok(documents.some((document) => (
    document.collection === "assignments" && document.data.status === "active"
  )));
});
