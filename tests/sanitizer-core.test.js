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

test("detectPersonNames finds configured Latvian case forms", () => {
  const result = core.detectPersonNames("Vēstule nosūtīta Jāņa Bērziņa vārdā.");

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "person_name");
  assert.equal(result[0].value, "Jāņa Bērziņa");
  assert.equal(result[0].canonical, "Jānis Bērziņš");
});

test("person-name database is nested and supports multiple configured people", () => {
  assert.ok(core.PERSON_NAME_DATABASE.firstNames.janis);
  assert.ok(core.PERSON_NAME_DATABASE.surnames.berzins);
  const result = core.detectPersonNames("Anna Kalniņa un Andra Ozola.");

  assert.deepEqual(result.map((match) => match.value), ["Anna Kalniņa", "Andra Ozola"]);
});

test("person-name database derives inflections from declension classes", () => {
  const database = require("../person-name-database.js");
  const forms = database.firstNames.janis.forms;

  assert.deepEqual(forms, ["Jānis", "Jāņa", "Jānim", "Jāni", "Jānī"]);
  assert.deepEqual(database.surnames.berzins.forms, ["Bērziņš", "Bērziņa", "Bērziņam", "Bērziņu", "Bērziņā"]);
  assert.equal(require("../data/person-names/first-names.json").entries.find((entry) => entry.id === "anna").root, "Ann");
});

test("person-name recognition supports a known surname with a new first name", () => {
  const result = core.detectPersonNames("Dokumentu parakstīja Edgars Ozoliņš.");

  assert.equal(result.length, 1);
  assert.equal(result[0].value, "Edgars Ozoliņš");
  assert.equal(result[0].canonical, "Edgars Ozoliņš");
});

test("person-name recognition supports a known first name with a new surname", () => {
  const result = core.detectPersonNames("Sazināties ar Jānis Kalvītis.");

  assert.equal(result.length, 1);
  assert.equal(result[0].value, "Jānis Kalvītis");
});

test("a full adjacent name and surname is one candidate, while a standalone name remains one candidate", () => {
  const pair = core.detectPersonNames("Jānis Bērziņš");
  const standalone = core.detectPersonNames("Jānis ieradās.");

  assert.deepEqual(pair.map((match) => match.value), ["Jānis Bērziņš"]);
  assert.deepEqual(standalone.map((match) => match.value), ["Jānis"]);
});

test("markdown table cells are extracted without treating escaped pipes as delimiters", () => {
  const markdown = "| Klients | Apraksts |\n| --- | --- |\n| Jānis Bērziņš | SIA Example \\| nodaļa |";
  const cells = core.extractMarkdownTableCells(markdown);

  assert.deepEqual(cells.map((cell) => cell.value), [
    "Klients",
    "Apraksts",
    "Jānis Bērziņš",
    "SIA Example \\| nodaļa",
  ]);
  const masked = core.maskMarkdownTables(markdown);
  assert.match(masked, /^\|\s+\|\s+\|$/m);
  assert.match(masked, /\\\|/);
  assert.match(masked, /\| --- \| --- \|/);
});
