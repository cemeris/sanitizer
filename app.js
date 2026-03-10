const DB_NAME = "sanitizer-db";
const DB_VERSION = 1;
const UI_STATE_KEY = "sanitizer.ui-state.v1";

const state = {
  projects: [],
  files: [],
  activeProjectId: null,
  activeFileId: null,
  saveTimer: null,
  statusTimer: null,
  sidebarOpen: false,
  activeSidebarView: "projects",
};

const els = {
  status: document.getElementById("status"),
  projectsViewBtn: document.getElementById("projectsViewBtn"),
  filesViewBtn: document.getElementById("filesViewBtn"),
  variablesViewBtn: document.getElementById("variablesViewBtn"),
  projectsView: document.getElementById("projectsView"),
  filesView: document.getElementById("filesView"),
  variablesView: document.getElementById("variablesView"),
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
  restoreAllBtn: document.getElementById("restoreAllBtn"),
  applyAllBtn: document.getElementById("applyAllBtn"),
  activeFileTitle: document.getElementById("activeFileTitle"),
  activeFileMeta: document.getElementById("activeFileMeta"),
  copySanitizedBtn: document.getElementById("copySanitizedBtn"),
  exportDocxBtn: document.getElementById("exportDocxBtn"),
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
  els.projectsViewBtn.classList.toggle("active", view === "projects");
  els.filesViewBtn.classList.toggle("active", view === "files");
  els.variablesViewBtn.classList.toggle("active", view === "variables");
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
  els.deleteFileBtn.disabled = !enabled;
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
          <code>${entry.name}</code>
          <code>${escapeHtml(entry.value)}</code>
          <span class="muted">${placeholderCount} placeholder(s), ${valueCount} value match(es)</span>
          <div class="variable-actions">
            <button type='button' class='ghost' data-action='restore-one' data-name='${entry.name}'>Restore</button>
            <button type='button' class='ghost' data-action='apply-one' data-name='${entry.name}'>Apply</button>
            <button type='button' class='ghost danger' data-action='delete-variable' data-name='${entry.name}'>Delete</button>
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
    saved?.activeSidebarView === "files" || saved?.activeSidebarView === "variables" ? saved.activeSidebarView : "projects";

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
  const guess = SanitizerCore.suggestVariableName(selected);
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

async function parseImportedFile(file) {
  const lowerName = file.name.toLowerCase();

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
    await loadInitialState();
    setSidebarView(state.activeSidebarView);
    applySidebarState();
    setStatus("Ready.");
  } catch (error) {
    setStatus(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

bootstrap();
