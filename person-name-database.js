(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const firstNames = require("./data/person-names/first-names.json");
    const surnames = require("./data/person-names/surnames.json");
    const declensionClasses = require("./data/person-names/declension-classes.json");
    module.exports = factory(firstNames, surnames, declensionClasses);
    return;
  }
  root.PersonNameDatabase = factory(null, null, null);
})(typeof globalThis !== "undefined" ? globalThis : this, function (firstNamesData, surnamesData, declensionData) {
  function deriveForms(entry, declensions = declensionData) {
    const declension = declensions?.classes?.[entry.declension];
    if (!declension) {
      return [entry.root];
    }
    const cases = declensions.cases || ["nominative", "genitive", "dative", "accusative", "locative"];
    const overrides = entry.overrides || {};
    return [...new Set(declension.suffixes.map((suffix, index) => {
      const caseName = cases[index];
      return overrides[caseName] || `${entry.root}${suffix}`;
    }))];
  }

  function indexEntries(data, declensions) {
    return Object.fromEntries((data?.entries || []).map((entry) => {
      const forms = deriveForms(entry, declensions);
      return [entry.id, { canonical: forms[0], root: entry.root, declension: entry.declension, gender: entry.gender, forms }];
    }));
  }

  function createDatabase(firstNames, surnameEntries, declensions) {
    return { firstNames: indexEntries(firstNames, declensions), surnames: indexEntries(surnameEntries, declensions) };
  }

  async function load() {
    if (firstNamesData && surnamesData && declensionData) {
      return createDatabase(firstNamesData, surnamesData, declensionData);
    }
    const [firstResponse, surnameResponse, declensionResponse] = await Promise.all([
      fetch("./data/person-names/first-names.json?v=0.1.7"),
      fetch("./data/person-names/surnames.json?v=0.1.7"),
      fetch("./data/person-names/declension-classes.json?v=0.1.7"),
    ]);
    if (!firstResponse.ok || !surnameResponse.ok || !declensionResponse.ok) {
      throw new Error("Person-name database files could not be loaded.");
    }
    return createDatabase(await firstResponse.json(), await surnameResponse.json(), await declensionResponse.json());
  }

  return Object.freeze({
    createDatabase,
    deriveForms,
    load,
    ...(firstNamesData && surnamesData && declensionData
      ? createDatabase(firstNamesData, surnamesData, declensionData)
      : { firstNames: {}, surnames: {} }),
  });
});
