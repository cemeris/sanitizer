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

  // The database is intentionally local and explicit. Keep the outer shape
  // nested (first name -> surname) so lookup does not require scanning every
  // person in the dictionary. Forms are stored without case significance.
  const LATVIAN_PERSON_NAME_DATABASE = Object.freeze({
    janis: Object.freeze({
      berzins: Object.freeze({ firstName: "Jānis", lastName: "Bērziņš", forms: ["Jānis Bērziņš", "Jāņa Bērziņa", "Jānim Bērziņam", "Jāni Bērziņu", "Jānī Bērziņā"] }),
    }),
    anna: Object.freeze({
      kalnina: Object.freeze({ firstName: "Anna", lastName: "Kalniņa", forms: ["Anna Kalniņa", "Annas Kalniņas", "Annai Kalniņai", "Annu Kalniņu", "Annā Kalniņā"] }),
    }),
    andris: Object.freeze({
      ozols: Object.freeze({ firstName: "Andris", lastName: "Ozols", forms: ["Andris Ozols", "Andra Ozola", "Andrim Ozolam", "Andri Ozolu", "Andrī Ozolā"] }),
    }),
    liga: Object.freeze({
      ozolina: Object.freeze({ firstName: "Līga", lastName: "Ozoliņa", forms: ["Līga Ozoliņa", "Līgas Ozoliņas", "Līgai Ozoliņai", "Līgu Ozoliņu", "Līgā Ozoliņā"] }),
    }),
    ilze: Object.freeze({
      jansone: Object.freeze({ firstName: "Ilze", lastName: "Jansone", forms: ["Ilze Jansone", "Ilzes Jansones", "Ilzei Jansonei", "Ilzi Jansoni", "Ilzē Jansone"] }),
    }),
    maris: Object.freeze({
      liepins: Object.freeze({ firstName: "Māris", lastName: "Liepiņš", forms: ["Māris Liepiņš", "Māra Liepiņa", "Mārim Liepiņam", "Māri Liepiņu", "Mārī Liepiņā"] }),
    }),
  });

  function normalizeNamePart(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function isMarkdownTableSeparatorLine(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function unescapedPipeIndexes(line) {
    const indexes = [];
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== "|") {
        continue;
      }
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
        backslashes += 1;
      }
      if (backslashes % 2 === 0) {
        indexes.push(index);
      }
    }
    return indexes;
  }

  function markdownTableCellRanges(line) {
    const ranges = [];
    const pipes = unescapedPipeIndexes(line);
    let start = 0;
    for (const pipe of pipes) {
      if (!(start === 0 && pipe === 0)) {
        ranges.push([start, pipe]);
      }
      start = pipe + 1;
    }
    if (start < line.length) {
      ranges.push([start, line.length]);
    }
    return ranges;
  }

  function extractMarkdownTableCells(markdown) {
    const lines = String(markdown || "").replaceAll("\r\n", "\n").split("\n");
    const cells = [];

    for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
      if (isMarkdownTableSeparatorLine(lines[lineIndex + 1])) {
        if (unescapedPipeIndexes(lines[lineIndex]).length === 0) {
          continue;
        }

        const tableStart = lineIndex;
        let tableEnd = lineIndex + 1;
        while (tableEnd + 1 < lines.length && unescapedPipeIndexes(lines[tableEnd + 1]).length > 0) {
          tableEnd += 1;
        }

        for (let currentLine = tableStart; currentLine <= tableEnd; currentLine += 1) {
          if (currentLine === tableStart + 1) {
            continue;
          }
          const line = lines[currentLine];
          for (const [cellIndex, [start, end]] of markdownTableCellRanges(line).entries()) {
            const value = line.slice(start, end).trim();
            if (value) {
              cells.push({ value, lineIndex: currentLine, cellIndex });
            }
          }
        }
        lineIndex = tableEnd;
      }
    }
    return cells;
  }

  function maskMarkdownTables(markdown) {
    const source = String(markdown || "").replaceAll("\r\n", "\n");
    const lines = source.split("\n");
    const cells = extractMarkdownTableCells(source);
    const linesToMask = new Map();
    for (const cell of cells) {
      if (!linesToMask.has(cell.lineIndex)) {
        linesToMask.set(cell.lineIndex, true);
      }
    }

    for (const lineIndex of linesToMask.keys()) {
      const line = lines[lineIndex];
      const chars = line.split("");
      for (const [start, end] of markdownTableCellRanges(line)) {
        for (let index = start; index < end; index += 1) {
          const escapedPipe = chars[index] === "|" && index > 0 && chars[index - 1] === "\\";
          if (chars[index] !== "\\" && !escapedPipe) {
            chars[index] = " ";
          }
        }
      }
      lines[lineIndex] = chars.join("");
    }
    return lines.join("\n");
  }

  function buildPersonNameIndex(database = LATVIAN_PERSON_NAME_DATABASE) {
    const entries = [];
    for (const [firstKey, surnames] of Object.entries(database || {})) {
      for (const [lastKey, person] of Object.entries(surnames || {})) {
        const forms = [...new Set([...(person.forms || []), `${person.firstName} ${person.lastName}`])]
          .filter(Boolean)
          .sort((a, b) => b.length - a.length);
        entries.push({
          key: `${firstKey}:${lastKey}`,
          canonical: `${person.firstName} ${person.lastName}`,
          forms,
          pattern: new RegExp(`(?<![\\p{L}])(?:${forms.map(escapeRegex).join("|")})(?![\\p{L}])`, "giu"),
        });
      }
    }
    return entries;
  }

  function detectPersonNames(text, database = LATVIAN_PERSON_NAME_DATABASE) {
    const source = String(text || "");
    const matches = [];
    for (const person of buildPersonNameIndex(database)) {
      for (const match of source.matchAll(person.pattern)) {
        matches.push({
          type: "person_name",
          value: match[0],
          canonical: person.canonical,
          personKey: person.key,
          index: match.index,
        });
      }
    }
    return matches.sort((a, b) => a.index - b.index || b.value.length - a.value.length);
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
    isMarkdownTableSeparatorLine,
    extractMarkdownTableCells,
    maskMarkdownTables,
    LATVIAN_PERSON_NAME_DATABASE,
    normalizeNamePart,
    buildPersonNameIndex,
    detectPersonNames,
    isVariableNameValid,
    suggestVariableName,
    createVariable,
    restoreVariable,
    restoreAll,
  };
});
