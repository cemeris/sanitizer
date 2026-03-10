const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../sanitizer-core.js");

test("createVariable replaces only selected match when replaceAll=false", () => {
  const text = "Alice sent email to Alice.";
  const start = text.indexOf("Alice");
  const end = start + "Alice".length;

  const result = core.createVariable({
    text,
    start,
    end,
    name: "client_name",
    replaceAll: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "{client_name} sent email to Alice.");
  assert.equal(result.placeholderCount, 1);
});

test("createVariable replaces all exact matches when replaceAll=true", () => {
  const text = "Alice sent email to Alice.";
  const start = text.indexOf("Alice");
  const end = start + "Alice".length;

  const result = core.createVariable({
    text,
    start,
    end,
    name: "client_name",
    replaceAll: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, "{client_name} sent email to {client_name}.");
  assert.equal(result.placeholderCount, 2);
});

test("restoreVariable puts original value back deterministically", () => {
  const text = "Hello {client_name}, {client_name} agreed.";
  const result = core.restoreVariable(text, "client_name", "Alice");

  assert.equal(result.text, "Hello Alice, Alice agreed.");
  assert.equal(result.replaced, 2);
});

test("restoreAll restores all placeholders", () => {
  const text = "{client_name} signed on {contract_date}.";
  const result = core.restoreAll(text, [
    { name: "client_name", value: "Alice" },
    { name: "contract_date", value: "2026-03-10" },
  ]);

  assert.equal(result.text, "Alice signed on 2026-03-10.");
  assert.equal(result.replacedTotal, 2);
});

test("variable name validation is deterministic", () => {
  assert.equal(core.isVariableNameValid("client_name"), true);
  assert.equal(core.isVariableNameValid("clientName"), false);
  assert.equal(core.isVariableNameValid("1name"), false);
  assert.equal(core.isVariableNameValid("client-name"), false);
});
