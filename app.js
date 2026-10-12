const DB_NAME = "sanitizer-db";
const DB_VERSION = 1;
const UI_STATE_KEY = "sanitizer.ui-state.v1";
const CLEAR_ON_NEXT_LOAD_KEY = "sanitizer.clear-on-next-load";

const state = {
  projects: [],
  files: [],
  activeProjectId: null,
  activeFileId: null,
  saveTimer: null,
  statusTimer: null,
  sidebarOpen: false,
  activeSidebarView: "projects",
  region: "lv",
  detectQueue: [],
  detectIndex: 0,
  detecting: false,
  retention: "keep",
  exportFormat: "docx",
};

const els = {
  status: document.getElementById("status"),
  projectsViewBtn: document.getElementById("projectsViewBtn"),
  filesViewBtn: document.getElementById("filesViewBtn"),
  variablesViewBtn: document.getElementById("variablesViewBtn"),
  settingsViewBtn: document.getElementById("settingsViewBtn"),
  projectsView: document.getElementById("projectsView"),
  filesView: document.getElementById("filesView"),
  variablesView: document.getElementById("variablesView"),
  settingsView: document.getElementById("settingsView"),
  projectList: document.getElementById("projectList"),
  fileList: document.getElementById("fileList"),
  variableList: document.getElementById("variableList"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  deleteProjectBtn: document.getElementById("deleteProjectBtn"),
  newFileBtn: document.getElementById("newFileBtn"),
  deleteFileBtn: document.getElementById("deleteFileBtn"),
  openImportModalBtn: document.getElementById("openImportModalBtn"),
  importModal: document.getElementById("importModal"),
  importForm: document.getElementById("importForm"),
  closeImportModalBtn: document.getElementById("closeImportModalBtn"),
  filePicker: document.getElementById("filePicker"),
  markdownInput: document.getElementById("markdownInput"),
  preview: document.getElementById("preview"),
  createVariableBtn: document.getElementById("createVariableBtn"),
  replaceAllToggle: document.getElementById("replaceAllToggle"),
  regionSelect: document.getElementById("regionSelect"),
  detectSensitiveBtn: document.getElementById("detectSensitiveBtn"),
  detectModal: document.getElementById("detectModal"),
  detectForm: document.getElementById("detectForm"),
  detectType: document.getElementById("detectType"),
  detectValue: document.getElementById("detectValue"),
  detectSnippet: document.getElementById("detectSnippet"),
  detectApplyBtn: document.getElementById("detectApplyBtn"),
  detectSkipBtn: document.getElementById("detectSkipBtn"),
  detectStopBtn: document.getElementById("detectStopBtn"),
  retentionSelect: document.getElementById("retentionSelect"),
  exportFormatSelect: document.getElementById("exportFormatSelect"),
  clearDataBtn: document.getElementById("clearDataBtn"),
  restoreAllBtn: document.getElementById("restoreAllBtn"),
  applyAllBtn: document.getElementById("applyAllBtn"),
  activeFileTitle: document.getElementById("activeFileTitle"),
  activeFileMeta: document.getElementById("activeFileMeta"),
  copySanitizedBtn: document.getElementById("copySanitizedBtn"),
  exportDocxBtn: document.getElementById("exportDocxBtn"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  exportXlsxBtn: document.getElementById("exportXlsxBtn"),
};

function setStatus(message) {
  els.status.textContent = message;
  els.status.classList.remove("status-hidden");
  clearTimeout(state.statusTimer);
  state.statusTimer = setTimeout(() => {
    els.status.classList.add("status-hidden");
  }, 3000);
}

function saveUiState() {
  const payload = {
    activeProjectId: state.activeProjectId,
    activeFileId: state.activeFileId,
    sidebarOpen: state.sidebarOpen,
    activeSidebarView: state.activeSidebarView,
    region: state.region,
    retention: state.retention,
    exportFormat: state.exportFormat,
  };
  window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(payload));
}

function loadUiState() {
  const raw = window.localStorage.getItem(UI_STATE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSidebarView(view) {
  state.activeSidebarView = view;
  els.projectsView.classList.toggle("hidden", view !== "projects");
  els.filesView.classList.toggle("hidden", view !== "files");
  els.variablesView.classList.toggle("hidden", view !== "variables");
  els.settingsView.classList.toggle("hidden", view !== "settings");
  els.projectsViewBtn.classList.toggle("active", view === "projects");
  els.filesViewBtn.classList.toggle("active", view === "files");
  els.variablesViewBtn.classList.toggle("active", view === "variables");
  els.settingsViewBtn.classList.toggle("active", view === "settings");
  saveUiState();
}

function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", !state.sidebarOpen);
  saveUiState();
}

function showSidebarView(view) {
  if (state.sidebarOpen && state.activeSidebarView === view) {
    state.sidebarOpen = false;
    applySidebarState();
    return;
  }
  state.sidebarOpen = true;
  setSidebarView(view);
  applySidebarState();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("files")) {
        const store = db.createObjectStore("files", { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
  });
}

async function dbRun(storeName, mode, operation) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = operation(store);

    tx.oncomplete = () => resolve(result && result.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function dbGetAll(storeName) {
  return dbRun(storeName, "readonly", (store) => store.getAll());
}

function dbPut(storeName, value) {
  return dbRun(storeName, "readwrite", (store) => store.put(value));
}

function dbAdd(storeName, value) {
  return dbRun(storeName, "readwrite", (store) => store.add(value));
}

async function dbDelete(storeName, key) {
  return dbRun(storeName, "readwrite", (store) => store.delete(key));
}

function getNowIso() {
  return new Date().toISOString();
}

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, "<code>{$1}</code>");
}

function renderMarkdown(markdown) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let alignMode = null;
  let i = 0;

  function alignedStyle() {
    return alignMode ? ` style="text-align: ${alignMode};"` : "";
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith("|")) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed.split("|").map((cell) => cell.trim());
  }

  function renderTable(headerCells, bodyRows) {
    const headerHtml = headerCells.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
    const bodyHtml = bodyRows
      .map((row) => {
        const cells = row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  }

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    const alignStart = line.match(/^:::(left|center|right)$/);
    if (!inCode && alignStart) {
      alignMode = alignStart[1];
      i += 1;
      continue;
    }
    if (!inCode && line === ":::") {
      alignMode = null;
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      if (!inCode) {
        html += "<pre><code>";
        inCode = true;
      } else {
        html += "</code></pre>";
        inCode = false;
      }
      i += 1;
      continue;
    }

    if (inCode) {
      html += `${escapeHtml(rawLine)}\n`;
      i += 1;
      continue;
    }

    if (line.length === 0) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      i += 1;
      continue;
    }

    const nextLine = lines[i + 1]?.trimEnd() ?? "";
    if (line.includes("|") && isTableSeparator(nextLine)) {
      const headerCells = splitTableRow(line);
      const bodyRows = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j].trimEnd();
        if (!rowLine || !rowLine.includes("|")) {
          break;
        }
        bodyRows.push(splitTableRow(rowLine));
        j += 1;
      }
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += renderTable(headerCells, bodyRows);
      i = j;
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        html += `<ul${alignedStyle()}>`;
        inList = true;
      }
      html += `<li>${renderInlineMarkdown(line.slice(2))}</li>`;
      i += 1;
      continue;
    }

    if (inList) {
      html += "</ul>";
      inList = false;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}${alignedStyle()}>${renderInlineMarkdown(heading[2])}</h${level}>`;
      i += 1;
      continue;
    }

    html += `<p${alignedStyle()}>${renderInlineMarkdown(line)}</p>`;
    i += 1;
  }

  if (inList) {
    html += "</ul>";
  }
  if (inCode) {
    html += "</code></pre>";
  }

  return html || "<p class='muted'>Preview will appear here.</p>";
}

function htmlNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  if (tag === "table") {
    return tableToMarkdown(node) + "\n\n";
  }
  const children = [...node.childNodes].map(htmlNodeToMarkdown).join("");

  if (tag === "strong" || tag === "b") {
    return `**${children}**`;
  }
  if (tag === "em" || tag === "i") {
    return `*${children}*`;
  }
  if (tag === "code") {
    return `\`${children}\``;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return href ? `[${children}](${href})` : children;
  }
  if (tag === "li") {
    return `- ${children.trim()}\n`;
  }
  if (tag === "ul" || tag === "ol") {
    return `${children}\n`;
  }
  if (tag === "h1") {
    return `# ${children.trim()}\n\n`;
  }
  if (tag === "h2") {
    return `## ${children.trim()}\n\n`;
  }
  if (tag === "h3") {
    return `### ${children.trim()}\n\n`;
  }
  if (tag === "h4") {
    return `#### ${children.trim()}\n\n`;
  }
  if (tag === "h5") {
    return `##### ${children.trim()}\n\n`;
  }
  if (tag === "h6") {
    return `###### ${children.trim()}\n\n`;
  }
  if (tag === "br") {
    return "\n";
  }
  if (tag === "p") {
    return `${children.trim()}\n\n`;
  }
  return children;
}

function inlineFromNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const tag = node.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") {
    return `**${[...node.childNodes].map(inlineFromNode).join("")}**`;
  }
  if (tag === "em" || tag === "i") {
    return `*${[...node.childNodes].map(inlineFromNode).join("")}*`;
  }
  if (tag === "code") {
    return `\`${[...node.childNodes].map(inlineFromNode).join("")}\``;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const text = [...node.childNodes].map(inlineFromNode).join("");
    return href ? `[${text}](${href})` : text;
  }
  if (tag === "br") {
    return "\n";
  }
  if (tag === "p") {
    return [...node.childNodes].map(inlineFromNode).join("") + "\n";
  }
  return [...node.childNodes].map(inlineFromNode).join("");
}

function sanitizeTableCell(text) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\n+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function tableToMarkdown(tableNode) {
  const rows = [...tableNode.querySelectorAll("tr")];
  if (rows.length === 0) {
    return "";
  }

  const rowToCells = (row) =>
    [...row.children]
      .filter((cell) => cell.tagName && (cell.tagName.toLowerCase() === "td" || cell.tagName.toLowerCase() === "th"))
      .map((cell) => sanitizeTableCell(inlineFromNode(cell)));

  let headerCells = [];
  let bodyRows = [];

  const theadRow = tableNode.querySelector("thead tr");
  if (theadRow) {
    headerCells = rowToCells(theadRow);
    bodyRows = rows.filter((row) => row !== theadRow).map(rowToCells);
  } else {
    headerCells = rowToCells(rows[0]);
    bodyRows = rows.slice(1).map(rowToCells);
  }

  const colCount = Math.max(headerCells.length, ...bodyRows.map((r) => r.length), 1);
  const normalizeRow = (row) => {
    const filled = row.slice(0, colCount);
    while (filled.length < colCount) {
      filled.push("");
    }
    return filled;
  };

  headerCells = normalizeRow(headerCells);
  bodyRows = bodyRows.map(normalizeRow);

  const headerLine = `| ${headerCells.join(" | ")} |`;
  const separatorLine = `| ${headerCells.map(() => "---").join(" | ")} |`;
  const bodyLines = bodyRows.map((row) => `| ${row.join(" | ")} |`);

  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

function htmlToMarkdown(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const output = [...root.childNodes].map(htmlNodeToMarkdown).join("");
  return output.replaceAll(/\n{3,}/g, "\n\n").trim();
}

function getActiveProject() {
  return state.projects.find((item) => item.id === state.activeProjectId) || null;
}

function getActiveFile() {
  return state.files.find((item) => item.id === state.activeFileId) || null;
}

function getProjectVariables() {
  const project = getActiveProject();
  return Array.isArray(project?.variables) ? project.variables : [];
}

async function persistProject(project, statusMessage) {
  project.updatedAt = getNowIso();
  await dbPut("projects", project);
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    state.projects[index] = project;
  }
  renderAll();
  if (statusMessage) {
    setStatus(statusMessage);
  }
}

function setEditorEnabled(enabled) {
  els.markdownInput.disabled = !enabled;
  els.createVariableBtn.disabled = !enabled;
  els.restoreAllBtn.disabled = !enabled;
  els.applyAllBtn.disabled = !enabled;
  els.copySanitizedBtn.disabled = !enabled;
  els.exportDocxBtn.disabled = !enabled;
  els.exportHtmlBtn.disabled = !enabled;
  els.exportXlsxBtn.disabled = !enabled;
  els.deleteFileBtn.disabled = !enabled;
  els.detectSensitiveBtn.disabled = !enabled;
}

function applyExportFormatSetting() {
  const showHtml = state.exportFormat === "docx_html";
  const showXlsx = state.exportFormat === "docx_xlsx";
  els.exportHtmlBtn.classList.toggle("hidden", !showHtml);
  els.exportXlsxBtn.classList.toggle("hidden", !showXlsx);
  saveUiState();
}

function renderProjects() {
  els.deleteProjectBtn.disabled = !getActiveProject();
  if (state.projects.length === 0) {
    els.projectList.innerHTML = "<li><button type='button' disabled>No projects</button></li>";
    return;
  }

  els.projectList.innerHTML = state.projects
    .map((project) => {
      const isActive = project.id === state.activeProjectId;
      const cls = isActive ? "active" : "";
      return `<li><button class='${cls}' type='button' data-project-id='${project.id}'>${escapeHtml(project.name)}</button></li>`;
    })
    .join("");
}

function renderFiles() {
  els.deleteFileBtn.disabled = !getActiveFile();
  const files = state.files.filter((file) => file.projectId === state.activeProjectId);

  if (files.length === 0) {
    els.fileList.innerHTML = "<li><button type='button' disabled>No files</button></li>";
    return;
  }

  els.fileList.innerHTML = files
    .map((file) => {
      const isActive = file.id === state.activeFileId;
      const cls = isActive ? "active" : "";
      return `<li><button class='${cls}' type='button' data-file-id='${file.id}'>${escapeHtml(file.name)}</button></li>`;
    })
    .join("");
}

function renderVariables(file) {
  const variables = getProjectVariables();

  if (variables.length === 0) {
    els.variableList.innerHTML = "<li><span class='muted'>No variables yet.</span></li>";
    return;
  }

  els.variableList.innerHTML = variables
    .map((entry) => {
      const placeholder = `{${entry.name}}`;
      const text = file?.sanitizedContent ?? "";
      const placeholderCount = SanitizerCore.countOccurrences(text, placeholder);
      const valueCount = SanitizerCore.countOccurrences(text, entry.value);
      return `<li>
        <div class="variable-row">
          <div class="variable-meta">
            <code>${entry.name}</code>
            <code>${escapeHtml(entry.value)}</code>
            <span class="muted">${placeholderCount} placeholder(s), ${valueCount} value match(es)</span>
          </div>
          <div class="variable-actions">
            <button type='button' class='ghost icon-btn' data-action='restore-one' data-name='${entry.name}' title='Restore' aria-label='Restore'>&lt;</button>
            <button type='button' class='ghost icon-btn' data-action='apply-one' data-name='${entry.name}' title='Apply' aria-label='Apply'>&gt;</button>
            <button type='button' class='ghost danger icon-btn' data-action='delete-variable' data-name='${entry.name}' title='Delete' aria-label='Delete'>x</button>
          </div>
        </div>
      </li>`;
    })
    .join("");
}

function renderEditor() {
  const file = getActiveFile();
  if (!file) {
    els.activeFileTitle.textContent = "No file selected";
    els.activeFileMeta.textContent = "Create or import a file to start.";
    els.markdownInput.value = "";
    els.preview.innerHTML = "<p class='muted'>Preview will appear here.</p>";
    renderVariables({ variables: [], sanitizedContent: "" });
    setEditorEnabled(false);
    return;
  }

  setEditorEnabled(true);
  els.activeFileTitle.textContent = file.name;
  els.activeFileMeta.textContent = `Original and sanitized content are stored separately. Last updated: ${new Date(
    file.updatedAt
  ).toLocaleString()}`;
  els.markdownInput.value = file.sanitizedContent;
  els.preview.innerHTML = renderMarkdown(file.sanitizedContent);
  renderVariables(file);
}

function renderAll() {
  renderProjects();
  renderFiles();
  renderEditor();
}

async function persistFile(file, statusMessage) {
  file.updatedAt = getNowIso();
  await dbPut("files", file);

  const index = state.files.findIndex((item) => item.id === file.id);
  if (index >= 0) {
    state.files[index] = file;
  }

  renderAll();
  if (statusMessage) {
    setStatus(statusMessage);
  }
}

function scheduleAutosave() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      await persistFile(file, "Autosaved.");
    } catch (error) {
      setStatus(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, 350);
}

async function createProject(name) {
  const now = getNowIso();
  const project = {
    name,
    variables: [],
    createdAt: now,
    updatedAt: now,
  };
  project.id = await dbAdd("projects", project);
  state.projects.push(project);
  state.activeProjectId = project.id;
  saveUiState();
  renderAll();
  return project;
}

async function createFile(fileInput) {
  const now = getNowIso();
  const file = {
    projectId: state.activeProjectId,
    name: fileInput.name,
    type: fileInput.type,
    originalContent: fileInput.originalContent,
    sanitizedContent: fileInput.sanitizedContent,
    variables: [],
    createdAt: now,
    updatedAt: now,
  };

  file.id = await dbAdd("files", file);
  state.files.push(file);
  state.activeFileId = file.id;
  saveUiState();
  renderAll();
  return file;
}

async function loadInitialState() {
  state.projects = await dbGetAll("projects");
  state.files = await dbGetAll("files");
  const saved = loadUiState();

  if (state.projects.length === 0) {
    const project = await createProject("Default Project");
    state.activeProjectId = project.id;
  } else {
    state.projects = state.projects.map((project) => ({
      ...project,
      variables: Array.isArray(project.variables) ? project.variables : [],
    }));
    const savedProject = saved?.activeProjectId;
    const exists = state.projects.some((project) => project.id === savedProject);
    state.activeProjectId = exists ? savedProject : state.projects[0].id;
  }

  for (const project of state.projects) {
    const projectVars = project.variables || [];
    const fileVars = state.files
      .filter((file) => file.projectId === project.id)
      .flatMap((file) => (Array.isArray(file.variables) ? file.variables : []));
    for (const entry of fileVars) {
      if (!projectVars.some((item) => item.name === entry.name)) {
        projectVars.push({ name: entry.name, value: entry.value });
      }
    }
    project.variables = projectVars;
  }

  for (const project of state.projects) {
    await dbPut("projects", project);
  }

  const projectFiles = state.files.filter((file) => file.projectId === state.activeProjectId);
  const savedFile = saved?.activeFileId;
  const activeInProject = projectFiles.some((file) => file.id === savedFile);
  state.activeFileId = activeInProject ? savedFile : projectFiles.length > 0 ? projectFiles[0].id : null;
  state.sidebarOpen = saved?.sidebarOpen === true;
  state.activeSidebarView =
    saved?.activeSidebarView === "files" ||
    saved?.activeSidebarView === "variables" ||
    saved?.activeSidebarView === "settings"
      ? saved.activeSidebarView
      : "projects";
  state.region = saved?.region === "lv" ? "lv" : "lv";
  els.regionSelect.value = state.region;
  state.retention = saved?.retention === "clear_on_next_load" ? "clear_on_next_load" : "keep";
  els.retentionSelect.value = state.retention;
  state.exportFormat = saved?.exportFormat === "docx_html" || saved?.exportFormat === "docx_xlsx" ? saved.exportFormat : "docx";
  els.exportFormatSelect.value = state.exportFormat;
  applyExportFormatSetting();

  renderAll();
}

function chooseProject(projectId) {
  state.activeProjectId = projectId;
  const projectFiles = state.files.filter((file) => file.projectId === projectId);
  state.activeFileId = projectFiles.length > 0 ? projectFiles[0].id : null;
  saveUiState();
  renderAll();
}

function chooseFile(fileId) {
  state.activeFileId = fileId;
  saveUiState();
  renderAll();
}

async function promptNewProject() {
  const name = window.prompt("Project name:", `Project ${state.projects.length + 1}`);
  if (!name) {
    return;
  }

  await createProject(name.trim());
  setStatus(`Project \"${name.trim()}\" created.`);
}

async function promptNewEmptyFile() {
  if (!state.activeProjectId) {
    setStatus("Create a project first.");
    return;
  }

  const name = window.prompt("File name:", `untitled-${Date.now()}.md`);
  if (!name) {
    return;
  }

  await createFile({
    name: name.trim(),
    type: "text/markdown",
    originalContent: "",
    sanitizedContent: "",
  });
  setStatus(`File \"${name.trim()}\" created.`);
}

async function deleteActiveProject() {
  const project = getActiveProject();
  if (!project) {
    setStatus("No active project to delete.");
    return;
  }

  if (!window.confirm(`Delete project \"${project.name}\" and all its files?`)) {
    return;
  }

  const filesToDelete = state.files.filter((file) => file.projectId === project.id);
  for (const file of filesToDelete) {
    await dbDelete("files", file.id);
  }
  await dbDelete("projects", project.id);

  state.files = state.files.filter((file) => file.projectId !== project.id);
  state.projects = state.projects.filter((item) => item.id !== project.id);

  if (state.projects.length === 0) {
    const fallback = await createProject("Default Project");
    state.activeProjectId = fallback.id;
    state.activeFileId = null;
  } else {
    state.activeProjectId = state.projects[0].id;
    const projectFiles = state.files.filter((file) => file.projectId === state.activeProjectId);
    state.activeFileId = projectFiles.length > 0 ? projectFiles[0].id : null;
    saveUiState();
    renderAll();
  }

  setStatus(`Project \"${project.name}\" deleted.`);
}

async function deleteActiveFile() {
  const file = getActiveFile();
  if (!file) {
    setStatus("No active file to delete.");
    return;
  }

  if (!window.confirm(`Delete file \"${file.name}\"?`)) {
    return;
  }

  await dbDelete("files", file.id);
  state.files = state.files.filter((item) => item.id !== file.id);

  const filesInProject = state.files.filter((item) => item.projectId === state.activeProjectId);
  state.activeFileId = filesInProject.length > 0 ? filesInProject[0].id : null;
  saveUiState();
  renderAll();
  setStatus(`File \"${file.name}\" deleted.`);
}

function updateSanitizedFromEditor() {
  const file = getActiveFile();
  if (!file) {
    return;
  }
  file.sanitizedContent = els.markdownInput.value;
  els.preview.innerHTML = renderMarkdown(file.sanitizedContent);
  renderVariables(file);
  scheduleAutosave();
}

function getSelectionRange() {
  return {
    start: els.markdownInput.selectionStart,
    end: els.markdownInput.selectionEnd,
  };
}

function getTrimmedSelectionRange(text, start, end) {
  let left = start;
  let right = end;

  while (left < right && /\s/.test(text[left])) {
    left += 1;
  }
  while (right > left && /\s/.test(text[right - 1])) {
    right -= 1;
  }

  return { start: left, end: right };
}

async function createVariableFromSelection() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const selection = getSelectionRange();
  const range = getTrimmedSelectionRange(file.sanitizedContent, selection.start, selection.end);
  const selected = file.sanitizedContent.slice(range.start, range.end);
  const guess = suggestVariableNameForValue(selected, state.region) + "_" + randomSuffix();
  const requestedName = window.prompt("Variable name (lowercase + numbers + underscore):", guess);

  if (!requestedName) {
    return;
  }

  const name = requestedName.trim();
  const project = getActiveProject();
  if (!project) {
    return;
  }
  const existing = getProjectVariables().find((entry) => entry.name === name);

  if (existing && existing.value !== selected) {
    setStatus(`Variable ${name} already exists with a different value.`);
    return;
  }

  const result = SanitizerCore.createVariable({
    text: file.sanitizedContent,
    start: range.start,
    end: range.end,
    name,
    replaceAll: els.replaceAllToggle.checked,
  });

  if (!result.ok) {
    setStatus(`Cannot create variable: ${result.reason}.`);
    return;
  }

  file.sanitizedContent = result.text;

  if (!existing) {
    project.variables = [...getProjectVariables(), { name, value: result.selected }];
    await persistProject(project);
  }

  await persistFile(file, `Created ${result.placeholder}.`);
}

async function restoreAllVariables() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const result = SanitizerCore.restoreAll(file.sanitizedContent, getProjectVariables());
  file.sanitizedContent = result.text;
  await persistFile(file, `Restore-all completed. Replaced ${result.replacedTotal} placeholder(s).`);
}

async function restoreOneVariable(name) {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const variable = getProjectVariables().find((entry) => entry.name === name);
  if (!variable) {
    setStatus(`Variable ${name} not found.`);
    return;
  }

  const result = SanitizerCore.restoreVariable(file.sanitizedContent, name, variable.value);
  file.sanitizedContent = result.text;
  await persistFile(file, `Restored ${result.replaced} occurrence(s) of ${result.placeholder}.`);
}

async function applyOneVariable(name) {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const variable = getProjectVariables().find((entry) => entry.name === name);
  if (!variable) {
    setStatus(`Variable ${name} not found.`);
    return;
  }

  const placeholder = `{${name}}`;
  const countBefore = SanitizerCore.countOccurrences(file.sanitizedContent, variable.value);
  file.sanitizedContent = SanitizerCore.replaceAllExact(file.sanitizedContent, variable.value, placeholder);
  await persistFile(file, `Applied ${placeholder} to ${countBefore} value match(es).`);
}

async function deleteVariable(name) {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const variable = getProjectVariables().find((entry) => entry.name === name);
  if (!variable) {
    setStatus(`Variable ${name} not found.`);
    return;
  }

  const placeholder = `{${name}}`;
  const placeholderCount = SanitizerCore.countOccurrences(file.sanitizedContent, placeholder);
  if (
    !window.confirm(
      `Delete variable ${placeholder}? ${placeholderCount} placeholder(s) will be restored back to original value.`
    )
  ) {
    return;
  }

  file.sanitizedContent = SanitizerCore.replaceAllExact(file.sanitizedContent, placeholder, variable.value);
  const project = getActiveProject();
  if (!project) {
    return;
  }
  project.variables = getProjectVariables().filter((entry) => entry.name !== name);
  await persistProject(project, `Variable ${placeholder} deleted.`);
  await persistFile(file);
}

async function applyAllVariables() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  let totalApplied = 0;
  let nextText = file.sanitizedContent;
  for (const variable of getProjectVariables()) {
    const count = SanitizerCore.countOccurrences(nextText, variable.value);
    totalApplied += count;
    nextText = SanitizerCore.replaceAllExact(nextText, variable.value, `{${variable.name}}`);
  }

  file.sanitizedContent = nextText;
  await persistFile(file, `Apply-all completed. Replaced ${totalApplied} value match(es).`);
}

function createUniqueVariableName(baseName) {
  const existingNames = new Set(getProjectVariables().map((entry) => entry.name));
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  let i = 2;
  while (existingNames.has(`${baseName}_${i}`)) {
    i += 1;
  }
  return `${baseName}_${i}`;
}

function maskExistingPlaceholders(text) {
  return text.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, " ");
}

function suggestVariableNameForValue(value, region) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const emailDisplayRegex = /<\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*>/;
  const phoneRegexLv = /^(?:\+371|371)?[\s-]?(?:2\d{7}|6\d{7})$/;
  const companyRegexLv = /^(?:SIA|Sabiedrība ar ierobežotu atbildību)\s+/;
  const ibanRegexLv = /^LV\d{2}[A-Z0-9]{4}\d{13}$/;
  const personalCodeLv = /^\d{6}-?\d{5}$/;
  const addressRegexLv = /\biela\b/i;
  const dateRegexLvWords = /^\d{4}\.\s*gada\s*(?:\d{1,2}\.\s*)?[a-zāčēģīķļņšūž]+/i;
  const dateRegexDots = /^\d{1,2}\.\d{1,2}\.\d{4}\.?$/;
  const regNoRegex = /^\d{11}$/;
  const plateRegex = /^[A-Z]{2}-?\d{4}$/;
  const postalCodeRegex = /^LV-\d{4}$/i;
  const urlWithQueryRegex = /^https?:\/\/\S+\?\S+/i;

  if (emailRegex.test(value)) {
    return "email";
  }
  if (emailDisplayRegex.test(value)) {
    return "email";
  }
  if (region === "lv" && phoneRegexLv.test(value.replace(/\s+/g, ""))) {
    return "phone";
  }
  if (region === "lv" && companyRegexLv.test(value)) {
    return "company";
  }
  if (region === "lv" && ibanRegexLv.test(value.replace(/\s+/g, ""))) {
    return "iban";
  }
  if (region === "lv" && personalCodeLv.test(value.replace(/\s+/g, ""))) {
    return "personal_code";
  }
  if (region === "lv" && addressRegexLv.test(value)) {
    return "address";
  }
  if (region === "lv" && (dateRegexLvWords.test(value) || dateRegexDots.test(value))) {
    return "date";
  }
  if (region === "lv" && postalCodeRegex.test(value.replace(/\s+/g, ""))) {
    return "postal_code";
  }
  if (region === "lv" && regNoRegex.test(value)) {
    return "registration_number";
  }
  if (region === "lv" && plateRegex.test(value.replace(/\s+/g, ""))) {
    return "vehicle_plate";
  }
  if (urlWithQueryRegex.test(value)) {
    return "url";
  }
  return "value";
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function extractSensitiveCandidates(text, region) {
  const candidates = [];
  const source = maskExistingPlaceholders(text);

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  for (const match of source.matchAll(emailRegex)) {
    candidates.push({ type: "email", value: match[0] });
  }

  const emailDisplayRegex = /\b[^<\n]{0,60}<\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*>/g;
  for (const match of source.matchAll(emailDisplayRegex)) {
    candidates.push({ type: "email", value: match[0].trim() });
  }

  const urlWithQueryRegex = /https?:\/\/\S+\?\S+/gi;
  for (const match of source.matchAll(urlWithQueryRegex)) {
    candidates.push({ type: "url", value: match[0].trim() });
  }

  if (region === "lv") {
    const phoneRegex = /(?:\+371|371)?[\s-]?(?:2\d{7}|6\d{7})/g;
    for (const match of source.matchAll(phoneRegex)) {
      const cleaned = match[0].replace(/\s+/g, " ").trim();
      candidates.push({ type: "phone", value: cleaned });
    }

    const companyRegex = /\b(?:SIA|Sabiedrība ar ierobežotu atbildību)\s+[A-ZĀČĒĢĪĶĻŅŠŪŽ0-9][^,\n]{1,60}/g;
    for (const match of source.matchAll(companyRegex)) {
      candidates.push({ type: "company", value: match[0].trim() });
    }

    const ibanRegex = /\bLV\d{2}[A-Z0-9]{4}\d{13}\b/g;
    for (const match of source.matchAll(ibanRegex)) {
      candidates.push({ type: "iban", value: match[0].trim() });
    }

    const personalCodeRegex = /\b\d{6}-?\d{5}\b/g;
    for (const match of source.matchAll(personalCodeRegex)) {
      candidates.push({ type: "personal_code", value: match[0].trim() });
    }

    const addressRegex =
      /\b[^\n,]{1,60}\biela\b\s+\d+[a-zA-Z]?(?:-\d+[a-zA-Z]?)?(?:,\s*[^\n,]{1,80}){0,2}/gi;
    for (const match of source.matchAll(addressRegex)) {
      const cleaned = match[0].replace(/^\s*adrese\s*:\s*/i, "").trim();
      candidates.push({ type: "address", value: cleaned });
    }

    const dateWordsRegex = /\b\d{4}\.\s*gada\s*(?:\d{1,2}\.\s*)?[a-zāčēģīķļņšūž]+\b/gi;
    for (const match of source.matchAll(dateWordsRegex)) {
      candidates.push({ type: "date", value: match[0].trim() });
    }

    const dateDotsRegex = /\b\d{1,2}\.\d{1,2}\.\d{4}\.?\b/g;
    for (const match of source.matchAll(dateDotsRegex)) {
      candidates.push({ type: "date", value: match[0].trim() });
    }

    const postalCodeRegex = /\bLV-\d{4}\b/gi;
    for (const match of source.matchAll(postalCodeRegex)) {
      candidates.push({ type: "postal_code", value: match[0].trim().toUpperCase() });
    }

    const regNoRegex = /\b\d{11}\b/g;
    for (const match of source.matchAll(regNoRegex)) {
      candidates.push({ type: "registration_number", value: match[0].trim() });
    }

    const plateRegex = /\b[A-Z]{2}-?\d{4}\b/g;
    for (const match of source.matchAll(plateRegex)) {
      candidates.push({ type: "vehicle_plate", value: match[0].trim() });
    }
  }

  return candidates;
}

function buildSnippet(text, value) {
  const index = text.indexOf(value);
  if (index === -1) {
    return escapeHtml(text.slice(0, 200));
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + value.length + 60);
  const prefix = escapeHtml(text.slice(start, index));
  const match = escapeHtml(text.slice(index, index + value.length));
  const suffix = escapeHtml(text.slice(index + value.length, end));
  return `${prefix}<mark>${match}</mark>${suffix}`;
}

function startDetectionQueue(candidates) {
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!seen.has(candidate.value)) {
      seen.add(candidate.value);
      unique.push(candidate);
    }
  }
  state.detectQueue = unique;
  state.detectIndex = 0;
  state.detecting = true;
}

async function applyDetectionCandidate(candidate) {
  const file = getActiveFile();
  const project = getActiveProject();
  if (!file || !project) {
    return;
  }

  const existing = getProjectVariables().find((entry) => entry.value === candidate.value);
  let name = existing?.name;
  if (!name) {
    const base = suggestVariableNameForValue(candidate.value, state.region);
    name = createUniqueVariableName(`${base}_${randomSuffix()}`);
    project.variables = [...getProjectVariables(), { name, value: candidate.value }];
    await persistProject(project);
  }

  const placeholder = `{${name}}`;
  const count = SanitizerCore.countOccurrences(file.sanitizedContent, candidate.value);
  if (count > 0) {
    file.sanitizedContent = SanitizerCore.replaceAllExact(file.sanitizedContent, candidate.value, placeholder);
    await persistFile(file, `Applied ${placeholder} to ${count} match(es).`);
  } else {
    await persistFile(file, `No matches found for ${placeholder}.`);
  }
}

function showNextDetectionCandidate() {
  if (!state.detecting) {
    return;
  }
  const candidate = state.detectQueue[state.detectIndex];
  if (!candidate) {
    state.detecting = false;
    els.detectModal.close();
    setStatus("Detection complete.");
    return;
  }
  const file = getActiveFile();
  if (!file) {
    state.detecting = false;
    els.detectModal.close();
    return;
  }
  els.detectType.textContent = candidate.type;
  els.detectValue.textContent = candidate.value;
  els.detectSnippet.innerHTML = buildSnippet(file.sanitizedContent, candidate.value);
  els.detectModal.showModal();
}

async function detectSensitiveData() {
  const file = getActiveFile();
  const project = getActiveProject();
  if (!file || !project) {
    return;
  }

  const candidates = extractSensitiveCandidates(file.sanitizedContent, state.region);
  if (candidates.length === 0) {
    setStatus("No sensitive data detected.");
    return;
  }

  startDetectionQueue(candidates);
  showNextDetectionCandidate();
}

async function copySanitizedText() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  try {
    await navigator.clipboard.writeText(file.sanitizedContent);
    setStatus("Sanitized text copied to clipboard.");
  } catch {
    setStatus("Clipboard copy failed in this browser context.");
  }
}

function markdownInlineToRuns(text, docxLib) {
  const runs = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let cursor = 0;

  for (const match of text.matchAll(tokenRegex)) {
    const index = match.index || 0;
    if (index > cursor) {
      runs.push(new docxLib.TextRun({ text: text.slice(cursor, index) }));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      runs.push(new docxLib.TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith("*") && token.endsWith("*")) {
      runs.push(new docxLib.TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith("`") && token.endsWith("`")) {
      runs.push(new docxLib.TextRun({ text: token.slice(1, -1), font: "Courier New" }));
    } else {
      runs.push(new docxLib.TextRun({ text: token }));
    }

    cursor = index + token.length;
  }

  if (cursor < text.length) {
    runs.push(new docxLib.TextRun({ text: text.slice(cursor) }));
  }

  return runs.length > 0 ? runs : [new docxLib.TextRun("")];
}

function markdownToDocxParagraphs(markdown, docxLib) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const paragraphs = [];
  let inCode = false;
  let codeLines = [];
  let alignMode = null;
  let i = 0;

  const headingLevels = [
    docxLib.HeadingLevel.HEADING_1,
    docxLib.HeadingLevel.HEADING_2,
    docxLib.HeadingLevel.HEADING_3,
    docxLib.HeadingLevel.HEADING_4,
    docxLib.HeadingLevel.HEADING_5,
    docxLib.HeadingLevel.HEADING_6,
  ];

  const alignmentMap = {
    left: docxLib.AlignmentType.LEFT,
    center: docxLib.AlignmentType.CENTER,
    right: docxLib.AlignmentType.RIGHT,
  };

  function currentAlignment() {
    return alignMode ? alignmentMap[alignMode] : undefined;
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function splitTableRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith("|")) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed.split("|").map((cell) => cell.trim());
  }

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    const alignStart = line.match(/^:::(left|center|right)$/);
    if (!inCode && alignStart) {
      alignMode = alignStart[1];
      i += 1;
      continue;
    }
    if (!inCode && line === ":::") {
      alignMode = null;
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLines = [];
      } else {
        const codeRuns = [];
        codeLines.forEach((codeLine, index) => {
          codeRuns.push(new docxLib.TextRun({ text: codeLine, font: "Courier New" }));
          if (index < codeLines.length - 1) {
            codeRuns.push(new docxLib.TextRun({ break: 1 }));
          }
        });
        paragraphs.push(
          new docxLib.Paragraph({
            alignment: currentAlignment(),
            children: codeRuns.length > 0 ? codeRuns : [new docxLib.TextRun("")],
          })
        );
        inCode = false;
        codeLines = [];
      }
      i += 1;
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      i += 1;
      continue;
    }

    if (line.length === 0) {
      paragraphs.push(new docxLib.Paragraph({ alignment: currentAlignment(), children: [new docxLib.TextRun("")] }));
      i += 1;
      continue;
    }

    const nextLine = lines[i + 1]?.trimEnd() ?? "";
    if (line.includes("|") && isTableSeparator(nextLine)) {
      const headerCells = splitTableRow(line);
      const bodyRows = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j].trimEnd();
        if (!rowLine || !rowLine.includes("|")) {
          break;
        }
        bodyRows.push(splitTableRow(rowLine));
        j += 1;
      }

      const allRows = [headerCells, ...bodyRows];
      const table = new docxLib.Table({
        rows: allRows.map((row, rowIndex) => {
          const cells = row.map((cellText) => {
            const isHeader = rowIndex === 0;
            return new docxLib.TableCell({
              children: [
                new docxLib.Paragraph({
                  alignment: currentAlignment(),
                  children: isHeader
                    ? [new docxLib.TextRun({ text: cellText, bold: true })]
                    : markdownInlineToRuns(cellText, docxLib),
                }),
              ],
            });
          });
          return new docxLib.TableRow({ children: cells });
        }),
      });
      paragraphs.push(table);
      i = j;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length - 1;
      paragraphs.push(
        new docxLib.Paragraph({
          heading: headingLevels[level],
          alignment: currentAlignment(),
          children: markdownInlineToRuns(headingMatch[2], docxLib),
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      paragraphs.push(
        new docxLib.Paragraph({
          alignment: currentAlignment(),
          bullet: { level: 0 },
          children: markdownInlineToRuns(line.slice(2), docxLib),
        })
      );
      i += 1;
      continue;
    }

    paragraphs.push(
      new docxLib.Paragraph({
        alignment: currentAlignment(),
        children: markdownInlineToRuns(line, docxLib),
      })
    );
    i += 1;
  }

  if (inCode) {
    const fallbackRuns = codeLines.map((codeLine, index) =>
      new docxLib.TextRun({
        text: index < codeLines.length - 1 ? `${codeLine}\n` : codeLine,
        font: "Courier New",
      })
    );
    paragraphs.push(
      new docxLib.Paragraph({
        alignment: currentAlignment(),
        children: fallbackRuns.length > 0 ? fallbackRuns : [new docxLib.TextRun("")],
      })
    );
  }

  return paragraphs.length > 0
    ? paragraphs
    : [new docxLib.Paragraph({ alignment: currentAlignment(), children: [new docxLib.TextRun("")] })];
}

function toDocxFilename(inputName) {
  if (!inputName) {
    return "sanitized-export.docx";
  }
  return inputName.replace(/\.[^/.]+$/, "") + ".docx";
}

async function exportSanitizedToDocx() {
  const file = getActiveFile();
  if (!file) {
    return;
  }

  const docxLib = globalThis.docx;
  if (!docxLib || !docxLib.Document || !docxLib.Packer) {
    setStatus("DOCX export library is unavailable.");
    return;
  }

  try {
    const paragraphs = markdownToDocxParagraphs(file.sanitizedContent, docxLib);
    const docFile = new docxLib.Document({
      sections: [
        {
          children: paragraphs,
        },
      ],
    });

    const blob = await docxLib.Packer.toBlob(docFile);
    const href = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = href;
    link.download = toDocxFilename(file.name);
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    setStatus(`Exported ${link.download}.`);
  } catch (error) {
    setStatus(`DOCX export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function markdownCellEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ").trim();
}

function csvToRows(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "") || rows.length > 0) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rowsToMarkdown(rows, title) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const header = normalized[0] || Array(width).fill("");
  const lines = [`# ${title}`, "", `| ${header.map(markdownCellEscape).join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const row of normalized.slice(1)) {
    lines.push(`| ${row.map(markdownCellEscape).join(" | ")} |`);
  }
  return lines.join("\n");
}

function parseMarkdownTables(markdown) {
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  const tables = [];
  let heading = "Sheet1";
  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = lines[index].match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) heading = headingMatch[1].trim() || "Sheet1";
    if (!lines[index].includes("|") || !lines[index + 1] || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) continue;
    const split = (line) => {
      let value = line.trim();
      if (value.startsWith("|")) value = value.slice(1);
      if (value.endsWith("|")) value = value.slice(0, -1);
      return value.split(/(?<!\\)\|/).map((cell) => cell.replaceAll("\\|", "|").trim());
    };
    const rows = [split(lines[index])];
    index += 2;
    while (index < lines.length && lines[index].includes("|")) {
      rows.push(split(lines[index]));
      index += 1;
    }
    tables.push({ name: heading, rows });
    index -= 1;
  }
  return tables;
}

function stripMarkdownCell(value) {
  return String(value)
    .replace(/^`|`$/g, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^\*|\*$/g, "")
    .replace(/^\[([^\]]+)\]\([^)]*\)$/, "$1")
    .trim();
}

function columnName(index) {
  let result = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function makeWorksheetXml(rows) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((raw, colIndex) => {
      const value = stripMarkdownCell(raw);
      if (!value) return `<c r="${columnName(colIndex)}${rowIndex + 1}" t="inlineStr"><is><t></t></is></c>`;
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      if (/^=[^=]/.test(value)) return `<c r="${ref}"><f>${xmlEscape(value.slice(1))}</f></c>`;
      if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
function writeU32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = content instanceof Uint8Array ? content : encoder.encode(content);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const view = new DataView(local.buffer);
    writeU32(view, 0, 0x04034b50); writeU16(view, 4, 20); writeU16(view, 6, 0x800); writeU16(view, 8, 0);
    writeU16(view, 10, 0); writeU16(view, 12, 0); writeU32(view, 14, crc32(data)); writeU32(view, 18, data.length); writeU32(view, 22, data.length);
    writeU16(view, 26, nameBytes.length); writeU16(view, 28, 0); local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length);
    parts.push(local);
    const record = { nameBytes, data, offset };
    central.push(record);
    offset += local.length;
  }
  const centralParts = central.map(({ nameBytes, data, offset: entryOffset }) => {
    const record = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(record.buffer);
    writeU32(view, 0, 0x02014b50); writeU16(view, 4, 20); writeU16(view, 6, 20); writeU16(view, 8, 0x800); writeU16(view, 10, 0);
    writeU16(view, 12, 0); writeU16(view, 14, 0); writeU32(view, 16, crc32(data)); writeU32(view, 20, data.length); writeU32(view, 24, data.length);
    writeU16(view, 28, nameBytes.length); writeU16(view, 30, 0); writeU16(view, 32, 0); writeU16(view, 34, 0); writeU16(view, 36, 0); writeU32(view, 38, 0); writeU32(view, 42, entryOffset);
    record.set(nameBytes, 46);
    return record;
  });
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50); writeU16(endView, 8, central.length); writeU16(endView, 10, central.length); writeU32(endView, 12, centralSize); writeU32(endView, 16, offset); writeU16(endView, 20, 0);
  return new Blob([...parts, ...centralParts, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function makeXlsxBlob(tables) {
  const encoder = new TextEncoder();
  const safeNames = tables.map((table, index) => {
    const base = (table.name || `Sheet${index + 1}`).replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31) || `Sheet${index + 1}`;
    return `${base}${tables.slice(0, index).some((item) => item.name === base) ? ` ${index + 1}` : ""}`;
  });
  const sheetItems = tables.map((table, index) => [`xl/worksheets/sheet${index + 1}.xml`, makeWorksheetXml(table.rows)]);
  const workbookSheets = safeNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const rels = safeNames.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`],
    ...sheetItems,
  ];
  return createStoredZip(entries);
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer); const view = new DataView(arrayBuffer); const decoder = new TextDecoder();
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error("The workbook is not a valid XLSX ZIP package.");
  const count = view.getUint16(eocd + 10, true); const centralOffset = view.getUint32(eocd + 16, true); let cursor = centralOffset;
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The workbook has an invalid ZIP directory.");
    const method = view.getUint16(cursor + 10, true); const compressedSize = view.getUint32(cursor + 20, true); const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true); const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)); cursor += 46 + nameLength + extraLength + commentLength;
    const localNameLength = view.getUint16(localOffset + 26, true); const localExtraLength = view.getUint16(localOffset + 28, true); const start = localOffset + 30 + localNameLength + localExtraLength; const compressed = bytes.slice(start, start + compressedSize);
    if (method === 0) entries.set(name, decoder.decode(compressed));
    else if (method === 8) entries.set(name, decoder.decode(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
    else throw new Error(`Unsupported ZIP compression method: ${method}.`);
  }
  return entries;
}

function xmlElements(xml, tag) { return [...xml.getElementsByTagNameNS("*", tag)]; }
function xmlText(node) { return node ? node.textContent || "" : ""; }

async function xlsxToMarkdown(arrayBuffer) {
  const entries = await readZipEntries(arrayBuffer); const parser = new DOMParser(); const workbook = parser.parseFromString(entries.get("xl/workbook.xml") || "", "application/xml");
  const relsXml = parser.parseFromString(entries.get("xl/_rels/workbook.xml.rels") || "", "application/xml"); const relTargets = new Map(xmlElements(relsXml, "Relationship").map((rel) => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
  const shared = entries.get("xl/sharedStrings.xml") ? parser.parseFromString(entries.get("xl/sharedStrings.xml"), "application/xml") : null; const sharedValues = shared ? xmlElements(shared, "si").map(xmlText) : [];
  const sheets = xmlElements(workbook, "sheet"); const markdown = [];
  for (const sheet of sheets) {
    const target = relTargets.get(sheet.getAttribute("r:id")); if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`; const sheetXml = parser.parseFromString(entries.get(path) || "", "application/xml"); const rows = [];
    for (const rowNode of xmlElements(sheetXml, "row")) {
      const cells = []; for (const cell of xmlElements(rowNode, "c")) { const ref = cell.getAttribute("r") || "A1"; const col = ref.match(/^[A-Z]+/)[0]; let colIndex = 0; for (const char of col) colIndex = colIndex * 26 + char.charCodeAt(0) - 64; colIndex -= 1; while (cells.length <= colIndex) cells.push(""); const formula = xmlElements(cell, "f")[0]; const type = cell.getAttribute("t"); let value = formula ? `=${xmlText(formula)}` : xmlText(xmlElements(cell, "v")[0] || xmlElements(cell, "t")[0]); if (type === "s") value = sharedValues[Number(value)] || ""; if (type === "b") value = value === "1" ? "TRUE" : "FALSE"; cells[colIndex] = value; } rows.push(cells);
    }
    markdown.push(rowsToMarkdown(rows, sheet.getAttribute("name") || `Sheet${markdown.length + 1}`));
  }
  return markdown.join("\n\n");
}

async function exportSanitizedToXlsx() {
  const file = getActiveFile(); if (!file) return;
  try { const tables = parseMarkdownTables(file.sanitizedContent); const fallback = tables.length ? tables : [{ name: file.name.replace(/\.[^/.]+$/, "") || "Sheet1", rows: file.sanitizedContent.split(/\r?\n/).map((line) => [line]) }]; const blob = makeXlsxBlob(fallback); const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href; link.download = file.name.replace(/\.[^/.]+$/, "") + ".xlsx"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href); setStatus(`Exported ${link.download}.`); }
  catch (error) { setStatus(`XLSX export failed: ${error instanceof Error ? error.message : String(error)}`); }
}

async function exportSanitizedToHtml() {
  const file = getActiveFile();
  if (!file) {
    return;
  }
  const htmlBody = renderMarkdown(file.sanitizedContent);
  const html = `<!doctype html><html><head><meta charset=\"utf-8\"></head><body>${htmlBody}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const href = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = href;
  link.download = file.name.replace(/\.[^/.]+$/, "") + ".html";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  setStatus(`Exported ${link.download}.`);
}

async function deleteAllData() {
  if (!window.confirm("This will permanently delete all local projects and files. Continue?")) {
    return;
  }
  await deleteDatabase();
  state.projects = [];
  state.files = [];
  state.activeProjectId = null;
  state.activeFileId = null;
  await loadInitialState();
  setStatus("All local data cleared.");
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function parseImportedFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".xls")) {
    throw new Error("Legacy .xls files are not supported offline. Save the workbook as .xlsx or .csv first.");
  }

  if (lowerName.endsWith(".xlsx")) {
    const markdown = await xlsxToMarkdown(await file.arrayBuffer());
    return {
      name: file.name,
      type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      originalContent: markdown,
      sanitizedContent: markdown,
      warningCount: 0,
    };
  }

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
    const text = await file.text();
    const rows = csvToRows(text, lowerName.endsWith(".tsv") ? "\t" : ",");
    const markdown = rowsToMarkdown(rows, file.name.replace(/\.[^/.]+$/, "") || "Sheet1");
    return {
      name: file.name,
      type: file.type || (lowerName.endsWith(".tsv") ? "text/tab-separated-values" : "text/csv"),
      originalContent: markdown,
      sanitizedContent: markdown,
      warningCount: 0,
    };
  }

  if (lowerName.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const markdown = htmlToMarkdown(result.value);
    return {
      name: file.name,
      type: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalContent: markdown,
      sanitizedContent: markdown,
      warningCount: result.messages.length,
    };
  }

  const text = await file.text();

  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || file.type === "text/html") {
    const markdown = htmlToMarkdown(text);
    return {
      name: file.name,
      type: file.type || "text/html",
      originalContent: markdown,
      sanitizedContent: markdown,
      warningCount: 0,
    };
  }

  return {
    name: file.name,
    type: file.type || "text/plain",
    originalContent: text,
    sanitizedContent: text,
    warningCount: 0,
  };
}

function openImportModal() {
  els.filePicker.value = "";
  els.importModal.showModal();
}

function closeImportModal() {
  els.importModal.close();
}

async function importSelectedFiles() {
  const fileList = [...els.filePicker.files];
  if (fileList.length === 0) {
    setStatus("No files selected.");
    return;
  }

  if (!state.activeProjectId) {
    setStatus("Create a project first.");
    return;
  }

  let importedCount = 0;
  let warnings = 0;

  for (const browserFile of fileList) {
    const parsed = await parseImportedFile(browserFile);
    warnings += parsed.warningCount;
    await createFile(parsed);
    importedCount += 1;
  }

  setStatus(`Imported ${importedCount} file(s). DOCX warnings: ${warnings}.`);
}

async function ensureProjectForAction() {
  if (state.activeProjectId) {
    return;
  }
  const project = await createProject("Default Project");
  state.activeProjectId = project.id;
}

function bindEvents() {
  els.projectsViewBtn.addEventListener("click", () => showSidebarView("projects"));
  els.filesViewBtn.addEventListener("click", () => showSidebarView("files"));
  els.variablesViewBtn.addEventListener("click", () => showSidebarView("variables"));
  els.settingsViewBtn.addEventListener("click", () => showSidebarView("settings"));

  els.newProjectBtn.addEventListener("click", async () => {
    await promptNewProject();
  });

  els.deleteProjectBtn.addEventListener("click", async () => {
    await deleteActiveProject();
  });

  els.newFileBtn.addEventListener("click", async () => {
    await ensureProjectForAction();
    await promptNewEmptyFile();
  });

  els.deleteFileBtn.addEventListener("click", async () => {
    await deleteActiveFile();
  });

  els.projectList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const id = Number(target.dataset.projectId);
    if (id) {
      chooseProject(id);
    }
  });

  els.fileList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const id = Number(target.dataset.fileId);
    if (id) {
      chooseFile(id);
    }
  });

  els.markdownInput.addEventListener("input", updateSanitizedFromEditor);
  els.markdownInput.addEventListener("keydown", async (event) => {
    if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const file = getActiveFile();
    if (!file) {
      return;
    }

    const selection = getSelectionRange();
    const trimmed = getTrimmedSelectionRange(file.sanitizedContent, selection.start, selection.end);
    if (trimmed.end <= trimmed.start) {
      return;
    }

    event.preventDefault();
    await createVariableFromSelection();
  });

  els.createVariableBtn.addEventListener("click", async () => {
    await createVariableFromSelection();
  });

  els.regionSelect.addEventListener("change", () => {
    state.region = els.regionSelect.value;
    saveUiState();
  });

  els.retentionSelect.addEventListener("change", () => {
    state.retention = els.retentionSelect.value;
    if (state.retention === "clear_on_next_load") {
      window.localStorage.setItem(CLEAR_ON_NEXT_LOAD_KEY, "1");
    } else {
      window.localStorage.removeItem(CLEAR_ON_NEXT_LOAD_KEY);
    }
    saveUiState();
  });

  els.exportFormatSelect.addEventListener("change", () => {
    state.exportFormat = els.exportFormatSelect.value;
    applyExportFormatSetting();
  });

  els.clearDataBtn.addEventListener("click", async () => {
    await deleteAllData();
  });

  els.detectSensitiveBtn.addEventListener("click", async () => {
    await detectSensitiveData();
  });

  els.detectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const candidate = state.detectQueue[state.detectIndex];
    if (candidate) {
      await applyDetectionCandidate(candidate);
    }
    state.detectIndex += 1;
    showNextDetectionCandidate();
  });

  els.detectSkipBtn.addEventListener("click", () => {
    state.detectIndex += 1;
    showNextDetectionCandidate();
  });

  els.detectStopBtn.addEventListener("click", () => {
    state.detecting = false;
    els.detectModal.close();
    setStatus("Detection stopped.");
  });

  els.restoreAllBtn.addEventListener("click", async () => {
    await restoreAllVariables();
  });

  els.applyAllBtn.addEventListener("click", async () => {
    await applyAllVariables();
  });


  els.variableList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.dataset.action === "restore-one" && target.dataset.name) {
      await restoreOneVariable(target.dataset.name);
    }
    if (target.dataset.action === "apply-one" && target.dataset.name) {
      await applyOneVariable(target.dataset.name);
    }
    if (target.dataset.action === "delete-variable" && target.dataset.name) {
      await deleteVariable(target.dataset.name);
    }
  });

  els.copySanitizedBtn.addEventListener("click", async () => {
    await copySanitizedText();
  });

  els.exportDocxBtn.addEventListener("click", async () => {
    await exportSanitizedToDocx();
  });

  els.exportHtmlBtn.addEventListener("click", async () => {
    await exportSanitizedToHtml();
  });

  els.exportXlsxBtn.addEventListener("click", async () => {
    await exportSanitizedToXlsx();
  });

  els.openImportModalBtn.addEventListener("click", openImportModal);
  els.closeImportModalBtn.addEventListener("click", closeImportModal);

  els.importForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await importSelectedFiles();
      closeImportModal();
    } catch (error) {
      setStatus(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function bootstrap() {
  bindEvents();
  setEditorEnabled(false);

  try {
    if (window.localStorage.getItem(CLEAR_ON_NEXT_LOAD_KEY) === "1") {
      await deleteDatabase();
      window.localStorage.removeItem(CLEAR_ON_NEXT_LOAD_KEY);
    }
    await loadInitialState();
    setSidebarView(state.activeSidebarView);
    applySidebarState();
    setStatus("Ready.");
  } catch (error) {
    setStatus(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

bootstrap();
