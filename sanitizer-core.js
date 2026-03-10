(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.SanitizerCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function countOccurrences(text, needle) {
    if (!needle) {
      return 0;
    }
    return text.split(needle).length - 1;
  }

  function replaceAllExact(text, value, replacement) {
    if (!value) {
      return text;
    }
    return text.split(value).join(replacement);
  }

  function isVariableNameValid(name) {
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  function suggestVariableName(value) {
    const cleaned = String(value)
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "");

    if (!cleaned) {
      return "value";
    }
    if (/^[0-9]/.test(cleaned)) {
      return `value_${cleaned}`;
    }
    return cleaned.slice(0, 40);
  }

  function createVariable(input) {
    const text = String(input.text || "");
    const start = Number(input.start || 0);
    const end = Number(input.end || 0);
    const name = String(input.name || "").trim();
    const replaceAll = Boolean(input.replaceAll);

    if (!isVariableNameValid(name)) {
      return {
        ok: false,
        reason: "invalid_name",
      };
    }

    if (start < 0 || end > text.length || end <= start) {
      return {
        ok: false,
        reason: "invalid_selection",
      };
    }

    const selected = text.slice(start, end);
    if (!selected.trim()) {
      return {
        ok: false,
        reason: "empty_selection",
      };
    }

    const placeholder = `{${name}}`;
    let nextText = `${text.slice(0, start)}${placeholder}${text.slice(end)}`;

    if (replaceAll) {
      nextText = replaceAllExact(nextText, selected, placeholder);
    }

    return {
      ok: true,
      selected,
      placeholder,
      text: nextText,
      placeholderCount: countOccurrences(nextText, placeholder),
    };
  }

  function restoreVariable(text, name, value) {
    const placeholder = `{${name}}`;
    const count = countOccurrences(text, placeholder);
    return {
      text: replaceAllExact(text, placeholder, value),
      replaced: count,
      placeholder,
    };
  }

  function restoreAll(text, variables) {
    let nextText = text;
    let replacedTotal = 0;

    for (const entry of variables) {
      const result = restoreVariable(nextText, entry.name, entry.value);
      nextText = result.text;
      replacedTotal += result.replaced;
    }

    return {
      text: nextText,
      replacedTotal,
    };
  }

  return {
    countOccurrences,
    replaceAllExact,
    isVariableNameValid,
    suggestVariableName,
    createVariable,
    restoreVariable,
    restoreAll,
  };
});
