#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const FIRST_NAMES_URL = "https://data.gov.lv/dati/dataset/personu-vardi/resource/10f0bb84-dd18-44e9-9a80-dc1515a4b3a9/download/Vardi-dz-20260701.csv";
const SURNAMES_URL = "https://stat.gov.lv/system/files/other_format/2026-09/uzvardi_vesturiskas_zemes_2014_2023-2026.csv";
const DECLENSIONS_PATH = path.join(ROOT, "data/person-names/declension-classes.json");
const IRREGULAR_FORMS_PATH = path.join(ROOT, "data/person-names/irregular-forms.json");
const FIRST_OUTPUT = path.join(ROOT, "data/person-names/first-names.json");
const SURNAME_OUTPUT = path.join(ROOT, "data/person-names/surnames.json");

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function displayCase(value) {
  return String(value || "")
    .toLocaleLowerCase("lv-LV")
    .replace(/(^|[\s'’\-])([\p{L}])/gu, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase("lv-LV")}`);
}

function diacriticScore(value) {
  return (String(value).match(/[āčēģīķļņšūž]/gi) || []).length;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && (character === "," || character === ";" || character === "\t")) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const header = rows.shift().map((value) => normalize(value.replace(/^\uFEFF/, "")));
  return rows.map((values) => Object.fromEntries(header.map((key, index) => [key, (values[index] || "").trim()])));
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not download ${source}: ${response.status}`);
    return response.text();
  }
  return fs.readFile(source, "utf8");
}

function inferDeclension(value, gender) {
  const feminine = /^(F|female|sieviete)$/i.test(gender || "");
  if (/[š]$/i.test(value)) return "masculine-sh";
  if (/e$/i.test(value)) return feminine ? "feminine-e" : "masculine-s";
  if (/a$/i.test(value)) return "feminine-a";
  if (/is$/i.test(value)) return "masculine-is";
  if (/s$/i.test(value)) return "masculine-s";
  return "indeclinable";
}

function rootFor(value, declension, classes) {
  const suffix = classes[declension]?.suffixes?.[0];
  return suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function toId(value) {
  return normalize(value).replaceAll(" ", "_");
}

function makeEntries(records, valueKey, genderKey, countKey, classes, irregularForms) {
  const grouped = new Map();
  for (const record of records) {
    const value = displayCase(record[valueKey]?.trim());
    if (!value || /\s/.test(value)) continue;
    const declension = inferDeclension(value, record[genderKey]);
    const key = normalize(value);
    const current = grouped.get(key) || { value, declension, frequency: 0, gender: record[genderKey] || undefined };
    if (diacriticScore(value) > diacriticScore(current.value)) {
      current.value = value;
      current.declension = declension;
    }
    current.frequency += Number(record[countKey] || 0) || 0;
    if (!current.gender && record[genderKey]) current.gender = record[genderKey];
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .sort((a, b) => b.frequency - a.frequency || a.value.localeCompare(b.value, "lv"))
    .map((entry) => ({
      id: toId(entry.value),
      root: rootFor(entry.value, entry.declension, classes),
      declension: entry.declension,
      ...(irregularForms[toId(entry.value)] ? { overrides: irregularForms[toId(entry.value)] } : {}),
      ...(entry.gender ? { gender: entry.gender } : {}),
      ...(entry.frequency ? { frequency: entry.frequency } : {}),
    }));
}

async function main() {
  const [declensionData, irregularForms, firstCsv, surnameCsv] = await Promise.all([
    fs.readFile(DECLENSIONS_PATH, "utf8").then(JSON.parse),
    fs.readFile(IRREGULAR_FORMS_PATH, "utf8").then(JSON.parse),
    readSource(process.argv[2] || FIRST_NAMES_URL),
    readSource(process.argv[3] || SURNAMES_URL),
  ]);
  const firstRecords = parseCsv(firstCsv);
  const surnameRecords = parseCsv(surnameCsv);
  const firstNames = makeEntries(firstRecords, "vardi", "dzimums", "skaits", declensionData.classes, irregularForms);
  const latestSurnameYear = surnameRecords.reduce((latest, record) => Math.max(latest, Number(record.year) || 0), 0);
  const currentSurnameRecords = surnameRecords.filter((record) => Number(record.year) === latestSurnameYear);
  const surnames = makeEntries(currentSurnameRecords, "name", "sex", "numb", declensionData.classes, irregularForms);
  const generatedAt = new Date().toISOString();
  await fs.writeFile(FIRST_OUTPUT, `${JSON.stringify({ schemaVersion: 3, generatedAt, source: process.argv[2] || FIRST_NAMES_URL, entries: firstNames }, null, 2)}\n`);
  await fs.writeFile(SURNAME_OUTPUT, `${JSON.stringify({ schemaVersion: 3, generatedAt, source: process.argv[3] || SURNAMES_URL, entries: surnames }, null, 2)}\n`);
  console.log(`Generated ${firstNames.length} first names and ${surnames.length} surnames.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
