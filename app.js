const STORAGE_KEY = "windsor-v1";
const MAX_TOPIC_NOTES = 3;
const FILE_DB = "windsor-files";
const FILE_STORE = "files";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GROUP_META = [
  { id: "red", label: "Red" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "yellow", label: "Yellow" },
];

const OPTION_LETTERS = ["A", "B", "C", "D"];

const ACTIVITY_TAGS = [
  { id: "unplugged", label: "Unplugged" },
  { id: "individual", label: "Individual" },
  { id: "partner", label: "Partner" },
  { id: "group", label: "Group" },
  { id: "discussion", label: "Discussion" },
  { id: "research", label: "Research" },
  { id: "coding", label: "Coding" },
];

const WEEKDAYS = [
  { id: 1, name: "Monday", short: "Mon" },
  { id: 2, name: "Tuesday", short: "Tue" },
  { id: 3, name: "Wednesday", short: "Wed" },
  { id: 4, name: "Thursday", short: "Thu" },
  { id: 5, name: "Friday", short: "Fri" },
];

const DEFAULT_CLASSES = [
  { subject: "Computer Science", grade: "Grade 11/12", order: 1 },
  { subject: "STEM", grade: "Grade 6", order: 2 },
  { subject: "STEM", grade: "Grade 7", order: 3 },
  { subject: "STEM", grade: "Grade 8", order: 4 },
];

const DEFAULT_UNITS = {
  "Computer Science|Grade 11/12": [
    { name: "Creative Development (Big Idea One)", order: 1 },
    { name: "Data (Big Idea Two)", order: 2 },
    { name: "Algorithms and Programming (Big Idea Three)", order: 3 },
    { name: "Systems and Networks (Big Idea Four)", order: 4 },
    { name: "Impact Of Computing (Big Idea Five)", order: 5 },
  ],
};

const defaultState = () => ({
  updatedAt: 0,
  classes: [],
  periods: [],
  slots: [],
  students: [],
  categories: [],
  topics: [],
  activities: [],
  videos: [],
  pastPapers: [],
  lessons: [],
});

let state = defaultState();
let currentPage = "home";
let currentClassId = null;
let timetableDay = 1;
let selectedTopicId = null;
let openLessonId = null;
let topicReturnPage = "topics";
let pdfReturnPage = "topic";
let currentPdfUrl = null;
let pendingConfirm = null;
let pendingEdit = null;
let activityForm = null;
let activityIsNew = false;
let activityReturnPage = "topic";
let questionForm = null;
let questionIsNew = false;
let practiceIndex = 0;
let practiceRevealed = false;
let practicePicked = [];
let practiceReturnPage = "topic";
const foldOpenState = new Map();
const objectUrls = new Map();
let useApi = false;
let useCloud = false;
let saveTimer = null;
const isBrowse = document.body?.dataset.mode === "browse";
const BROWSE_PAGES = ["home", "topics", "topic", "activity", "pdf", "practice"];
const BROWSE_ACTIONS = new Set([
  "go-home",
  "open-class",
  "go-topics",
  "go-topic-back",
  "go-activity-back",
  "open-activity",
  "open-topic",
  "open-pdf",
  "close-pdf",
  "start-practice",
  "practice-next",
  "practice-prev",
  "practice-reveal",
  "practice-hide",
  "practice-pick",
  "go-practice-back",
]);

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function externalLink(href, label) {
  const url = normalizeUrl(href);
  if (!url) return escapeHtml(label ?? href ?? "");
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label ?? href)}</a>`;
}

function linkify(text) {
  return escapeHtml(text).replace(/\b(?:https?:\/\/|www\.)[^\s<]+/gi, (raw) => {
    let href = raw;
    let trailing = "";
    while (/[),.;:!?]$/.test(href)) {
      trailing = href.slice(-1) + trailing;
      href = href.slice(0, -1);
    }
    if (!href) return raw;
    const url = href.toLowerCase().startsWith("www.") ? `https://${href}` : href;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${href}</a>${trailing}`;
  });
}

function normalizeTopicNotes(topic) {
  if (Array.isArray(topic.notesFiles)) {
    return topic.notesFiles
      .filter((item) => item?.fileId)
      .slice(0, MAX_TOPIC_NOTES)
      .map((item) => ({
        id: item.id || uid(),
        fileId: item.fileId,
        fileName: item.fileName || "Student notes.pdf",
      }));
  }
  if (topic.notesFileId) {
    return [{ id: uid(), fileId: topic.notesFileId, fileName: topic.notesFileName || "Student notes.pdf" }];
  }
  return [];
}

function topicNotes(topic) {
  return Array.isArray(topic?.notesFiles) ? topic.notesFiles : [];
}

function syncTopicNotesLegacy(topic) {
  const notes = topicNotes(topic);
  topic.notesFileId = notes[0]?.fileId ?? null;
  topic.notesFileName = notes[0]?.fileName ?? "";
}

function normalizeTopic(topic) {
  const order = Number(topic.order);
  const notesFiles = normalizeTopicNotes(topic);
  return {
    id: topic.id,
    classId: topic.classId ?? null,
    name: topic.name ?? "",
    categoryId: topic.categoryId ?? null,
    overview: topic.overview ?? "",
    notesFiles,
    notesFileId: notesFiles[0]?.fileId ?? null,
    notesFileName: notesFiles[0]?.fileName ?? "",
    relatedTopicIds: Array.isArray(topic.relatedTopicIds) ? topic.relatedTopicIds : [],
    order: Number.isFinite(order) ? order : 99,
  };
}

function normalizeActivityTags(tags) {
  const selected = new Set(
    (Array.isArray(tags) ? tags : [])
      .map((value) => String(value ?? "").trim().toLowerCase())
      .map((value) => ACTIVITY_TAGS.find((tag) => tag.id === value || tag.label.toLowerCase() === value)?.id)
      .filter(Boolean)
  );
  return ACTIVITY_TAGS.map((tag) => tag.id).filter((id) => selected.has(id));
}

function activityTagLabels(activity) {
  const selected = new Set(normalizeActivityTags(activity?.tags));
  return ACTIVITY_TAGS.filter((tag) => selected.has(tag.id));
}

function tagIconSvg(id) {
  const inner = {
    unplugged:
      '<path d="M9 6V2"/><path d="M15 6V2"/><path d="M7 6h10v5a5 5 0 0 1-5 5v5"/><path d="M4 4l16 16"/>',
    individual:
      '<circle cx="12" cy="8" r="3.25"/><path d="M5.5 20c1.1-3.8 3.4-5.7 6.5-5.7s5.4 1.9 6.5 5.7"/>',
    partner:
      '<circle cx="8" cy="8" r="2.7"/><circle cx="16.2" cy="8" r="2.7"/><path d="M3.5 20c.8-3.3 2.6-5 4.6-5s3.8 1.7 4.6 5"/><path d="M11.3 20c.8-3.3 2.6-5 4.6-5s3.8 1.7 4.6 5"/>',
    group:
      '<circle cx="12" cy="6.8" r="2.4"/><circle cx="6.2" cy="9" r="2.15"/><circle cx="17.8" cy="9" r="2.15"/><path d="M8.2 20c.7-3 2.2-4.5 3.8-4.5s3.1 1.5 3.8 4.5"/><path d="M2.8 20c.7-2.8 2.1-4.2 3.6-4.2s2.8 1.3 3.5 3.4"/><path d="M14.1 19.2c.7-2.1 1.9-3.4 3.5-3.4s2.9 1.4 3.6 4.2"/>',
    discussion:
      '<path d="M7.5 16.5 5 19.5V8.5A2.5 2.5 0 0 1 7.5 6h6A2.5 2.5 0 0 1 16 8.5v4A2.5 2.5 0 0 1 13.5 15H7.5z"/><path d="M16 10h.5A2.5 2.5 0 0 1 19 12.5V20l-2.2-2.5H14"/>',
    research:
      '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/><path d="M9 11h4M11 9v4"/>',
    coding:
      '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.2 6-2.4 12"/>',
  }[id];
  if (!inner) return "";
  return `<svg class="tag-icon__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

function tagChipInner(tag) {
  return `<span class="tag-icon">${tagIconSvg(tag.id)}</span><span>${escapeHtml(tag.label)}</span>`;
}

function activityTagsHtml(activity) {
  const tags = activityTagLabels(activity);
  if (!tags.length) return "";
  return `<div class="tag-row">${tags
    .map((tag) => `<span class="tag">${tagChipInner(tag)}</span>`)
    .join("")}</div>`;
}

function activityTagIconsHtml(activity) {
  const tags = activityTagLabels(activity);
  if (!tags.length) return "";
  const names = tags.map((tag) => tag.label).join(", ");
  return `<span class="tag-icons" title="${escapeHtml(names)}" aria-label="${escapeHtml(names)}">${tags
    .map(
      (tag) =>
        `<span class="tag-icon" title="${escapeHtml(tag.label)}">${tagIconSvg(tag.id)}</span>`
    )
    .join("")}</span>`;
}

function iconSvg(name) {
  const inner = {
    trash:
      '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    practice:
      '<circle cx="12" cy="12" r="9"/><path d="m10 8.2 6.2 3.8-6.2 3.8z" fill="currentColor" stroke="none"/>',
    add: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    pdf: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    upload:
      '<path d="M12 16V5"/><path d="m8 9 4-4 4 4"/><path d="M5 19h14"/>',
  }[name];
  if (!inner) return "";
  return `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

function iconButtonHtml({ action, icon, label, id = "", extra = "", modifier = "" }) {
  const idAttr = id ? `data-id="${id}"` : "";
  return `<button type="button" class="icon-btn${modifier ? ` ${modifier}` : ""}" data-action="${action}" ${idAttr} ${extra} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${iconSvg(icon)}</button>`;
}

function iconFileLabelHtml({ upload, icon, label, modifier = "", extra = "" }) {
  return `<label class="icon-btn${modifier ? ` ${modifier}` : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
    ${iconSvg(icon)}
    <input class="hidden" type="file" accept="application/pdf,.pdf" data-upload="${escapeHtml(upload)}" ${extra} />
  </label>`;
}

function deleteIconHtml() {
  return iconSvg("trash");
}

function activityTagPickerHtml(selectedIds) {
  const selected = new Set(normalizeActivityTags(selectedIds));
  return `<fieldset class="tag-picker">
    <legend class="field-label">Tags</legend>
    <div class="tag-row tag-row--picker">
      ${ACTIVITY_TAGS.map(
        (tag) => `<label class="tag-check">
          <input type="checkbox" name="tag" value="${tag.id}" ${selected.has(tag.id) ? "checked" : ""} />
          <span class="tag">${tagChipInner(tag)}</span>
        </label>`
      ).join("")}
    </div>
  </fieldset>`;
}

function normalizeActivity(activity) {
  return {
    id: activity.id,
    topicId: activity.topicId,
    title: activity.title ?? "",
    description: activity.description ?? activity.notes ?? "",
    instructions: activity.instructions ?? "",
    materials: activity.materials ?? "",
    tags: normalizeActivityTags(activity.tags),
    media: Array.isArray(activity.media) ? activity.media : [],
    resources: Array.isArray(activity.resources) ? activity.resources : [],
  };
}

function blankActivity(topicId) {
  return {
    id: uid(),
    topicId,
    title: "",
    description: "",
    instructions: "",
    materials: "",
    tags: [],
    media: [],
    resources: [],
  };
}

function normalizePastPaper(paper) {
  const options = paper?.options && typeof paper.options === "object" ? paper.options : {};
  let correct = [];
  if (Array.isArray(paper?.correct)) correct = paper.correct;
  else if (typeof paper?.correct === "string" && paper.correct) correct = [paper.correct];
  correct = OPTION_LETTERS.filter((letter) => correct.map(String).includes(letter));
  const selectCount = Number(paper?.selectCount);
  return {
    id: paper.id,
    topicId: paper.topicId,
    title: paper.title ?? "",
    stem: paper.stem ?? "",
    options: {
      A: options.A ?? "",
      B: options.B ?? "",
      C: options.C ?? "",
      D: options.D ?? "",
    },
    correct,
    selectCount: Number.isFinite(selectCount) && selectCount > 0 ? selectCount : Math.max(correct.length, 1),
    notes: paper.notes ?? "",
    fileId: paper.fileId ?? null,
    fileName: paper.fileName ?? "",
  };
}

function blankPastPaper(topicId) {
  return normalizePastPaper({
    id: uid(),
    topicId,
    title: "",
    stem: "",
    options: { A: "", B: "", C: "", D: "" },
    correct: [],
    selectCount: 1,
    notes: "",
    fileId: null,
    fileName: "",
  });
}

function paperHasQuestion(paper) {
  if (!paper) return false;
  if (String(paper.stem ?? "").trim()) return true;
  return OPTION_LETTERS.some((letter) => String(paper.options?.[letter] ?? "").trim());
}

function paperLabel(paper) {
  const title = String(paper?.title ?? "").trim();
  if (title) return title;
  const stem = String(paper?.stem ?? "").trim();
  if (stem) return stem.split("\n")[0];
  return "Question";
}

function paperPrompt(paper) {
  const count = paper?.selectCount || paper?.correct?.length || 1;
  if (count <= 1) return "Choose one answer";
  const words = { 2: "two", 3: "three", 4: "four" };
  return `Choose ${words[count] ?? count} options`;
}

function mcqPapersForTopic(topicId) {
  return pastPapersForTopic(topicId).filter(paperHasQuestion);
}

function stampClassId(items, classId) {
  return items.map((item) => ({ ...item, classId: item.classId ?? classId }));
}

function normalizeClass(cls) {
  return {
    id: cls.id,
    subject: cls.subject ?? "",
    grade: cls.grade ?? "",
    order: cls.order ?? 99,
    journalFileId: cls.journalFileId ?? null,
    journalFileName: cls.journalFileName ?? "",
  };
}

function sameClass(a, b) {
  return a.subject.toLowerCase() === b.subject.toLowerCase() && a.grade.toLowerCase() === b.grade.toLowerCase();
}

function withDefaultClasses(classes) {
  const next = [...classes];
  DEFAULT_CLASSES.forEach((item) => {
    if (!next.some((cls) => sameClass(cls, item))) {
      next.push(normalizeClass({ id: uid(), subject: item.subject, grade: item.grade, order: item.order }));
    }
  });
  return next;
}

function unitOrderFromName(name) {
  const text = String(name ?? "");
  const word = text.match(/big idea\s+(one|two|three|four|five)/i);
  if (word) {
    return { one: 1, two: 2, three: 3, four: 4, five: 5 }[word[1].toLowerCase()];
  }
  const numbered = text.match(/big idea\s+(\d+)/i);
  if (numbered) {
    const order = Number(numbered[1]);
    if (order >= 1 && order <= 5) return order;
  }
  return null;
}

function withDefaultUnits(classes, categories) {
  const next = [...categories];
  classes.forEach((cls) => {
    const units = DEFAULT_UNITS[`${cls.subject}|${cls.grade}`];
    if (!units) return;
    units.forEach((unit) => {
      const existing = next.find(
        (item) => item.classId === cls.id && item.name.toLowerCase() === unit.name.toLowerCase()
      );
      if (existing) {
        existing.order = unit.order;
      } else {
        next.push({ id: uid(), classId: cls.id, name: unit.name, order: unit.order });
      }
    });
    next.forEach((item) => {
      if (item.classId !== cls.id) return;
      const inferred = unitOrderFromName(item.name);
      if (inferred) item.order = inferred;
    });
  });
  return next;
}

function normalizeState(parsed) {
  let classes = Array.isArray(parsed.classes) ? parsed.classes : [];
  let students = Array.isArray(parsed.students) ? parsed.students : [];
  let categories = Array.isArray(parsed.categories) ? parsed.categories : [];
  let topics = (Array.isArray(parsed.topics) ? parsed.topics : []).map(normalizeTopic);
  let lessons = Array.isArray(parsed.lessons) ? parsed.lessons : [];
  const hasLegacyData = students.length || topics.length || lessons.length || categories.length;

  if (!classes.length && hasLegacyData) {
    classes = [{ id: uid(), subject: "My class", grade: "", order: 99 }];
  }
  classes = withDefaultClasses(classes).map(normalizeClass);
  categories = withDefaultUnits(classes, categories);
  const fallbackId = classes.find((cls) => cls.subject === "My class")?.id ?? classes[0]?.id ?? null;
  if (fallbackId) {
    students = stampClassId(students, fallbackId);
    categories = stampClassId(categories, fallbackId);
    topics = stampClassId(topics, fallbackId);
    lessons = stampClassId(lessons, fallbackId);
  }

  return {
    updatedAt: Number(parsed.updatedAt) || 0,
    classes,
    periods: Array.isArray(parsed.periods) ? parsed.periods : [],
    slots: Array.isArray(parsed.slots) ? parsed.slots : [],
    students,
    categories,
    topics,
    activities: (Array.isArray(parsed.activities) ? parsed.activities : []).map(normalizeActivity),
    videos: Array.isArray(parsed.videos) ? parsed.videos : [],
    pastPapers: (Array.isArray(parsed.pastPapers) ? parsed.pastPapers : []).map(normalizePastPaper),
    lessons,
  };
}

function usingCloud() {
  return useCloud;
}

function cloudFunctionUrl(name) {
  if (window.location.protocol === "file:") return null;
  return `${window.location.origin}/.netlify/functions/${name}`;
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function writeLocalState() {
  try {
    state.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage can be full or blocked */
  }
}

async function pingApi() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function pingCloud() {
  const url = cloudFunctionUrl("sync-windsor");
  if (!url) return false;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

async function pushStateRemote() {
  if (isBrowse) return;
  if (usingCloud()) {
    const response = await fetch(cloudFunctionUrl("sync-windsor"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
      keepalive: true,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save to the cloud.");
    return;
  }
  if (!useApi) return;
  await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
    keepalive: true,
  });
}

async function pushStateToApi() {
  try {
    await pushStateRemote();
  } catch {
    /* keep the local copy if the database is briefly unavailable */
  }
}

function saveState() {
  if (isBrowse) return;
  writeLocalState();
  if (!usingCloud() && !useApi) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushStateToApi, 250);
}

function flushSave() {
  if (isBrowse) return;
  writeLocalState();
  if (!usingCloud() && !useApi) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  pushStateToApi();
}

async function loadRemoteState() {
  if (usingCloud()) {
    const response = await fetch(cloudFunctionUrl("sync-windsor"), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return null;
    return data.state && typeof data.state === "object" ? data.state : null;
  }
  if (!useApi) return null;
  const response = await fetch("/api/state", { cache: "no-store" });
  if (response.status !== 200) return null;
  const parsed = await response.json();
  return parsed && typeof parsed === "object" ? parsed : null;
}

async function loadState() {
  const local = loadLocalState();
  try {
    const parsed = await loadRemoteState();
    if (parsed) {
      const remote = normalizeState(parsed);
      const remoteAt = Number(parsed.updatedAt) || 0;
      const localAt = Number(local.updatedAt) || 0;
      const chosen = remoteAt >= localAt ? remote : local;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen));
      } catch {
        /* ignore */
      }
      return chosen;
    }
  } catch {
    /* fall back to the browser copy */
  }
  return local;
}

function openFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putFile(id, blob, name) {
  if (usingCloud()) {
    try {
      const response = await fetch(cloudFunctionUrl("windsor-file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", id, name, type: blob.type || "application/octet-stream" }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        await fetch(data.url, {
          method: "PUT",
          headers: {
            "Content-Type": data.contentType || blob.type || "application/octet-stream",
            "x-upsert": "true",
          },
          body: blob,
        });
      }
    } catch {
      /* keep a local copy below */
    }
  } else if (useApi) {
    try {
      await fetch(`/api/files/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(name || "file"),
        },
        body: blob,
      });
    } catch {
      /* keep a local copy below */
    }
  }
  const db = await openFileDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).put({ id, blob, name, type: blob.type || "application/pdf" });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFile(id) {
  if (usingCloud()) {
    try {
      const response = await fetch(`${cloudFunctionUrl("windsor-file")}?action=download&id=${encodeURIComponent(id)}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.url) {
        const fileResponse = await fetch(data.url);
        if (fileResponse.ok) {
          const blob = await fileResponse.blob();
          return { id, blob, name: "file", type: blob.type };
        }
      }
    } catch {
      /* fall back to IndexedDB */
    }
  } else if (useApi) {
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(id)}`);
      if (response.ok) {
        const blob = await response.blob();
        const headerName = response.headers.get("X-File-Name");
        const name = headerName ? decodeURIComponent(headerName) : "file";
        return { id, blob, name, type: blob.type };
      }
    } catch {
      /* fall back to IndexedDB */
    }
  }
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readonly");
    const request = tx.objectStore(FILE_STORE).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFile(id) {
  if (!id) return;
  if (usingCloud()) {
    try {
      await fetch(cloudFunctionUrl("windsor-file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
    } catch {
      /* still remove the local copy */
    }
  } else if (useApi) {
    try {
      await fetch(`/api/files/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* still remove the local copy */
    }
  }
  const db = await openFileDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, "readwrite");
    tx.objectStore(FILE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function allLocalFiles() {
  try {
    const db = await openFileDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, "readonly");
      const request = tx.objectStore(FILE_STORE).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function remoteFileIds() {
  if (usingCloud()) {
    const response = await fetch(`${cloudFunctionUrl("windsor-file")}?action=list`);
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.ids) ? data.ids : [];
  }
  if (!useApi) return [];
  const response = await fetch("/api/files", { cache: "no-store" });
  if (!response.ok) return [];
  const ids = await response.json();
  return Array.isArray(ids) ? ids : [];
}

async function migrateLocalFilesToApi() {
  if (isBrowse || (!usingCloud() && !useApi)) return;
  let have = new Set();
  try {
    have = new Set(await remoteFileIds());
  } catch {
    return;
  }
  const records = await allLocalFiles();
  for (const record of records) {
    if (!record?.id || have.has(record.id) || !record.blob) continue;
    try {
      await putFile(record.id, record.blob, record.name || "file");
    } catch {
      /* skip files that cannot be copied */
    }
  }
}

function todayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function classById(id) {
  return state.classes.find((item) => item.id === id) ?? null;
}

function classLabel(item) {
  if (!item) return "Class";
  if (item.grade && item.subject) return `${item.subject} (${item.grade})`;
  return item.subject || item.grade || "Class";
}

function journalCardHtml(cls) {
  if (!cls) return "";
  if (isBrowse && !cls.journalFileId) return "";
  const body = cls.journalFileId
    ? `<p class="file-name">${escapeHtml(cls.journalFileName || "Journal.pdf")}</p>
       <div class="row" style="margin-top: 0.7rem;">
         <button type="button" class="btn btn--primary" data-action="open-pdf" data-file-id="${cls.journalFileId}" data-title="${escapeHtml(classLabel(cls))} journal">Open PDF</button>
         ${
           isBrowse
             ? ""
             : `<label class="btn">Replace
           <input class="hidden" type="file" accept="application/pdf,.pdf" data-upload="journal" />
         </label>
         <button type="button" class="btn" data-action="remove-journal">Remove</button>`
         }
       </div>`
    : `<p class="empty">Upload a PDF of this subject's journal.</p>
       <label class="btn btn--primary" style="margin-top: 0.6rem;">Upload PDF
         <input class="hidden" type="file" accept="application/pdf,.pdf" data-upload="journal" />
       </label>`;
  return `<div class="card">
    <h2>Journal</h2>
    ${body}
  </div>`;
}

function currentClass() {
  return classById(currentClassId);
}

function sortedClasses() {
  return [...state.classes].sort((a, b) => {
    const orderA = a.order ?? 99;
    const orderB = b.order ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return classLabel(a).localeCompare(classLabel(b), undefined, { sensitivity: "base" });
  });
}

function classStudents() {
  return state.students.filter((student) => student.classId === currentClassId);
}

function classCategories() {
  return state.categories.filter((category) => category.classId === currentClassId);
}

function classTopics() {
  return state.topics.filter((topic) => topic.classId === currentClassId);
}

function classLessons() {
  return state.lessons.filter((lesson) => lesson.classId === currentClassId);
}

function sortedPeriods() {
  return [...state.periods].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function slotFor(day, periodId) {
  return state.slots.find((slot) => slot.day === day && slot.periodId === periodId) ?? null;
}

function todayWeekday() {
  const day = new Date().getDay();
  return day >= 1 && day <= 5 ? day : null;
}

function periodTimeLabel(period) {
  if (period.start && period.end) return `${period.start}–${period.end}`;
  if (period.start) return period.start;
  return "";
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function parseTime(value) {
  if (!value || !value.includes(":")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function isCurrentPeriod(period) {
  const start = parseTime(period.start);
  const end = parseTime(period.end);
  if (start == null || end == null) return false;
  const now = minutesNow();
  return now >= start && now < end;
}

function todaysLessonFor(classId) {
  const today = todayKey();
  return [...state.lessons]
    .filter((lesson) => lesson.classId === classId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .find((lesson) => lesson.date === today) ?? null;
}

function studentName(id) {
  return state.students.find((student) => student.id === id)?.name ?? "Unknown";
}

function topicById(id) {
  return state.topics.find((topic) => topic.id === id) ?? null;
}

function categoryById(id) {
  return state.categories.find((category) => category.id === id) ?? null;
}

function categoryName(id) {
  return categoryById(id)?.name ?? "No unit";
}

function activitiesForTopic(topicId) {
  return state.activities.filter((activity) => activity.topicId === topicId);
}

function videosForTopic(topicId) {
  return state.videos.filter((video) => video.topicId === topicId);
}

function pastPapersForTopic(topicId) {
  return state.pastPapers.filter((paper) => paper.topicId === topicId);
}

function sortedCategories() {
  return [...classCategories()].sort((a, b) => {
    const orderA = a.order ?? 99;
    const orderB = b.order ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function sortedTopics(topics = classTopics()) {
  return [...topics].sort((a, b) => {
    const orderA = a.order ?? 99;
    const orderB = b.order ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function nextTopicOrder(unitId) {
  const inUnit = classTopics().filter((topic) => (topic.categoryId || "") === (unitId || ""));
  return inUnit.reduce((max, topic) => Math.max(max, topic.order ?? 0), 0) + 1;
}

function nextClassOrder() {
  return state.classes.reduce((max, cls) => Math.max(max, cls.order ?? 0), 0) + 1;
}

function parseSortOrder(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

function topicsGroupedByCategory() {
  const topics = classTopics();
  const grouped = sortedCategories().map((category) => ({
    category,
    topics: sortedTopics(topics.filter((topic) => topic.categoryId === category.id)),
  }));
  const uncategorised = sortedTopics(topics.filter((topic) => !categoryById(topic.categoryId)));
  if (uncategorised.length) {
    grouped.push({ category: { id: "", name: "No unit" }, topics: uncategorised });
  }
  return grouped;
}

function findOrCreateCategory(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || !currentClassId) return null;
  const existing = classCategories().find(
    (category) => category.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) return existing.id;
  const order = classCategories().reduce((max, category) => Math.max(max, category.order ?? 0), 0) + 1;
  const category = { id: uid(), classId: currentClassId, name: trimmed, order };
  state.categories.push(category);
  return category.id;
}

function unitSelectHtml(selectedId = "", { required = false, emptyLabel = "Choose a unit" } = {}) {
  const units = sortedCategories();
  const options = [
    `<option value="" ${selectedId ? "" : "selected"}>${escapeHtml(emptyLabel)}</option>`,
    ...units.map(
      (unit) =>
        `<option value="${unit.id}" ${unit.id === selectedId ? "selected" : ""}>${escapeHtml(unit.name)}</option>`
    ),
  ];
  return options.join("");
}

function topicSelectHtml(selectedId = "", { emptyLabel = "Choose a topic" } = {}) {
  const grouped = topicsGroupedByCategory().filter((group) => group.topics.length);
  const options = [
    `<option value="" ${selectedId ? "" : "selected"}>${escapeHtml(grouped.length ? emptyLabel : "Add a topic first")}</option>`,
  ];
  grouped.forEach((group) => {
    options.push(`<optgroup label="${escapeHtml(group.category.name)}">`);
    group.topics.forEach((topic) => {
      options.push(
        `<option value="${topic.id}" ${topic.id === selectedId ? "selected" : ""}>${escapeHtml(topic.name)}</option>`
      );
    });
    options.push("</optgroup>");
  });
  return options.join("");
}

function parseNameLines(value) {
  const seen = new Set();
  const names = [];
  String(value ?? "")
    .split(/\r?\n/)
    .forEach((line) => {
      const name = line.replace(/^\s*[-*]\s+/, "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
  return names;
}

function createTopic(name, unitId, order) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || !currentClassId) return null;
  const exists = classTopics().some(
    (topic) =>
      topic.name.toLowerCase() === trimmed.toLowerCase() && (topic.categoryId || "") === (unitId || "")
  );
  if (exists) return null;
  const topic = normalizeTopic({
    id: uid(),
    classId: currentClassId,
    name: trimmed,
    categoryId: unitId || null,
    overview: "",
    notesFiles: [],
    notesFileId: null,
    notesFileName: "",
    relatedTopicIds: [],
    order: parseSortOrder(order, nextTopicOrder(unitId)),
  });
  state.topics.push(topic);
  return topic;
}

function createNamedActivity(title, topicId) {
  const trimmed = String(title ?? "").trim();
  if (!trimmed || !topicId) return null;
  const exists = activitiesForTopic(topicId).some(
    (activity) => activity.title.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) return null;
  const activity = blankActivity(topicId);
  activity.title = trimmed;
  state.activities.push(normalizeActivity(activity));
  return activity;
}

function parseActivityBulkLines(value, defaultTopicId) {
  const items = [];
  const seen = new Set();
  String(value ?? "")
    .split(/\r?\n/)
    .forEach((raw) => {
      const line = raw.replace(/^\s*[-*]\s+/, "").trim();
      if (!line) return;
      let topicId = defaultTopicId;
      let title = line;
      if (line.includes("::")) {
        const parts = line.split("::");
        const topicName = parts[0].trim();
        title = parts.slice(1).join("::").trim();
        const match = classTopics().find((topic) => topic.name.toLowerCase() === topicName.toLowerCase());
        if (!match || !title) return;
        topicId = match.id;
      }
      if (!title || !topicId) return;
      const key = `${topicId}|${title.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ topicId, title });
    });
  return items;
}

function lessonById(id) {
  return state.lessons.find((lesson) => lesson.id === id) ?? null;
}

function sortedLessons() {
  return [...classLessons()].sort((a, b) => {
    if (a.createdAt === b.createdAt) return 0;
    return a.createdAt > b.createdAt ? -1 : 1;
  });
}

function todaysLesson() {
  return todaysLessonFor(currentClassId);
}

function previousLesson(beforeLessonId = null) {
  const lessons = sortedLessons();
  if (!beforeLessonId) return lessons[0] ?? null;
  const index = lessons.findIndex((lesson) => lesson.id === beforeLessonId);
  return index >= 0 ? lessons[index + 1] ?? null : lessons[0] ?? null;
}

function randomGroups() {
  const ids = shuffle(classStudents().map((student) => student.id));
  const groups = [[], [], [], []];
  ids.forEach((id, index) => {
    groups[index % 4].push(id);
  });
  return groups.map(sortGroup);
}

function groupsFromPrevious(previous) {
  const livingIds = new Set(classStudents().map((student) => student.id));
  const groups = [[], [], [], []];
  const placed = new Set();

  (previous?.groups ?? [[], [], [], []]).forEach((group, index) => {
    (group ?? []).forEach((id) => {
      if (livingIds.has(id) && !placed.has(id)) {
        groups[index].push(id);
        placed.add(id);
      }
    });
  });

  classStudents()
    .map((student) => student.id)
    .filter((id) => !placed.has(id))
    .forEach((id) => {
      const smallest = groups.reduce(
        (best, group, index) => (group.length < groups[best].length ? index : best),
        0
      );
      groups[smallest].push(id);
    });

  return groups.map(sortGroup);
}

function sortGroup(ids) {
  return [...ids].sort((a, b) => studentName(a).localeCompare(studentName(b), undefined, { sensitivity: "base" }));
}

function activityUsedCount(activityId, exceptLessonId = null) {
  return state.lessons.filter(
    (lesson) => lesson.id !== exceptLessonId && lesson.completedActivityIds.includes(activityId)
  ).length;
}

function youtubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace("/", "").split("/")[0] || null;
    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
    const embed = parsed.pathname.match(/\/embed\/([^/?]+)/);
    return embed ? embed[1] : null;
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function storePdf(file) {
  if (!isPdfFile(file)) {
    window.alert("Please choose a PDF file.");
    return null;
  }
  if (file.size > MAX_PDF_BYTES) {
    window.alert("That PDF is too large. Please use a file under 25 MB.");
    return null;
  }
  const id = uid();
  await putFile(id, file, file.name);
  return { id, name: file.name };
}

async function storeImage(file) {
  if (!file.type.startsWith("image/")) {
    window.alert("Please choose an image.");
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    window.alert("That image is too large. Please use a file under 8 MB.");
    return null;
  }
  const id = uid();
  await putFile(id, file, file.name);
  return { id, name: file.name };
}

async function removeActivityFiles(activity) {
  if (!activity) return;
  const ids = [
    ...(activity.media ?? []).map((item) => item.fileId),
    ...(activity.resources ?? []).map((item) => item.fileId),
  ].filter(Boolean);
  await Promise.all(ids.map((id) => deleteFile(id)));
}

async function fileSrc(fileId) {
  if (!fileId) return "";
  if (objectUrls.has(fileId)) return objectUrls.get(fileId);
  const record = await getFile(fileId);
  if (!record?.blob) return "";
  const url = URL.createObjectURL(record.blob);
  objectUrls.set(fileId, url);
  return url;
}

async function hydrateFileImages() {
  const nodes = document.querySelectorAll("[data-file-src]");
  for (const node of nodes) {
    const url = await fileSrc(node.dataset.fileSrc);
    if (url) node.src = url;
  }
}

function activityImages(activity) {
  return (activity?.media ?? []).filter((item) => item.kind === "image");
}

function activityVideos(activity) {
  return (activity?.media ?? []).filter((item) => item.kind === "video");
}

function captureActivityForm() {
  const form = document.querySelector("[data-form='save-activity']");
  if (!form || !activityForm) return;
  const data = new FormData(form);
  activityForm.title = String(data.get("title") ?? "");
  activityForm.description = String(data.get("description") ?? "");
  activityForm.instructions = String(data.get("instructions") ?? "");
  activityForm.materials = String(data.get("materials") ?? "");
  activityForm.tags = normalizeActivityTags(data.getAll("tag"));
  activityVideos(activityForm).forEach((video) => {
    video.title = String(data.get(`videoTitle-${video.id}`) ?? video.title);
    video.url = normalizeUrl(data.get(`videoUrl-${video.id}`) ?? video.url);
  });
  (activityForm.resources ?? []).forEach((resource) => {
    resource.title = String(data.get(`resourceTitle-${resource.id}`) ?? resource.title);
    resource.url = String(data.get(`resourceUrl-${resource.id}`) ?? resource.url).trim();
    if (resource.url) resource.url = normalizeUrl(resource.url);
  });
}

function saveActivityForm() {
  captureActivityForm();
  if (!activityForm) return false;
  const title = activityForm.title.trim();
  if (!title) {
    window.alert("Please add an activity title.");
    return false;
  }
  activityForm.title = title;
  activityForm.description = activityForm.description.trim();
  activityForm.instructions = activityForm.instructions.trim();
  activityForm.materials = activityForm.materials.trim();
  activityForm.media = (activityForm.media ?? []).filter((item) => {
    if (item.kind === "image") return Boolean(item.fileId);
    return Boolean(item.url || item.title);
  });
  activityForm.resources = (activityForm.resources ?? []).filter(
    (item) => item.title.trim() || item.url || item.fileId
  );
  const existing = state.activities.find((item) => item.id === activityForm.id);
  if (existing) Object.assign(existing, normalizeActivity(activityForm));
  else state.activities.push(normalizeActivity(activityForm));
  saveState();
  activityIsNew = false;
  return true;
}

function openActivityEditor(activityId = null) {
  activityReturnPage = currentPage === "lesson" ? "lesson" : "topic";
  if (activityId) {
    const activity = state.activities.find((item) => item.id === activityId);
    if (!activity) return;
    activityIsNew = false;
    activityForm = normalizeActivity(JSON.parse(JSON.stringify(activity)));
  } else {
    if (!selectedTopicId) return;
    activityIsNew = true;
    activityForm = blankActivity(selectedTopicId);
  }
  showPage("activity");
}

function captureQuestionForm() {
  const form = document.querySelector("[data-form='save-question']");
  if (!form || !questionForm) return;
  const data = new FormData(form);
  questionForm.title = String(data.get("title") ?? "");
  questionForm.stem = String(data.get("stem") ?? "");
  questionForm.notes = String(data.get("notes") ?? "");
  OPTION_LETTERS.forEach((letter) => {
    questionForm.options[letter] = String(data.get(`option${letter}`) ?? "");
  });
  questionForm.correct = data.getAll("correct").filter((letter) => OPTION_LETTERS.includes(letter));
  questionForm.selectCount = Math.max(questionForm.correct.length, 1);
}

function saveQuestionForm() {
  captureQuestionForm();
  if (!questionForm) return false;
  questionForm.title = questionForm.title.trim();
  questionForm.stem = questionForm.stem.trim();
  questionForm.notes = questionForm.notes.trim();
  OPTION_LETTERS.forEach((letter) => {
    questionForm.options[letter] = questionForm.options[letter].trim();
  });
  if (!questionForm.stem) {
    window.alert("Please type the question.");
    return false;
  }
  const filled = OPTION_LETTERS.filter((letter) => questionForm.options[letter]);
  if (filled.length < 2) {
    window.alert("Please add at least two options, A to D.");
    return false;
  }
  if (!questionForm.correct.length) {
    window.alert("Please tick the correct answer. Tick two or more for a multi-select question.");
    return false;
  }
  const missing = questionForm.correct.filter((letter) => !questionForm.options[letter]);
  if (missing.length) {
    window.alert(`Add text for option ${missing.join(" and ")} before marking it correct.`);
    return false;
  }
  questionForm.selectCount = questionForm.correct.length;
  const existing = state.pastPapers.find((item) => item.id === questionForm.id);
  if (existing) Object.assign(existing, normalizePastPaper(questionForm));
  else state.pastPapers.push(normalizePastPaper(questionForm));
  saveState();
  questionIsNew = false;
  return true;
}

function openQuestionEditor(questionId = null) {
  if (questionId) {
    const paper = state.pastPapers.find((item) => item.id === questionId);
    if (!paper) return;
    questionIsNew = false;
    questionForm = normalizePastPaper(JSON.parse(JSON.stringify(paper)));
  } else {
    if (!selectedTopicId) return;
    questionIsNew = true;
    questionForm = blankPastPaper(selectedTopicId);
  }
  showPage("question");
}

function openPractice(startId = null) {
  const papers = mcqPapersForTopic(selectedTopicId);
  if (!papers.length) return;
  practiceReturnPage = currentPage === "lesson" ? "lesson" : "topic";
  const index = startId ? papers.findIndex((paper) => paper.id === startId) : 0;
  practiceIndex = index >= 0 ? index : 0;
  practiceRevealed = false;
  practicePicked = [];
  showPage("practice");
}

function showPage(page) {
  if (isBrowse && !BROWSE_PAGES.includes(page)) page = "home";
  currentPage = page;
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("hidden", section.id !== `page-${page}`);
  });
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (currentPage === "home") renderHome();
  if (currentPage === "class") renderClass();
  if (currentPage === "classes") renderClasses();
  if (currentPage === "timetable") renderTimetable();
  if (currentPage === "start") renderStart();
  if (currentPage === "lesson") renderLesson();
  if (currentPage === "topics") renderTopics();
  if (currentPage === "topic") renderTopic();
  if (currentPage === "activity") renderActivity();
  if (currentPage === "question") renderQuestion();
  if (currentPage === "practice") renderPractice();
  if (currentPage === "students") renderStudents();
  if (currentPage === "history") renderHistory();
  if (currentPage === "settings") renderSettings();
  hydrateFileImages();
}

function renderBrowseHome() {
  const dateEl = document.getElementById("home-date");
  if (dateEl) dateEl.textContent = "Choose a subject to open its units, topics, and activities.";
  const classes = sortedClasses();
  const list = classes.length
    ? `<div class="card">
        <h2>Subjects</h2>
        <div class="list">${classes
          .map((cls) => {
            const units = state.categories.filter((item) => item.classId === cls.id).length;
            const topics = state.topics.filter((item) => item.classId === cls.id);
            const activities = topics.reduce((count, topic) => count + activitiesForTopic(topic.id).length, 0);
            return `<button type="button" class="nav-card" data-action="open-class" data-id="${cls.id}">
              <span class="nav-card__label">${escapeHtml(classLabel(cls))}</span>
              <span class="nav-card__desc">${units} unit${units === 1 ? "" : "s"} · ${topics.length} topic${topics.length === 1 ? "" : "s"} · ${activities} activit${activities === 1 ? "y" : "ies"}</span>
            </button>`;
          })
          .join("")}</div>
      </div>`
    : `<div class="card"><p class="empty">Nothing to browse yet. Subjects and topics are added in the planning app.</p></div>`;
  document.getElementById("home-content").innerHTML = list;
}

function renderHome() {
  if (isBrowse) {
    renderBrowseHome();
    return;
  }
  document.getElementById("home-date").textContent = formatLongDate();
  const weekday = todayWeekday();
  const periods = sortedPeriods();

  let scheduleHtml;
  if (!state.classes.length) {
    scheduleHtml = `<div class="setup-card">
      <strong>Set up your week</strong>
      <ol>
        <li>Add the subjects and grade levels you teach.</li>
        <li>Enter your timetable.</li>
        <li>Tap today’s class to start a lesson.</li>
      </ol>
    </div>`;
  } else if (!weekday) {
    scheduleHtml = `<div class="card"><p class="empty">No lessons are scheduled at the weekend. Open a class below if you need to plan.</p></div>`;
  } else if (!periods.length) {
    scheduleHtml = `<div class="setup-card">
      <strong>Add your timetable</strong>
      <p>Once periods and classes are on the timetable, today’s lessons will appear here.</p>
    </div>`;
  } else {
    const dayName = WEEKDAYS.find((day) => day.id === weekday)?.name ?? "Today";
    const rows = periods
      .map((period) => {
        const slot = slotFor(weekday, period.id);
        const cls = slot ? classById(slot.classId) : null;
        const time = periodTimeLabel(period);
        const lesson = cls ? todaysLessonFor(cls.id) : null;
        if (!cls) {
          return `<div class="nav-card schedule-slot is-free">
            <span class="schedule-slot__when">${escapeHtml(period.name)}${time ? `<br>${escapeHtml(time)}` : ""}</span>
            <span>
              <span class="nav-card__label">Free</span>
              <span class="nav-card__desc">${escapeHtml(dayName)}</span>
            </span>
          </div>`;
        }
        return `<button type="button" class="nav-card schedule-slot ${isCurrentPeriod(period) ? "is-now" : ""}" data-action="open-class" data-id="${cls.id}">
          <span class="schedule-slot__when">${escapeHtml(period.name)}${time ? `<br>${escapeHtml(time)}` : ""}</span>
          <span>
            <span class="nav-card__label">${escapeHtml(classLabel(cls))}</span>
            <span class="nav-card__desc">${lesson ? `Lesson in progress · ${lesson.completedActivityIds.length} ticked off` : "Tap to open this class"}</span>
          </span>
        </button>`;
      })
      .join("");
    scheduleHtml = `<div class="card">
      <h2>Today’s schedule</h2>
      <div class="schedule">${rows}</div>
    </div>`;
  }

  const classList = state.classes.length
    ? `<div class="card">
        <h2>All classes</h2>
        <div class="list">${sortedClasses()
          .map((cls) => {
            const lesson = todaysLessonFor(cls.id);
            return `<button type="button" class="nav-card" data-action="open-class" data-id="${cls.id}">
              <span class="nav-card__label">${escapeHtml(classLabel(cls))}</span>
              <span class="nav-card__desc">${lesson ? "Lesson in progress today" : `${state.students.filter((student) => student.classId === cls.id).length} students`}</span>
            </button>`;
          })
          .join("")}</div>
      </div>`
    : "";

  document.getElementById("home-content").innerHTML = `
    ${scheduleHtml}
    ${classList}
    <div class="home-grid">
      <button type="button" class="nav-card" data-action="go-classes">
        <span class="nav-card__label">Subjects &amp; grades</span>
        <span class="nav-card__desc">${state.classes.length ? `${state.classes.length} class${state.classes.length === 1 ? "" : "es"}` : "Add the classes you teach"}</span>
      </button>
      <button type="button" class="nav-card" data-action="go-timetable">
        <span class="nav-card__label">Timetable</span>
        <span class="nav-card__desc">${periods.length ? `${periods.length} period${periods.length === 1 ? "" : "s"}` : "Set periods and weekly lessons"}</span>
      </button>
      <button type="button" class="nav-card" data-action="go-settings">
        <span class="nav-card__label">Backup</span>
        <span class="nav-card__desc">Export or restore your data.</span>
      </button>
      <a class="nav-card" href="browse.html">
        <span class="nav-card__label">Browse view</span>
        <span class="nav-card__desc">Read-only subjects, topics, and activities for someone else.</span>
      </a>
    </div>
  `;
}

function renderClass() {
  const cls = currentClass();
  if (!cls) {
    currentPage = "home";
    renderHome();
    return;
  }
  document.getElementById("class-title").textContent = classLabel(cls);
  const today = todaysLesson();
  const topic = today ? topicById(today.topicId) : null;
  const students = classStudents();
  const topics = classTopics();
  const needsSetup = students.length === 0 || topics.length === 0;
  const setup = needsSetup
    ? `<div class="setup-card">
        <strong>Set up ${escapeHtml(classLabel(cls))}</strong>
        <ol>
          <li>Add your students.</li>
          <li>Create a topic and a few activities.</li>
          <li>Start today’s lesson.</li>
        </ol>
      </div>`
    : "";

  const continueCard = today
    ? `<button type="button" class="nav-card nav-card--primary nav-card--wide" data-action="open-lesson" data-id="${today.id}">
        <span class="nav-card__label">Continue today’s lesson</span>
        <span class="nav-card__desc">${escapeHtml(topic?.name ?? "Untitled topic")} · ${today.completedActivityIds.length} ticked off</span>
      </button>`
    : `<button type="button" class="nav-card nav-card--primary nav-card--wide" data-action="go-start">
        <span class="nav-card__label">Start today’s lesson</span>
        <span class="nav-card__desc">Choose a topic, then group your class.</span>
      </button>`;

  document.getElementById("class-content").innerHTML = `
    ${setup}
    ${journalCardHtml(cls)}
    <div class="home-grid">
      ${continueCard}
      ${today ? `<button type="button" class="nav-card" data-action="go-start">
        <span class="nav-card__label">Start another lesson</span>
        <span class="nav-card__desc">For a new period or a different topic.</span>
      </button>` : ""}
      <button type="button" class="nav-card" data-action="go-topics">
        <span class="nav-card__label">Units &amp; topics</span>
        <span class="nav-card__desc">${classCategories().length} unit${classCategories().length === 1 ? "" : "s"} · ${topics.length} topic${topics.length === 1 ? "" : "s"}</span>
      </button>
      <button type="button" class="nav-card" data-action="go-students">
        <span class="nav-card__label">Students</span>
        <span class="nav-card__desc">${students.length} student${students.length === 1 ? "" : "s"} in this class</span>
      </button>
      <button type="button" class="nav-card" data-action="go-history">
        <span class="nav-card__label">Past lessons</span>
        <span class="nav-card__desc">${classLessons().length} saved lesson${classLessons().length === 1 ? "" : "s"}</span>
      </button>
    </div>
  `;
}

function renderClasses() {
  const list = sortedClasses().length
    ? sortedClasses()
        .map(
          (cls) => `<div class="list-item">
            <button type="button" class="list-item__main btn--ghost" data-action="open-class" data-id="${cls.id}" style="border: 0; padding: 0; min-height: 0; background: transparent;">
              <div class="list-item__title">${escapeHtml(classLabel(cls))}</div>
              <div class="list-item__meta">Order ${cls.order ?? 99} · ${state.students.filter((student) => student.classId === cls.id).length} students · ${state.topics.filter((topic) => topic.classId === cls.id).length} topics</div>
            </button>
            <div class="list-item__actions">
              <button type="button" class="btn btn--small" data-action="edit-class" data-id="${cls.id}">Edit</button>
              <button type="button" class="btn btn--small" data-action="delete-class" data-id="${cls.id}">Delete</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="empty">Add each subject and grade level you teach, for example Year 7 Mathematics.</p>`;

  document.getElementById("classes-content").innerHTML = `
    <form class="card" data-form="add-class">
      <div class="stack">
        <div class="field">
          <label for="class-grade">Grade level</label>
          <input id="class-grade" name="grade" type="text" placeholder="e.g. Grade 6" required />
        </div>
        <div class="field">
          <label for="class-subject">Subject</label>
          <input id="class-subject" name="subject" type="text" placeholder="e.g. STEM" required />
        </div>
        <div class="field">
          <label for="class-order">Sort order</label>
          <input id="class-order" name="order" type="number" min="1" step="1" placeholder="e.g. 1" />
        </div>
        <p class="hint">Lower numbers appear first in class lists. Leave blank to add it at the end.</p>
        <button type="submit" class="btn btn--primary">Add class</button>
      </div>
    </form>
    <div class="card">
      <h2>Your classes</h2>
      <div class="list">${list}</div>
    </div>
  `;
}

function renderTimetable() {
  const periods = sortedPeriods();
  const day = timetableDay || todayWeekday() || 1;
  timetableDay = day;

  const periodList = periods.length
    ? periods
        .map(
          (period) => `<div class="list-item">
            <div class="list-item__main">
              <div class="list-item__title">${escapeHtml(period.name)}</div>
              <div class="list-item__meta">${periodTimeLabel(period) || "No times set"}</div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--small" data-action="edit-period" data-id="${period.id}">Edit</button>
              <button type="button" class="btn btn--small" data-action="delete-period" data-id="${period.id}">Delete</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="empty">Add the periods in a school day, then assign a class to each one.</p>`;

  const dayTabs = WEEKDAYS.map(
    (item) =>
      `<button type="button" class="btn day-tab ${item.id === day ? "is-selected" : ""}" data-action="select-timetable-day" data-id="${item.id}">${item.short}</button>`
  ).join("");

  const classOptions = (selectedId) =>
    `<option value="">Free</option>` +
    sortedClasses()
      .map(
        (cls) =>
          `<option value="${cls.id}" ${cls.id === selectedId ? "selected" : ""}>${escapeHtml(classLabel(cls))}</option>`
      )
      .join("");

  const dayName = WEEKDAYS.find((item) => item.id === day)?.name ?? "";
  const assignments = periods.length
    ? periods
        .map((period) => {
          const slot = slotFor(day, period.id);
          return `<div class="timetable-row">
            <div class="timetable-row__period">
              ${escapeHtml(period.name)}
              ${periodTimeLabel(period) ? `<span class="timetable-row__meta">${escapeHtml(periodTimeLabel(period))}</span>` : ""}
            </div>
            <select data-assign="slot" data-day="${day}" data-period-id="${period.id}" ${state.classes.length ? "" : "disabled"}>
              ${classOptions(slot?.classId ?? "")}
            </select>
          </div>`;
        })
        .join("")
    : `<p class="empty">Add periods first, then you can fill ${escapeHtml(dayName)}.</p>`;

  document.getElementById("timetable-content").innerHTML = `
    <form class="card" data-form="add-period">
      <div class="stack">
        <div class="field">
          <label for="period-name">Period name</label>
          <input id="period-name" name="name" type="text" placeholder="e.g. Period 1" required />
        </div>
        <div class="row">
          <div class="field">
            <label for="period-start">Start (optional)</label>
            <input id="period-start" name="start" type="time" />
          </div>
          <div class="field">
            <label for="period-end">End (optional)</label>
            <input id="period-end" name="end" type="time" />
          </div>
        </div>
        <div class="row">
          <button type="submit" class="btn btn--primary">Add period</button>
          ${periods.length ? "" : `<button type="button" class="btn" data-action="add-standard-periods">Add Periods 1–7</button>`}
        </div>
      </div>
    </form>
    <div class="card">
      <h2>Periods</h2>
      <div class="list">${periodList}</div>
    </div>
    <div class="card">
      <h2>Weekly lessons</h2>
      <p class="hint" style="margin-bottom: 0.75rem;">Choose a day, then pick the class for each period.</p>
      <div class="day-tabs">${dayTabs}</div>
      ${assignments}
    </div>
  `;
}

function topicPickButton(topic) {
  const count = activitiesForTopic(topic.id).length;
  return `<button type="button" class="nav-card topic-pick__btn ${selectedTopicId === topic.id ? "is-selected" : ""}" data-action="select-topic" data-id="${topic.id}">
    <span class="nav-card__label">${escapeHtml(topic.name)}</span>
    <span class="nav-card__desc">${escapeHtml(categoryName(topic.categoryId))} · ${count} activit${count === 1 ? "y" : "ies"}</span>
  </button>`;
}

function renderStart() {
  const last = previousLesson();
  const lastTopic = last ? topicById(last.topicId) : null;
  const grouped = topicsGroupedByCategory().filter((group) => group.topics.length);

  const topicList = grouped.length
    ? grouped
        .map(
          (group) => `<div class="category-block">
            <h2>${escapeHtml(group.category.name)}</h2>
            <div class="topic-pick">${group.topics.map(topicPickButton).join("")}</div>
          </div>`
        )
        .join("")
    : `<p class="empty">Add a topic first, then come back to start a lesson.</p>`;

  document.getElementById("start-content").innerHTML = `
    <div class="card">
      <h2>What are you teaching?</h2>
      ${topicList}
    </div>
    <div class="card">
      <h2>How should we group the class?</h2>
      <p class="hint" style="margin-bottom: 0.8rem;">Students are split into Red, Blue, Green, and Yellow groups.</p>
      <div class="grouping-choices">
        <button type="button" class="nav-card nav-card--primary" data-action="start-lesson" data-mode="random" ${selectedTopicId ? "" : "disabled"}>
          <span class="nav-card__label">Group randomly</span>
          <span class="nav-card__desc">Shuffle everyone into four new groups.</span>
        </button>
        <button type="button" class="nav-card" data-action="start-lesson" data-mode="previous" ${selectedTopicId && last ? "" : "disabled"}>
          <span class="nav-card__label">Same as last lesson</span>
          <span class="nav-card__desc">${last ? `Keep groups from ${escapeHtml(lastTopic?.name ?? "the last lesson")} (${formatShortDate(last.date)}). New students join the smallest groups.` : "You’ll be able to use this after your first lesson."}</span>
        </button>
      </div>
    </div>
  `;
}

function renderLesson() {
  const lesson = lessonById(openLessonId);
  if (!lesson) {
    showPage(currentClass() ? "class" : "home");
    return;
  }
  const topic = topicById(lesson.topicId);
  document.getElementById("lesson-title").textContent = topic?.name ?? "Lesson";
  const activities = activitiesForTopic(lesson.topicId);
  const done = lesson.completedActivityIds.length;

  const activityList = activities.length
    ? activities
        .map((activity) => {
          const isDone = lesson.completedActivityIds.includes(activity.id);
          const used = activityUsedCount(activity.id, lesson.id);
          const preview = activity.description || activity.materials;
          return `<div class="activity ${isDone ? "is-done" : ""}">
            <button type="button" class="activity__check" data-action="toggle-activity" data-id="${activity.id}" aria-label="${isDone ? "Mark as not done" : "Tick off"}">${isDone ? "✓" : ""}</button>
            <button type="button" class="activity__body" data-action="open-activity" data-id="${activity.id}">
              <span class="activity__heading">
                <span class="activity__title">${escapeHtml(activity.title)}</span>
                ${activityTagIconsHtml(activity)}
              </span>
              ${preview ? `<span class="activity__notes">${escapeHtml(preview)}</span>` : ""}
              ${used ? `<span class="activity__used">Used in ${used} earlier lesson${used === 1 ? "" : "s"}</span>` : ""}
            </button>
          </div>`;
        })
        .join("")
    : `<p class="empty">No activities on this topic yet.</p>
       <button type="button" class="btn btn--primary" data-action="open-topic" data-id="${lesson.topicId}">Add activities</button>`;

  const groups = GROUP_META.map((meta, index) => {
    const names = (lesson.groups[index] ?? [])
      .map((id) => state.students.find((student) => student.id === id))
      .filter(Boolean);
    return `<article class="group group--${meta.id}">
      <div class="group__head">${meta.label} · ${names.length}</div>
      <ul class="group__list">
        ${names.length ? names.map((student) => `<li>${escapeHtml(student.name)}</li>`).join("") : `<li class="empty">No students</li>`}
      </ul>
    </article>`;
  }).join("");

  const overview = topic?.overview
    ? `<p class="overview">${linkify(topic.overview)}</p>`
    : "";

  document.getElementById("lesson-content").innerHTML = `
    <p class="progress">${formatShortDate(lesson.date)} · ${topic ? escapeHtml(categoryName(topic.categoryId)) : ""} · ${done} of ${activities.length} activities ticked off</p>
    ${overview}
    <p class="row" style="margin-bottom: 1rem;">
      <button type="button" class="btn" data-action="open-topic" data-id="${lesson.topicId}">Topic materials</button>
      ${mcqPapersForTopic(lesson.topicId).length ? `<button type="button" class="btn btn--primary" data-action="start-practice">Practice questions</button>` : ""}
    </p>
    <div class="lesson-layout">
      <div class="card">
        <h2>Activities</h2>
        <div class="stack">${activityList}</div>
      </div>
      <div class="card">
        <div class="row" style="justify-content: space-between; margin-bottom: 0.75rem;">
          <h2 style="margin: 0;">Groups</h2>
          <div class="row">
            <button type="button" class="btn btn--small" data-action="regroup" data-mode="random">Shuffle</button>
            <button type="button" class="btn btn--small" data-action="regroup" data-mode="previous" ${previousLesson(lesson.id) ? "" : "disabled"}>Last lesson</button>
          </div>
        </div>
        <div class="groups">${groups}</div>
      </div>
    </div>
  `;
}

function unitCollapseKey(categoryId) {
  return `${currentClassId || ""}:${categoryId || "none"}`;
}

function foldIsOpen(key, defaultOpen = true) {
  return foldOpenState.has(key) ? foldOpenState.get(key) : defaultOpen;
}

function foldOpenAttr(key, defaultOpen = true) {
  return foldIsOpen(key, defaultOpen) ? "open" : "";
}

function topicSectionHtml({ key, title, countLabel = "", body }) {
  return `<div class="card">
    <details class="category-block__fold section-fold" data-fold="${escapeHtml(key)}" ${foldOpenAttr(key, false)}>
      <summary class="category-block__summary">
        <span class="category-block__chevron" aria-hidden="true"></span>
        <span class="category-block__label">
          <span class="category-block__name">${escapeHtml(title)}</span>
          ${countLabel ? `<span class="category-block__meta">${escapeHtml(countLabel)}</span>` : ""}
        </span>
      </summary>
      ${body}
    </details>
  </div>`;
}

function topicListItem(topic) {
  const count = activitiesForTopic(topic.id).length;
  const extras = [
    videosForTopic(topic.id).length ? `${videosForTopic(topic.id).length} video${videosForTopic(topic.id).length === 1 ? "" : "s"}` : null,
    pastPapersForTopic(topic.id).length ? `${pastPapersForTopic(topic.id).length} question${pastPapersForTopic(topic.id).length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  return `<div class="list-item">
    <button type="button" class="list-item__main btn--ghost" data-action="open-topic" data-id="${topic.id}" style="border: 0; padding: 0; min-height: 0; background: transparent;">
      <div class="list-item__title list-item__title--large">${escapeHtml(topic.name)}</div>
      <div class="list-item__meta">${count} activit${count === 1 ? "y" : "ies"}${extras.length ? ` · ${extras.join(" · ")}` : ""}</div>
    </button>
    ${
      isBrowse
        ? ""
        : `<div class="list-item__actions">
      <button type="button" class="btn btn--small" data-action="delete-topic" data-id="${topic.id}">Delete</button>
    </div>`
    }
  </div>`;
}

function renderTopics() {
  const grouped = topicsGroupedByCategory().filter((group) => !isBrowse || group.topics.length);
  const units = sortedCategories();
  const titleEl = document.getElementById("topics-title");
  if (titleEl) {
    titleEl.textContent = isBrowse && currentClass() ? classLabel(currentClass()) : "Units & topics";
  }
  const list = grouped.length
    ? grouped
        .map((group) => {
          const actions =
            !isBrowse && group.category.id
            ? `<button type="button" class="btn btn--small" data-action="rename-category" data-id="${group.category.id}">Rename</button>
               <button type="button" class="btn btn--small" data-action="delete-unit" data-id="${group.category.id}">Delete</button>`
            : "";
          const topics = group.topics.length
            ? `<div class="list">${group.topics.map(topicListItem).join("")}</div>`
            : `<p class="empty">${isBrowse ? "No topics in this unit yet." : "No topics in this unit yet."}</p>`;
          const unitId = group.category.id || "none";
          const open = foldOpenAttr(unitCollapseKey(unitId), true);
          const countLabel = `${group.topics.length} topic${group.topics.length === 1 ? "" : "s"}`;
          return `<div class="category-block">
            <details class="category-block__fold" data-fold="${escapeHtml(unitCollapseKey(unitId))}" ${open}>
              <summary class="category-block__summary">
                <span class="category-block__chevron" aria-hidden="true"></span>
                <span class="category-block__label">
                  <span class="category-block__name">${escapeHtml(group.category.name)}</span>
                  <span class="category-block__meta">${countLabel}</span>
                </span>
              </summary>
              ${actions ? `<div class="category-block__actions">${actions}</div>` : ""}
              ${topics}
            </details>
          </div>`;
        })
        .join("")
    : `<p class="empty">${isBrowse ? "No units or topics yet." : "Add a unit, then add topics inside it."}</p>`;

  const editor = isBrowse
    ? ""
    : `<form class="card" data-form="add-unit">
      <div class="stack">
        <div class="field">
          <label for="unit-name">New unit</label>
          <input id="unit-name" name="name" type="text" placeholder="e.g. Data (Big Idea Two)" required />
        </div>
        <button type="submit" class="btn btn--primary">Add unit</button>
      </div>
    </form>
    <form class="card" data-form="add-topic">
      <div class="stack">
        <div class="field">
          <label for="topic-unit">Unit</label>
          <select id="topic-unit" name="unitId" ${units.length ? "required" : ""}>
            ${unitSelectHtml("", { emptyLabel: units.length ? "Choose a unit" : "Add a unit first" })}
          </select>
        </div>
        <div class="field">
          <label for="topic-name">New topic</label>
          <input id="topic-name" name="name" type="text" placeholder="e.g. Binary numbers" required />
        </div>
        <div class="field">
          <label for="topic-order">Sort order</label>
          <input id="topic-order" name="order" type="number" min="1" step="1" placeholder="e.g. 1" />
        </div>
        <p class="hint">Lower numbers appear first in that unit. Leave blank to add it at the end.</p>
        <button type="submit" class="btn btn--primary" ${units.length ? "" : "disabled"}>Add topic</button>
      </div>
    </form>
    <form class="card" data-form="add-topics-bulk">
      <div class="stack">
        <div class="field">
          <label for="bulk-topic-unit">Add several topics to a unit</label>
          <select id="bulk-topic-unit" name="unitId" ${units.length ? "required" : ""}>
            ${unitSelectHtml("", { emptyLabel: units.length ? "Choose a unit" : "Add a unit first" })}
          </select>
        </div>
        <div class="field">
          <label for="bulk-topic-names">Topic names</label>
          <textarea id="bulk-topic-names" name="names" placeholder="One topic per line&#10;e.g. Binary numbers&#10;Creative computing&#10;The internet" ${units.length ? "required" : "disabled"}></textarea>
        </div>
        <p class="hint">Each line becomes a topic in the unit you choose, in this list order. Existing names in that unit are skipped.</p>
        <button type="submit" class="btn btn--primary" ${units.length ? "" : "disabled"}>Add topics</button>
      </div>
    </form>
    <form class="card" data-form="add-activities-bulk">
      <div class="stack">
        <div class="field">
          <label for="bulk-activity-topic">Add several activities to a topic</label>
          <select id="bulk-activity-topic" name="topicId" ${classTopics().length ? "" : "disabled"}>
            ${topicSelectHtml("", { emptyLabel: classTopics().length ? "Choose a topic" : "Add a topic first" })}
          </select>
        </div>
        <div class="field">
          <label for="bulk-activity-titles">Activity titles</label>
          <textarea id="bulk-activity-titles" name="titles" placeholder="One activity per line&#10;e.g. Binary card flip&#10;Trace this algorithm" ${classTopics().length ? "required" : "disabled"}></textarea>
        </div>
        <p class="hint">Each line is added to the topic you choose. To put a line on a different topic, write Topic name :: Activity title.</p>
        <button type="submit" class="btn btn--primary" ${classTopics().length ? "" : "disabled"}>Add activities</button>
      </div>
    </form>`;

  document.getElementById("topics-content").innerHTML = `
    ${journalCardHtml(currentClass())}
    ${editor}
    <div class="card">
      <h2>Units &amp; topics</h2>
      ${list}
    </div>
  `;
}

function relatedTopicChips(topic) {
  const related = (topic.relatedTopicIds ?? [])
    .map((id) => topicById(id))
    .filter(Boolean);
  if (!related.length) {
    return isBrowse ? "" : `<p class="empty">Link topics that students often need alongside this one.</p>`;
  }
  return `<div class="chip-row">${related
    .map(
      (item) => `<button type="button" class="chip" data-action="open-topic" data-id="${item.id}">
        ${escapeHtml(item.name)} <span class="chip__meta">· ${escapeHtml(categoryName(item.categoryId))}</span>
      </button>`
    )
    .join("")}</div>`;
}

function videoRow(video) {
  const yt = youtubeId(video.url);
  const thumb = yt
    ? `<img src="https://img.youtube.com/vi/${escapeHtml(yt)}/mqdefault.jpg" alt="" onerror="this.remove()" />`
    : "";
  return `<div class="list-item">
    <a class="list-item__main video-row" href="${escapeHtml(normalizeUrl(video.url))}" target="_blank" rel="noopener noreferrer">
      ${thumb}
      <span>
        <span class="list-item__title">${escapeHtml(video.title)}</span>
        <span class="list-item__meta">${escapeHtml(video.url)}</span>
      </span>
    </a>
    ${
      isBrowse
        ? ""
        : `<div class="list-item__actions">
      <button type="button" class="btn btn--small" data-action="edit-video" data-id="${video.id}">Edit</button>
      <button type="button" class="btn btn--small" data-action="delete-video" data-id="${video.id}">Delete</button>
    </div>`
    }
  </div>`;
}

function pastPaperRow(paper) {
  const stem = String(paper.stem ?? "").trim();
  const source = String(paper.title ?? "").trim();
  const main = stem || source || paper.notes || paper.fileName || "No question text yet";
  const meta = stem
    ? source
    : paper.notes && paper.notes !== main
      ? paper.notes
      : paper.fileName && paper.fileName !== main
        ? paper.fileName
        : "";
  return `<div class="list-item">
    <button type="button" class="list-item__main btn--ghost" data-action="${paperHasQuestion(paper) ? "start-practice" : "open-question"}" data-id="${paper.id}" style="border: 0; padding: 0; min-height: 0; background: transparent;">
      <div class="list-item__title sample-question__stem">${escapeHtml(main)}</div>
      ${meta ? `<div class="list-item__meta">${escapeHtml(meta)}</div>` : ""}
    </button>
    <div class="list-item__actions">
      ${paperHasQuestion(paper) ? iconButtonHtml({ action: "start-practice", icon: "practice", label: "Practice", id: paper.id }) : ""}
      ${paper.fileId ? `<button type="button" class="btn btn--small" data-action="open-pdf" data-file-id="${paper.fileId}" data-title="${escapeHtml(paperLabel(paper))}">Open PDF</button>` : ""}
      ${
        isBrowse
          ? ""
          : `${iconButtonHtml({ action: "open-question", icon: "edit", label: "Edit", id: paper.id })}
      ${iconButtonHtml({ action: "delete-past-paper", icon: "trash", label: "Delete", id: paper.id, modifier: "icon-btn--danger" })}`
      }
    </div>
  </div>`;
}

function renderTopic() {
  const topic = topicById(selectedTopicId);
  if (!topic) {
    showPage("topics");
    return;
  }
  document.getElementById("topic-title").textContent = topic.name;
  const back = document.getElementById("topic-back");
  const crumb = document.getElementById("topic-crumb");
  const sep = back?.nextElementSibling;
  if (back) back.textContent = topicReturnPage === "lesson" && !isBrowse ? "Lesson" : "Topics";
  const unit = categoryById(topic.categoryId)?.name?.trim() || "";
  if (crumb) crumb.textContent = unit;
  if (crumb) crumb.hidden = !unit;
  if (sep?.classList.contains("crumbs__sep")) sep.hidden = !unit;

  const activities = activitiesForTopic(topic.id);
  const videos = videosForTopic(topic.id);
  const papers = pastPapersForTopic(topic.id);

  const activityList = activities.length
    ? activities
        .map((activity) => {
          const used = activityUsedCount(activity.id);
          const preview = activity.description || activity.materials;
          const images = activityImages(activity);
          const thumb = images[0]?.fileId
            ? `<img class="activity-thumb" data-file-src="${images[0].fileId}" alt="" />`
            : "";
          const meta = preview
            ? `<span class="list-item__meta">${escapeHtml(preview)}</span>`
            : used && !isBrowse
              ? `<span class="list-item__meta">Used in ${used} lesson${used === 1 ? "" : "s"}</span>`
              : "";
          return `<div class="activity-card">
            <button type="button" class="activity-card__main" data-action="open-activity" data-id="${activity.id}">
              ${thumb}
              <span class="activity-card__copy">
                <span class="list-item__heading">
                  <span class="list-item__title list-item__title--large">${escapeHtml(activity.title)}</span>
                  ${activityTagIconsHtml(activity)}
                </span>
                ${meta}
              </span>
              <span class="activity-card__view">View <span class="activity-card__chevron" aria-hidden="true">›</span></span>
            </button>
            ${isBrowse ? "" : `<button type="button" class="activity-card__delete" data-action="delete-activity" data-id="${activity.id}" aria-label="Delete" title="Delete">${deleteIconHtml()}</button>`}
          </div>`;
        })
        .join("")
    : `<p class="empty">${isBrowse ? "No activities on this topic yet." : "Add the activities you might use when teaching this topic."}</p>`;

  const notes = topicNotes(topic);
  const notesList = notes.length
    ? `<div class="list">${notes
        .map(
          (note) => `<div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">${escapeHtml(note.fileName || "Student notes.pdf")}</div>
      </div>
      <div class="list-item__actions">
        ${iconButtonHtml({
          action: "open-pdf",
          icon: "pdf",
          label: "Open PDF",
          extra: `data-file-id="${note.fileId}" data-title="${escapeHtml(topic.name)} notes"`,
          modifier: "icon-btn--primary",
        })}
        ${
          isBrowse
            ? ""
            : `${iconFileLabelHtml({ upload: "notes", icon: "upload", label: "Replace PDF", extra: `data-id="${note.id}"` })}
        ${iconButtonHtml({ action: "remove-notes", icon: "trash", label: "Remove", id: note.id, modifier: "icon-btn--danger" })}`
        }
      </div>
    </div>`
        )
        .join("")}</div>`
    : `<p class="empty">${isBrowse ? "No student notes uploaded." : "Upload up to 3 PDFs of notes for students."}</p>`;
  const notesCard = `${notesList}
    ${
      isBrowse || notes.length >= MAX_TOPIC_NOTES
        ? ""
        : `<div class="section-fold__actions section-fold__actions--end">
         ${iconFileLabelHtml({ upload: "notes", icon: "upload", label: "Upload PDF", modifier: "icon-btn--primary" })}
       </div>`
    }`;

  const relatedCount = (topic.relatedTopicIds ?? []).filter((id) => topicById(id)).length;
  const relatedHtml = relatedTopicChips(topic);
  const relatedCard =
    isBrowse && !relatedHtml
      ? ""
      : topicSectionHtml({
          key: `related:${topic.id}`,
          title: "Related topics",
          countLabel: `${relatedCount} linked`,
          body: `${isBrowse ? "" : `<div class="section-fold__actions">
        <button type="button" class="btn btn--small" data-action="edit-related">Choose topics</button>
      </div>`}
      ${relatedHtml}`,
        });

  const overviewCard =
    topic.overview || !isBrowse
      ? topicSectionHtml({
          key: `overview:${topic.id}`,
          title: "Overview",
          body: `${topic.overview ? `<p class="overview" style="margin-top: 0;">${linkify(topic.overview)}</p>` : `<p class="empty">No brief overview yet.</p>`}
      ${isBrowse ? "" : `<div class="row"${topic.overview ? ` style="margin-top: 0.85rem;"` : ""}>
        <button type="button" class="btn" data-action="edit-topic-details" data-id="${topic.id}">Edit details</button>
      </div>`}`,
        })
      : "";

  document.getElementById("topic-content").innerHTML = `
    ${overviewCard}

    ${topicSectionHtml({
      key: `activities:${topic.id}`,
      title: "Activities",
      countLabel: `${activities.length} activit${activities.length === 1 ? "y" : "ies"}`,
      body: `<div class="list list--activities">${activityList}</div>
        ${isBrowse ? "" : `<div class="section-fold__actions section-fold__actions--end">
          ${iconButtonHtml({ action: "new-activity", icon: "add", label: "Add activity", modifier: "icon-btn--primary" })}
        </div>`}`,
    })}

    ${
      isBrowse && !videos.length
        ? ""
        : topicSectionHtml({
            key: `videos:${topic.id}`,
            title: "Videos",
            countLabel: `${videos.length} video${videos.length === 1 ? "" : "s"}`,
            body: `${
              isBrowse
                ? ""
                : `<form class="stack" data-form="add-video" style="margin-bottom: 1rem;">
        <div class="field">
          <label for="video-title">Title</label>
          <input id="video-title" name="title" type="text" placeholder="e.g. Introducing equivalent fractions" required />
        </div>
        <div class="field">
          <label for="video-url">Link</label>
          <input id="video-url" name="url" type="url" placeholder="YouTube or other video URL" required />
        </div>
        <button type="submit" class="btn btn--primary">Add video</button>
      </form>`
            }
      <div class="list">${videos.length ? videos.map(videoRow).join("") : `<p class="empty">Add video links to use in class or for revision.</p>`}</div>`,
          })
    }

    ${
      isBrowse && !papers.length
        ? ""
        : topicSectionHtml({
            key: `questions:${topic.id}`,
            title: "Practice questions",
            countLabel: `${papers.length} question${papers.length === 1 ? "" : "s"}`,
            body: `<div class="section-fold__actions">
          ${mcqPapersForTopic(topic.id).length ? iconButtonHtml({ action: "start-practice", icon: "practice", label: "Practice" }) : ""}
          ${isBrowse ? "" : `<button type="button" class="btn btn--primary btn--small" data-action="new-question">Add question</button>`}
        </div>
        <div class="list">${papers.length ? papers.map(pastPaperRow).join("") : `<p class="empty">${isBrowse ? "No questions yet." : "Add multiple-choice questions (A to D) to practise with the class. Tick one correct answer, or two or more for multi-select."}</p>`}</div>`,
          })
    }

    ${
      isBrowse && !topicNotes(topic).length
        ? ""
        : topicSectionHtml({
            key: `notes:${topic.id}`,
            title: "Student notes",
            countLabel: `${topicNotes(topic).length} of ${MAX_TOPIC_NOTES}`,
            body: notesCard,
          })
    }

    ${relatedCard}
  `;
}

function materialsListHtml(text) {
  const items = String(text ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) return "";
  return `<ul class="materials-list">${items.map((item) => `<li>${linkify(item)}</li>`).join("")}</ul>`;
}

function videoWatchHtml(video) {
  const yt = youtubeId(video.url);
  const openLabel = video.title || (yt ? "Open in YouTube" : "Open video");
  const openLink = video.url ? `<p class="file-name">${externalLink(video.url, openLabel)}</p>` : "";
  if (yt) {
    return `<div class="video-embed">
      <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(yt)}" title="${escapeHtml(video.title || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      ${openLink}
    </div>`;
  }
  if (!video.url) return "";
  return `<a class="nav-card" href="${escapeHtml(normalizeUrl(video.url))}" target="_blank" rel="noopener noreferrer">
    <span class="nav-card__label">${escapeHtml(openLabel)}</span>
    <span class="nav-card__desc">${escapeHtml(video.url)}</span>
  </a>`;
}

function setActivityBreadcrumb(topic) {
  const title = activityForm?.title.trim() || (isBrowse ? "Activity" : "New activity");
  document.getElementById("activity-title").textContent = title;
  const back = document.getElementById("activity-back");
  const crumb = document.getElementById("activity-crumb");
  const sep = back?.nextElementSibling;
  if (!isBrowse && activityReturnPage === "lesson") back.textContent = "Lesson";
  else back.textContent = "Topic";
  const name = topic?.name?.trim() || "";
  if (crumb) crumb.textContent = name;
  const showName = Boolean(name);
  if (crumb) crumb.hidden = !showName;
  if (sep?.classList.contains("crumbs__sep")) sep.hidden = !showName;
}

function renderActivityBrowse() {
  const topic = topicById(activityForm.topicId);
  setActivityBreadcrumb(topic);

  const images = activityImages(activityForm);
  const videos = activityVideos(activityForm);
  const resources = activityForm.resources ?? [];
  const imageHtml = images.length
    ? `<div class="image-grid image-grid--view">${images
        .map(
          (image) => `<figure>
          <img data-file-src="${image.fileId}" alt="${escapeHtml(image.fileName || "Activity image")}" />
        </figure>`
        )
        .join("")}</div>`
    : "";
  const videoHtml = videos.map(videoWatchHtml).filter(Boolean).join("");
  const resourceHtml = resources
    .map((resource) => {
      const link = resource.url
        ? `<a class="btn btn--small" href="${escapeHtml(normalizeUrl(resource.url))}" target="_blank" rel="noopener noreferrer">Open link</a>`
        : "";
      const pdf = resource.fileId
        ? `<button type="button" class="btn btn--small" data-action="open-pdf" data-file-id="${resource.fileId}" data-title="${escapeHtml(resource.title || "Resource")}">Open PDF</button>`
        : "";
      if (!resource.title && !link && !pdf) return "";
      return `<div class="list-item">
        <div class="list-item__main">
          <div class="list-item__title">${escapeHtml(resource.title || "Resource")}</div>
          ${resource.fileName ? `<div class="list-item__meta">${escapeHtml(resource.fileName)}</div>` : ""}
        </div>
        <div class="list-item__actions">${link}${pdf}</div>
      </div>`;
    })
    .filter(Boolean)
    .join("");

  document.getElementById("activity-content").innerHTML = `
    <div class="stack activity-view">
      ${activityTagsHtml(activityForm)}
      ${activityForm.description ? `<div class="card"><h2>Description</h2><p class="prose prose--justify">${linkify(activityForm.description)}</p></div>` : ""}
      ${activityForm.instructions ? `<div class="card"><h2>Instructions</h2><p class="prose">${linkify(activityForm.instructions)}</p></div>` : ""}
      ${activityForm.materials ? `<div class="card"><h2>Required Materials</h2>${materialsListHtml(activityForm.materials)}</div>` : ""}
      ${!activityForm.description && !activityForm.instructions && !activityForm.materials ? `<div class="card"><p class="empty">No extra notes for this activity yet.</p></div>` : ""}
      ${imageHtml ? `<div class="card"><h2>Images</h2>${imageHtml}</div>` : ""}
      ${videoHtml ? `<div class="card stack"><h2>Videos</h2>${videoHtml}</div>` : ""}
      ${resourceHtml ? `<div class="card stack"><h2>Resources</h2><div class="list">${resourceHtml}</div></div>` : ""}
    </div>
  `;
}

function renderActivity() {
  if (!activityForm) {
    showPage(activityReturnPage === "lesson" && !isBrowse ? "lesson" : "topic");
    return;
  }
  if (isBrowse) {
    renderActivityBrowse();
    return;
  }
  const topic = topicById(activityForm.topicId);
  setActivityBreadcrumb(topic);

  const images = activityImages(activityForm);
  const videos = activityVideos(activityForm);
  const imageHtml = `<div class="image-grid">
    ${images
      .map(
        (image) => `<figure>
          <img data-file-src="${image.fileId}" alt="${escapeHtml(image.fileName || "Activity image")}" />
          <figcaption>
            <button type="button" class="btn btn--small" data-action="remove-activity-media" data-id="${image.id}">Remove</button>
          </figcaption>
        </figure>`
      )
      .join("")}
    <label class="btn">Add images
      <input class="hidden" type="file" accept="image/*" multiple data-upload="activity-image" />
    </label>
  </div>`;

  const videoHtml = `${videos
    .map(
      (video) => `<div class="list-item">
        <div class="list-item__main stack" style="gap: 0.45rem;">
          <input name="videoTitle-${video.id}" type="text" value="${escapeHtml(video.title)}" placeholder="Video title" />
          <input name="videoUrl-${video.id}" type="url" value="${escapeHtml(video.url || "")}" placeholder="YouTube or other video URL" />
        </div>
        <div class="list-item__actions">
          <button type="button" class="btn btn--small" data-action="remove-activity-media" data-id="${video.id}">Remove</button>
        </div>
      </div>`
    )
    .join("")}
    <button type="button" class="btn" data-action="add-activity-video">Add video link</button>`;

  const resourceHtml = `${(activityForm.resources ?? [])
    .map(
      (resource) => `<div class="list-item">
        <div class="list-item__main stack" style="gap: 0.45rem;">
          <input name="resourceTitle-${resource.id}" type="text" value="${escapeHtml(resource.title)}" placeholder="Resource name" />
          <input name="resourceUrl-${resource.id}" type="url" value="${escapeHtml(resource.url || "")}" placeholder="https://…" />
          ${resource.fileId ? `<p class="file-name">${escapeHtml(resource.fileName || "PDF")}</p>
            <button type="button" class="btn btn--small" data-action="open-pdf" data-file-id="${resource.fileId}" data-title="${escapeHtml(resource.title || "Resource")}">Open PDF</button>` : `<label class="btn btn--small">Attach PDF
              <input class="hidden" type="file" accept="application/pdf,.pdf" data-upload="activity-resource" data-id="${resource.id}" />
            </label>`}
        </div>
        <div class="list-item__actions">
          <button type="button" class="btn btn--small" data-action="remove-activity-resource" data-id="${resource.id}">Remove</button>
        </div>
      </div>`
    )
    .join("")}
    <button type="button" class="btn" data-action="add-activity-resource">Add resource</button>`;

  document.getElementById("activity-content").innerHTML = `
    <form class="stack" data-form="save-activity">
      <div class="card stack">
        <div class="field">
          <label for="activity-title-field">Title</label>
          <input id="activity-title-field" name="title" type="text" value="${escapeHtml(activityForm.title)}" placeholder="e.g. Binary card flip" required />
        </div>
        ${activityTagPickerHtml(activityForm.tags)}
        <div class="field">
          <label for="activity-description">Description</label>
          <textarea id="activity-description" name="description" placeholder="What this activity is and why you use it">${escapeHtml(activityForm.description)}</textarea>
        </div>
        <div class="field">
          <label for="activity-instructions">Instructions</label>
          <textarea id="activity-instructions" name="instructions" placeholder="Step-by-step for you or the students">${escapeHtml(activityForm.instructions)}</textarea>
        </div>
        <div class="field">
          <label for="activity-materials">Required Materials</label>
          <textarea id="activity-materials" name="materials" placeholder="One item per line">${escapeHtml(activityForm.materials)}</textarea>
        </div>
      </div>
      <div class="card">
        <h2>Images</h2>
        ${imageHtml}
      </div>
      <div class="card stack">
        <h2>Videos</h2>
        ${videoHtml}
      </div>
      <div class="card stack">
        <h2>Resources</h2>
        <p class="hint">Add a webpage, a shared file link, or a PDF.</p>
        ${resourceHtml}
      </div>
      <button type="submit" class="btn btn--primary">Save activity</button>
    </form>
  `;
}

function renderQuestion() {
  if (!questionForm) {
    showPage("topic");
    return;
  }
  const topic = topicById(questionForm.topicId);
  document.getElementById("question-title").textContent = questionForm.title.trim() || questionForm.stem.trim() || "New question";
  const correct = new Set(questionForm.correct ?? []);
  const optionRows = OPTION_LETTERS.map(
    (letter) => `<div class="option-edit">
      <label class="option-edit__tick">
        <input type="checkbox" name="correct" value="${letter}" ${correct.has(letter) ? "checked" : ""} />
        <span class="hidden">Correct ${letter}</span>
      </label>
      <span class="option-letter">${letter}</span>
      <input name="option${letter}" type="text" value="${escapeHtml(questionForm.options[letter] ?? "")}" placeholder="Option ${letter}" />
    </div>`
  ).join("");
  const pdfBlock = questionForm.fileId
    ? `<p class="file-name">${escapeHtml(questionForm.fileName || "Question.pdf")}</p>
       <div class="row" style="margin-top: 0.5rem;">
         <button type="button" class="btn btn--small" data-action="open-pdf" data-file-id="${questionForm.fileId}" data-title="${escapeHtml(paperLabel(questionForm))}">Open PDF</button>
         <button type="button" class="btn btn--small" data-action="remove-question-pdf">Remove PDF</button>
       </div>`
    : `<label class="btn">Attach PDF
         <input class="hidden" type="file" accept="application/pdf,.pdf" data-upload="question-pdf" />
       </label>`;

  document.getElementById("question-content").innerHTML = `
    <form class="stack" data-form="save-question">
      <div class="card stack">
        <p class="hint">${topic ? `In ${escapeHtml(topic.name)}` : ""}</p>
        <div class="field">
          <label for="question-source">Source (optional)</label>
          <input id="question-source" name="title" type="text" value="${escapeHtml(questionForm.title)}" placeholder="e.g. 2023 Paper 2 Q4" />
        </div>
        <div class="field">
          <label for="question-stem">Question</label>
          <textarea id="question-stem" name="stem" required placeholder="Type the question students will see">${escapeHtml(questionForm.stem)}</textarea>
        </div>
        <div class="field">
          <span class="field-label">Options A to D</span>
          <p class="hint">Tick the correct answer. Tick two or more boxes for a multi-select question, such as “choose two”.</p>
          <div class="option-edit-list">${optionRows}</div>
        </div>
        <div class="field">
          <label for="question-notes">Notes (optional)</label>
          <input id="question-notes" name="notes" type="text" value="${escapeHtml(questionForm.notes)}" placeholder="Why this is a good practice question" />
        </div>
        <div class="field">
          <span class="field-label">PDF (optional)</span>
          ${pdfBlock}
        </div>
      </div>
      <button type="submit" class="btn btn--primary">Save question</button>
    </form>
  `;
}

function renderPractice() {
  const papers = mcqPapersForTopic(selectedTopicId);
  const topic = topicById(selectedTopicId);
  if (!papers.length) {
    showPage(practiceReturnPage === "lesson" && !isBrowse ? "lesson" : "topic");
    return;
  }
  if (practiceIndex >= papers.length) practiceIndex = papers.length - 1;
  if (practiceIndex < 0) practiceIndex = 0;
  const paper = papers[practiceIndex];
  const titleEl = document.getElementById("practice-title");
  if (titleEl) titleEl.textContent = topic?.name ?? "Practice";
  const picked = new Set(practicePicked);
  const correct = new Set(paper.correct ?? []);
  const options = OPTION_LETTERS.filter((letter) => String(paper.options?.[letter] ?? "").trim())
    .map((letter) => {
      const classes = ["practice-option"];
      if (picked.has(letter) && !practiceRevealed) classes.push("is-selected");
      if (practiceRevealed && correct.has(letter)) classes.push("is-correct");
      if (practiceRevealed && picked.has(letter) && !correct.has(letter)) classes.push("is-wrong");
      return `<button type="button" class="${classes.join(" ")}" data-action="practice-pick" data-letter="${letter}">
        <span class="option-letter">${letter}</span>
        <span class="practice-option__text">${escapeHtml(paper.options[letter])}</span>
      </button>`;
    })
    .join("");
  const source = paper.title.trim() ? `<p class="hint">${escapeHtml(paper.title)}</p>` : "";
  const answer = practiceRevealed
    ? `<p class="practice-answer">Answer: ${escapeHtml((paper.correct ?? []).join(" and ") || "—")}${paper.notes ? ` · ${escapeHtml(paper.notes)}` : ""}</p>`
    : "";

  document.getElementById("practice-content").innerHTML = `
    <p class="progress">Question ${practiceIndex + 1} of ${papers.length} · ${escapeHtml(paperPrompt(paper))}</p>
    <div class="card stack practice-card">
      ${source}
      <p class="practice-stem">${escapeHtml(paper.stem || paperLabel(paper))}</p>
      <div class="practice-options">${options}</div>
      ${answer}
      ${paper.fileId ? `<button type="button" class="btn" data-action="open-pdf" data-file-id="${paper.fileId}" data-title="${escapeHtml(paperLabel(paper))}">Open PDF</button>` : ""}
    </div>
    <div class="row practice-nav">
      <button type="button" class="btn" data-action="practice-prev" ${practiceIndex === 0 ? "disabled" : ""}>Previous</button>
      ${
        practiceRevealed
          ? `<button type="button" class="btn" data-action="practice-hide">Hide answer</button>`
          : `<button type="button" class="btn btn--primary" data-action="practice-reveal">Reveal answer</button>`
      }
      <button type="button" class="btn" data-action="practice-next" ${practiceIndex >= papers.length - 1 ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderStudents() {
  const students = [...classStudents()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const list = students.length
    ? students
        .map(
          (student) => `<div class="list-item">
            <div class="list-item__main">
              <div class="list-item__title">${escapeHtml(student.name)}</div>
            </div>
            <div class="list-item__actions">
              <button type="button" class="btn btn--small" data-action="edit-student" data-id="${student.id}">Rename</button>
              <button type="button" class="btn btn--small" data-action="delete-student" data-id="${student.id}">Remove</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="empty">Add your class list. Names can be added one at a time or several at once.</p>`;

  document.getElementById("students-content").innerHTML = `
    <form class="card" data-form="add-student">
      <div class="row">
        <div class="field">
          <label for="student-name">Student name</label>
          <input id="student-name" name="name" type="text" placeholder="e.g. Maya Rolle" required />
        </div>
        <button type="submit" class="btn btn--primary" style="align-self: end;">Add</button>
      </div>
    </form>
    <form class="card" data-form="add-students-bulk">
      <div class="field">
        <label for="student-bulk">Add several names</label>
        <textarea id="student-bulk" name="names" placeholder="One name per line"></textarea>
      </div>
      <div class="row" style="margin-top: 0.7rem;">
        <button type="submit" class="btn btn--primary">Add names</button>
      </div>
    </form>
    <div class="card">
      <h2>Class list (${students.length})</h2>
      <div class="list">${list}</div>
    </div>
  `;
}

function renderHistory() {
  const lessons = sortedLessons();
  const list = lessons.length
    ? lessons
        .map((lesson) => {
          const topic = topicById(lesson.topicId);
          const total = activitiesForTopic(lesson.topicId).length;
          return `<button type="button" class="nav-card history-item" data-action="open-lesson" data-id="${lesson.id}">
            <span class="nav-card__label">${escapeHtml(topic?.name ?? "Deleted topic")}</span>
            <span class="nav-card__desc">${formatShortDate(lesson.date)} · ${lesson.completedActivityIds.length} of ${total} activities · ${lesson.groupingMode === "previous" ? "kept last groups" : "random groups"}</span>
          </button>`;
        })
        .join("")
    : `<p class="empty">Finished lessons will appear here.</p>`;

  document.getElementById("history-content").innerHTML = `<div class="list">${list}</div>`;
}

function renderSettings() {
  const cloudNote = usingCloud()
    ? "Your class, topics, lessons, PDFs, and images are saved in the same cloud account as Leftovers, so they are still there when you open Windsor on another device."
    : "Your class, topics, and lessons are saved in this browser. PDFs stay on this device until you open the Netlify site, which stores everything in the cloud.";
  document.getElementById("settings-content").innerHTML = `
    <div class="card stack">
      <p>${cloudNote}</p>
      <div class="row">
        <button type="button" class="btn btn--primary" data-action="export-data">Download backup</button>
        <label class="btn" for="import-file">Restore backup</label>
        <input id="import-file" class="hidden" type="file" accept="application/json" />
      </div>
    </div>
  `;
}

function addStudent(name) {
  const trimmed = name.trim();
  if (!trimmed || !currentClassId) return false;
  const exists = classStudents().some((student) => student.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) return false;
  state.students.push({ id: uid(), classId: currentClassId, name: trimmed });
  saveState();
  return true;
}

function startLesson(mode) {
  if (!selectedTopicId || !currentClassId) return;
  const last = previousLesson();
  const groups = mode === "previous" && last ? groupsFromPrevious(last) : randomGroups();
  const lesson = {
    id: uid(),
    classId: currentClassId,
    createdAt: new Date().toISOString(),
    date: todayKey(),
    topicId: selectedTopicId,
    completedActivityIds: [],
    groups,
    groupingMode: mode === "previous" && last ? "previous" : "random",
  };
  state.lessons.push(lesson);
  saveState();
  openLessonId = lesson.id;
  showPage("lesson");
}

function regroupLesson(mode) {
  const lesson = lessonById(openLessonId);
  if (!lesson) return;
  const last = previousLesson(lesson.id);
  lesson.groups = mode === "previous" && last ? groupsFromPrevious(last) : randomGroups();
  lesson.groupingMode = mode === "previous" && last ? "previous" : "random";
  saveState();
  render();
}

function toggleActivity(activityId) {
  const lesson = lessonById(openLessonId);
  if (!lesson) return;
  const index = lesson.completedActivityIds.indexOf(activityId);
  if (index >= 0) lesson.completedActivityIds.splice(index, 1);
  else lesson.completedActivityIds.push(activityId);
  saveState();
  render();
}

function confirmDelete(message, onConfirm, okLabel = "Delete") {
  pendingConfirm = onConfirm;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-ok").textContent = okLabel;
  document.getElementById("confirm-dialog").showModal();
}

function openEdit({ title, fields, onSave }) {
  pendingEdit = onSave;
  document.getElementById("edit-title").textContent = title;
  document.getElementById("edit-fields").innerHTML = fields
    .map((field, index) => {
      const label = `<label for="edit-field-${index}">${escapeHtml(field.label)}</label>`;
      if (field.type === "textarea") {
        return `<div class="field">${label}<textarea id="edit-field-${index}" name="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder ?? "")}" ${field.required ? "required" : ""}>${escapeHtml(field.value ?? "")}</textarea></div>`;
      }
      if (field.type === "select") {
        const choices = (field.choices ?? [])
          .map(
            (choice) =>
              `<option value="${escapeHtml(choice.value)}" ${choice.value === (field.value ?? "") ? "selected" : ""}>${escapeHtml(choice.label)}</option>`
          )
          .join("");
        return `<div class="field">${label}<select id="edit-field-${index}" name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>${choices}</select></div>`;
      }
      const list = field.listId
        ? `list="${escapeHtml(field.listId)}"`
        : "";
      const datalist = field.options
        ? `<datalist id="${escapeHtml(field.listId)}">${field.options}</datalist>`
        : "";
      const inputType = field.type === "number" ? "number" : "text";
      const numberAttrs = inputType === "number" ? `min="${field.min ?? 1}" step="1"` : "";
      return `<div class="field">${label}<input id="edit-field-${index}" name="${escapeHtml(field.name)}" type="${inputType}" value="${escapeHtml(String(field.value ?? ""))}" placeholder="${escapeHtml(field.placeholder ?? "")}" ${numberAttrs} ${list} ${field.required ? "required" : ""} />${datalist}</div>`;
    })
    .join("");
  document.getElementById("edit-dialog").showModal();
  document.querySelector("#edit-fields input, #edit-fields textarea, #edit-fields select")?.focus();
}

function openRelatedDialog() {
  const topic = topicById(selectedTopicId);
  if (!topic) return;
  const selected = new Set(topic.relatedTopicIds ?? []);
  const others = sortedTopics(classTopics().filter((item) => item.id !== topic.id));
  document.getElementById("related-fields").innerHTML = others.length
    ? others
        .map(
          (item) => `<label class="check-row">
            <input type="checkbox" name="related" value="${item.id}" ${selected.has(item.id) ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(item.name)}</strong>
              <span class="list-item__meta">${escapeHtml(categoryName(item.categoryId))}</span>
            </span>
          </label>`
        )
        .join("")
    : `<p class="empty">Add another topic first, then you can link it here.</p>`;
  document.getElementById("related-dialog").showModal();
}

async function openPdf(fileId, title) {
  try {
    const record = await getFile(fileId);
    if (!record?.blob) {
      window.alert("This PDF is not stored on this device. Upload it again.");
      return;
    }
    if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
    currentPdfUrl = URL.createObjectURL(record.blob);
    pdfReturnPage = currentPage;
    document.getElementById("pdf-title").textContent = title || record.name || "PDF";
    document.getElementById("pdf-frame").src = currentPdfUrl;
    showPage("pdf");
  } catch {
    window.alert("The PDF could not be opened.");
  }
}

async function saveNotesPdf(file, noteId) {
  const topic = topicById(selectedTopicId);
  if (!topic || !file) return;
  const stored = await storePdf(file);
  if (!stored) return;
  if (!Array.isArray(topic.notesFiles)) topic.notesFiles = [];
  const existing = topic.notesFiles.find((item) => item.id === noteId);
  if (existing) {
    if (existing.fileId) await deleteFile(existing.fileId);
    existing.fileId = stored.id;
    existing.fileName = stored.name;
  } else if (topic.notesFiles.length < MAX_TOPIC_NOTES) {
    topic.notesFiles.push({ id: uid(), fileId: stored.id, fileName: stored.name });
  } else {
    await deleteFile(stored.id);
    window.alert(`You can upload up to ${MAX_TOPIC_NOTES} student notes PDFs.`);
    return;
  }
  syncTopicNotesLegacy(topic);
  saveState();
  render();
}

async function saveJournalPdf(file) {
  const cls = currentClass();
  if (!cls || !file) return;
  const stored = await storePdf(file);
  if (!stored) return;
  if (cls.journalFileId) await deleteFile(cls.journalFileId);
  cls.journalFileId = stored.id;
  cls.journalFileName = stored.name;
  saveState();
  render();
}

async function removeTopicFiles(topic) {
  await Promise.all(topicNotes(topic).map((note) => deleteFile(note.fileId)));
  const papers = pastPapersForTopic(topic.id);
  await Promise.all(papers.map((paper) => deleteFile(paper.fileId)));
}

function handleAction(action, button) {
  if (isBrowse && !BROWSE_ACTIONS.has(action)) return;
  const id = button.dataset.id;
  const mode = button.dataset.mode;

  if (action === "go-home") showPage("home");
  if (action === "go-class") {
    if (!currentClass()) showPage("home");
    else showPage("class");
  }
  if (action === "open-class") {
    currentClassId = id;
    selectedTopicId = null;
    showPage(isBrowse ? "topics" : "class");
  }
  if (action === "go-classes") showPage("classes");
  if (action === "go-timetable") {
    timetableDay = todayWeekday() || 1;
    showPage("timetable");
  }
  if (action === "select-timetable-day") {
    timetableDay = Number(id);
    render();
  }
  if (action === "go-start") {
    selectedTopicId = null;
    showPage("start");
  }
  if (action === "go-topics") {
    topicReturnPage = "topics";
    showPage("topics");
  }
  if (action === "go-topic-back") showPage(topicReturnPage === "lesson" && !isBrowse ? "lesson" : "topics");
  if (action === "go-activity-back") {
    if (!isBrowse) {
      captureActivityForm();
      if (activityForm?.title.trim()) saveActivityForm();
      else if (activityIsNew) removeActivityFiles(activityForm);
    }
    activityForm = null;
    showPage(activityReturnPage === "lesson" && !isBrowse ? "lesson" : "topic");
  }
  if (action === "new-question") openQuestionEditor();
  if (action === "open-question") openQuestionEditor(id);
  if (action === "go-question-back") {
    captureQuestionForm();
    const hasContent =
      questionForm &&
      (questionForm.stem.trim() || OPTION_LETTERS.some((letter) => questionForm.options[letter].trim()));
    if (hasContent) {
      if (!saveQuestionForm()) return;
    } else if (questionIsNew && questionForm?.fileId) {
      deleteFile(questionForm.fileId);
    }
    questionForm = null;
    showPage("topic");
  }
  if (action === "start-practice") {
    if (currentPage === "lesson") {
      const lesson = lessonById(openLessonId);
      if (lesson?.topicId) selectedTopicId = lesson.topicId;
    }
    openPractice(id || null);
  }
  if (action === "go-practice-back") {
    practiceRevealed = false;
    practicePicked = [];
    showPage(practiceReturnPage === "lesson" && !isBrowse ? "lesson" : "topic");
  }
  if (action === "practice-next") {
    practiceIndex += 1;
    practiceRevealed = false;
    practicePicked = [];
    render();
  }
  if (action === "practice-prev") {
    practiceIndex -= 1;
    practiceRevealed = false;
    practicePicked = [];
    render();
  }
  if (action === "practice-reveal") {
    practiceRevealed = true;
    render();
  }
  if (action === "practice-hide") {
    practiceRevealed = false;
    render();
  }
  if (action === "practice-pick") {
    if (practiceRevealed) return;
    const letter = button.dataset.letter;
    const papers = mcqPapersForTopic(selectedTopicId);
    const paper = papers[practiceIndex];
    const limit = paper?.selectCount || 1;
    if (limit <= 1) {
      practicePicked = practicePicked[0] === letter ? [] : [letter];
    } else if (practicePicked.includes(letter)) {
      practicePicked = practicePicked.filter((item) => item !== letter);
    } else if (practicePicked.length < limit) {
      practicePicked = [...practicePicked, letter];
    } else {
      practicePicked = [...practicePicked.slice(1), letter];
    }
    render();
  }
  if (action === "remove-question-pdf") {
    captureQuestionForm();
    if (questionForm?.fileId) deleteFile(questionForm.fileId);
    if (questionForm) {
      questionForm.fileId = null;
      questionForm.fileName = "";
    }
    render();
  }
  if (action === "new-activity") openActivityEditor();
  if (action === "open-activity") openActivityEditor(id);
  if (action === "add-activity-video") {
    if (!activityForm) return;
    captureActivityForm();
    activityForm.media.push({ id: uid(), kind: "video", title: "", url: "" });
    render();
  }
  if (action === "add-activity-resource") {
    if (!activityForm) return;
    captureActivityForm();
    activityForm.resources.push({ id: uid(), title: "", url: "", fileId: null, fileName: "" });
    render();
  }
  if (action === "remove-activity-media") {
    if (!activityForm) return;
    captureActivityForm();
    const media = activityForm.media.find((item) => item.id === id);
    if (media?.fileId) deleteFile(media.fileId);
    activityForm.media = activityForm.media.filter((item) => item.id !== id);
    render();
  }
  if (action === "remove-activity-resource") {
    if (!activityForm) return;
    captureActivityForm();
    const resource = activityForm.resources.find((item) => item.id === id);
    if (resource?.fileId) deleteFile(resource.fileId);
    activityForm.resources = activityForm.resources.filter((item) => item.id !== id);
    render();
  }
  if (action === "go-students") showPage("students");
  if (action === "go-history") showPage("history");
  if (action === "go-settings") showPage("settings");
  if (action === "close-pdf") {
    document.getElementById("pdf-frame").src = "";
    showPage(pdfReturnPage);
  }
  if (action === "select-topic") {
    selectedTopicId = id;
    render();
  }
  if (action === "start-lesson") startLesson(mode);
  if (action === "open-lesson") {
    const lesson = lessonById(id);
    if (lesson?.classId) currentClassId = lesson.classId;
    openLessonId = id;
    showPage("lesson");
  }
  if (action === "open-topic") {
    if (currentPage === "lesson") topicReturnPage = "lesson";
    else if (currentPage !== "topic") topicReturnPage = "topics";
    selectedTopicId = id;
    showPage("topic");
  }
  if (action === "toggle-activity") toggleActivity(id);
  if (action === "regroup") regroupLesson(mode);
  if (action === "open-pdf") openPdf(button.dataset.fileId, button.dataset.title);
  if (action === "remove-notes") {
    const topic = topicById(selectedTopicId);
    const note = topicNotes(topic).find((item) => item.id === id);
    confirmDelete("Remove this student notes PDF from the topic?", async () => {
      if (!topic || !note) return;
      await deleteFile(note.fileId);
      topic.notesFiles = topicNotes(topic).filter((item) => item.id !== note.id);
      syncTopicNotesLegacy(topic);
      saveState();
      render();
    }, "Remove");
  }
  if (action === "remove-journal") {
    const cls = currentClass();
    confirmDelete("Remove this subject's journal PDF?", async () => {
      if (!cls) return;
      await deleteFile(cls.journalFileId);
      cls.journalFileId = null;
      cls.journalFileName = "";
      saveState();
      render();
    }, "Remove");
  }
  if (action === "edit-topic-details") {
    const topic = topicById(id);
    openEdit({
      title: "Topic details",
      fields: [
        { name: "name", label: "Topic name", value: topic?.name ?? "", required: true },
        {
          name: "unitId",
          label: "Unit",
          type: "select",
          value: topic?.categoryId ?? "",
          required: true,
          choices: [
            { value: "", label: "Choose a unit" },
            ...sortedCategories().map((unit) => ({ value: unit.id, label: unit.name })),
          ],
        },
        {
          name: "order",
          label: "Sort order",
          type: "number",
          value: topic?.order ?? 1,
          placeholder: "e.g. 1",
          required: true,
        },
        {
          name: "overview",
          label: "Brief overview",
          value: topic?.overview ?? "",
          placeholder: "What this topic covers",
          type: "textarea",
        },
      ],
      onSave: (values) => {
        if (!topic) return;
        const name = values.name.trim();
        if (!name) return;
        topic.name = name;
        topic.overview = (values.overview ?? "").trim();
        topic.categoryId = values.unitId || null;
        topic.order = parseSortOrder(values.order, topic.order ?? 99);
        saveState();
        render();
      },
    });
  }
  if (action === "rename-category") {
    const category = categoryById(id);
    openEdit({
      title: "Rename unit",
      fields: [{ name: "name", label: "Unit name", value: category?.name ?? "", required: true }],
      onSave: (values) => {
        const name = values.name.trim();
        if (!name || !category) return;
        category.name = name;
        saveState();
        render();
      },
    });
  }
  if (action === "delete-unit") {
    confirmDelete("Delete this unit? Topics in it will be kept, but not assigned to a unit.", () => {
      state.topics.forEach((topic) => {
        if (topic.categoryId === id) topic.categoryId = null;
      });
      state.categories = state.categories.filter((unit) => unit.id !== id);
      saveState();
      render();
    });
  }
  if (action === "delete-topic") {
    confirmDelete(`Delete this topic and its activities, videos, and past papers? Past lessons will keep their history.`, async () => {
      const topic = topicById(id);
      if (topic) await removeTopicFiles(topic);
      const topicActivities = state.activities.filter((activity) => activity.topicId === id);
      await Promise.all(topicActivities.map((activity) => removeActivityFiles(activity)));
      state.activities = state.activities.filter((activity) => activity.topicId !== id);
      state.videos = state.videos.filter((video) => video.topicId !== id);
      state.pastPapers = state.pastPapers.filter((paper) => paper.topicId !== id);
      state.topics = state.topics.filter((item) => item.id !== id);
      state.topics.forEach((item) => {
        item.relatedTopicIds = (item.relatedTopicIds ?? []).filter((relatedId) => relatedId !== id);
      });
      saveState();
      if (selectedTopicId === id) showPage("topics");
      else render();
    });
  }
  if (action === "edit-related") openRelatedDialog();
  if (action === "delete-activity") {
    confirmDelete("Delete this activity?", async () => {
      const activity = state.activities.find((item) => item.id === id);
      if (activity) await removeActivityFiles(activity);
      state.activities = state.activities.filter((item) => item.id !== id);
      state.lessons.forEach((lesson) => {
        lesson.completedActivityIds = lesson.completedActivityIds.filter((item) => item !== id);
      });
      saveState();
      render();
    });
  }
  if (action === "edit-video") {
    const video = state.videos.find((item) => item.id === id);
    openEdit({
      title: "Edit video",
      fields: [
        { name: "title", label: "Title", value: video?.title ?? "", required: true },
        { name: "url", label: "Link", value: video?.url ?? "", required: true },
      ],
      onSave: (values) => {
        const title = values.title.trim();
        const url = normalizeUrl(values.url);
        if (!title || !url || !video) return;
        video.title = title;
        video.url = url;
        saveState();
        render();
      },
    });
  }
  if (action === "delete-video") {
    confirmDelete("Delete this video?", () => {
      state.videos = state.videos.filter((video) => video.id !== id);
      saveState();
      render();
    });
  }
  if (action === "delete-past-paper") {
    confirmDelete("Delete this past paper question?", async () => {
      const paper = state.pastPapers.find((item) => item.id === id);
      if (paper?.fileId) await deleteFile(paper.fileId);
      state.pastPapers = state.pastPapers.filter((item) => item.id !== id);
      saveState();
      render();
    });
  }
  if (action === "edit-student") {
    const student = state.students.find((item) => item.id === id);
    openEdit({
      title: "Rename student",
      fields: [{ name: "name", label: "Student name", value: student?.name ?? "", required: true }],
      onSave: (values) => {
        const name = values.name.trim();
        if (!name || !student) return;
        student.name = name;
        saveState();
        render();
      },
    });
  }
  if (action === "delete-student") {
    confirmDelete("Remove this student from the class list?", () => {
      state.students = state.students.filter((student) => student.id !== id);
      state.lessons.forEach((lesson) => {
        lesson.groups = lesson.groups.map((group) => group.filter((studentId) => studentId !== id));
      });
      saveState();
      render();
    }, "Remove");
  }
  if (action === "export-data") {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `windsor-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  if (action === "edit-class") {
    const cls = classById(id);
    openEdit({
      title: "Edit class",
      fields: [
        { name: "grade", label: "Grade level", value: cls?.grade ?? "", required: true, placeholder: "e.g. Grade 6" },
        { name: "subject", label: "Subject", value: cls?.subject ?? "", required: true, placeholder: "e.g. STEM" },
        {
          name: "order",
          label: "Sort order",
          type: "number",
          value: cls?.order ?? 1,
          placeholder: "e.g. 1",
          required: true,
        },
      ],
      onSave: (values) => {
        if (!cls) return;
        const grade = values.grade.trim();
        const subject = values.subject.trim();
        if (!grade || !subject) return;
        cls.grade = grade;
        cls.subject = subject;
        cls.order = parseSortOrder(values.order, cls.order ?? 99);
        saveState();
        render();
      },
    });
  }
  if (action === "delete-class") {
    confirmDelete("Delete this class, its students, topics, and lessons?", async () => {
      const cls = classById(id);
      if (cls?.journalFileId) await deleteFile(cls.journalFileId);
      const topics = state.topics.filter((topic) => topic.classId === id);
      await Promise.all(topics.map((topic) => removeTopicFiles(topic)));
      const topicIds = new Set(topics.map((topic) => topic.id));
      const topicActivities = state.activities.filter((activity) => topicIds.has(activity.topicId));
      await Promise.all(topicActivities.map((activity) => removeActivityFiles(activity)));
      state.activities = state.activities.filter((activity) => !topicIds.has(activity.topicId));
      state.videos = state.videos.filter((video) => !topicIds.has(video.topicId));
      state.pastPapers = state.pastPapers.filter((paper) => !topicIds.has(paper.topicId));
      state.topics = state.topics.filter((topic) => topic.classId !== id);
      state.categories = state.categories.filter((category) => category.classId !== id);
      state.students = state.students.filter((student) => student.classId !== id);
      state.lessons = state.lessons.filter((lesson) => lesson.classId !== id);
      state.slots = state.slots.filter((slot) => slot.classId !== id);
      state.classes = state.classes.filter((item) => item.id !== id);
      if (currentClassId === id) currentClassId = null;
      saveState();
      render();
    });
  }
  if (action === "add-standard-periods") {
    if (state.periods.length) return;
    for (let index = 1; index <= 7; index += 1) {
      state.periods.push({ id: uid(), name: `Period ${index}`, start: "", end: "", order: index });
    }
    saveState();
    render();
  }
  if (action === "edit-period") {
    const period = state.periods.find((item) => item.id === id);
    openEdit({
      title: "Edit period",
      fields: [
        { name: "name", label: "Period name", value: period?.name ?? "", required: true },
        { name: "start", label: "Start time", value: period?.start ?? "", placeholder: "08:30" },
        { name: "end", label: "End time", value: period?.end ?? "", placeholder: "09:15" },
      ],
      onSave: (values) => {
        if (!period) return;
        const name = values.name.trim();
        if (!name) return;
        period.name = name;
        period.start = values.start.trim();
        period.end = values.end.trim();
        saveState();
        render();
      },
    });
  }
  if (action === "delete-period") {
    confirmDelete("Delete this period from the timetable?", () => {
      state.slots = state.slots.filter((slot) => slot.periodId !== id);
      state.periods = state.periods.filter((period) => period.id !== id);
      saveState();
      render();
    });
  }
}

async function handleForm(form) {
  if (isBrowse) return;
  const formName = form.dataset.form;
  const data = new FormData(form);

  if (formName === "add-class") {
    const grade = String(data.get("grade") ?? "").trim();
    const subject = String(data.get("subject") ?? "").trim();
    if (!grade || !subject) return;
    const order = parseSortOrder(data.get("order"), nextClassOrder());
    state.classes.push(normalizeClass({ id: uid(), grade, subject, order }));
    saveState();
    render();
    return;
  }

  if (formName === "add-period") {
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const order = sortedPeriods().reduce((max, period) => Math.max(max, period.order ?? 0), 0) + 1;
    state.periods.push({
      id: uid(),
      name,
      start: String(data.get("start") ?? "").trim(),
      end: String(data.get("end") ?? "").trim(),
      order,
    });
    saveState();
    render();
    return;
  }

  if (formName === "add-unit") {
    const name = String(data.get("name") ?? "").trim();
    if (!name || !currentClassId) return;
    findOrCreateCategory(name);
    saveState();
    render();
    return;
  }

  if (formName === "add-topic") {
    const name = String(data.get("name") ?? "").trim();
    const unitId = String(data.get("unitId") ?? "").trim();
    const topic = createTopic(name, unitId, data.get("order"));
    if (!topic) return;
    saveState();
    selectedTopicId = topic.id;
    topicReturnPage = "topics";
    showPage("topic");
    return;
  }

  if (formName === "add-topics-bulk") {
    const unitId = String(data.get("unitId") ?? "").trim();
    const names = parseNameLines(data.get("names"));
    if (!unitId || !names.length || !currentClassId) return;
    let order = nextTopicOrder(unitId);
    names.forEach((name) => {
      const topic = createTopic(name, unitId, order);
      if (topic) order += 1;
    });
    saveState();
    render();
    return;
  }

  if (formName === "add-activities-bulk") {
    const topicId = String(data.get("topicId") ?? selectedTopicId ?? "").trim();
    const items = parseActivityBulkLines(data.get("titles"), topicId);
    if (!items.length) return;
    items.forEach((item) => createNamedActivity(item.title, item.topicId));
    saveState();
    render();
    return;
  }

  if (formName === "save-activity") {
    if (saveActivityForm()) {
      activityForm = null;
      showPage(activityReturnPage === "lesson" ? "lesson" : "topic");
    }
    return;
  }

  if (formName === "add-video") {
    const title = String(data.get("title") ?? "").trim();
    const url = normalizeUrl(data.get("url"));
    if (!title || !url || !selectedTopicId) return;
    state.videos.push({ id: uid(), topicId: selectedTopicId, title, url });
    saveState();
    render();
    return;
  }

  if (formName === "save-question") {
    if (saveQuestionForm()) {
      questionForm = null;
      showPage("topic");
    }
    return;
  }

  if (formName === "add-student") {
    addStudent(String(data.get("name") ?? ""));
    render();
    return;
  }

  if (formName === "add-students-bulk") {
    String(data.get("names") ?? "")
      .split("\n")
      .forEach((name) => addStudent(name));
    render();
  }
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(String(reader.result)));
      saveState();
      showPage("home");
    } catch {
      window.alert("That file could not be read as a Windsor backup.");
    }
  };
  reader.readAsText(file);
}

document.getElementById("app").addEventListener(
  "toggle",
  (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.dataset.fold) return;
    const key = details.dataset.fold;
    if (details.open) foldOpenState.set(key, true);
    else foldOpenState.set(key, false);
  },
  true
);

document.getElementById("app").addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (link && !link.closest("[data-action]")) {
    const href = link.getAttribute("href") || "";
    if (/^(https?:|mailto:)/i.test(href) || href.startsWith("//")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  handleAction(button.dataset.action, button);
});

document.getElementById("app").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  handleForm(form);
});

document.getElementById("app").addEventListener("change", (event) => {
  if (isBrowse) return;
  if (event.target.dataset.assign === "slot") {
    const day = Number(event.target.dataset.day);
    const periodId = event.target.dataset.periodId;
    const classId = event.target.value || null;
    const existing = state.slots.find((slot) => slot.day === day && slot.periodId === periodId);
    if (!classId) {
      state.slots = state.slots.filter((slot) => !(slot.day === day && slot.periodId === periodId));
    } else if (existing) {
      existing.classId = classId;
    } else {
      state.slots.push({ id: uid(), day, periodId, classId });
    }
    saveState();
    render();
  }
  if (event.target.id === "import-file" && event.target.files?.[0]) {
    importBackup(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.dataset.upload === "notes" && event.target.files?.[0]) {
    saveNotesPdf(event.target.files[0], event.target.dataset.id);
    event.target.value = "";
  }
  if (event.target.dataset.upload === "journal" && event.target.files?.[0]) {
    saveJournalPdf(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.dataset.upload === "activity-image" && event.target.files?.length) {
    captureActivityForm();
    Promise.all([...event.target.files].map((file) => storeImage(file))).then((stored) => {
      stored.filter(Boolean).forEach((file) => {
        activityForm.media.push({
          id: uid(),
          kind: "image",
          fileId: file.id,
          fileName: file.name,
        });
      });
      event.target.value = "";
      render();
    });
  }
  if (event.target.dataset.upload === "question-pdf" && event.target.files?.[0]) {
    captureQuestionForm();
    storePdf(event.target.files[0]).then((stored) => {
      if (stored && questionForm) {
        if (questionForm.fileId) deleteFile(questionForm.fileId);
        questionForm.fileId = stored.id;
        questionForm.fileName = stored.name;
      }
      event.target.value = "";
      render();
    });
  }
  if (event.target.dataset.upload === "activity-resource" && event.target.files?.[0]) {
    captureActivityForm();
    const resource = activityForm.resources.find((item) => item.id === event.target.dataset.id);
    storePdf(event.target.files[0]).then((stored) => {
      if (stored && resource) {
        if (resource.fileId) deleteFile(resource.fileId);
        resource.fileId = stored.id;
        resource.fileName = stored.name;
        if (!resource.title) resource.title = stored.name;
      }
      event.target.value = "";
      render();
    });
  }
});

document.getElementById("confirm-dialog")?.addEventListener("close", () => {
  const dialog = document.getElementById("confirm-dialog");
  if (dialog.returnValue === "ok" && pendingConfirm) pendingConfirm();
  pendingConfirm = null;
});

document.getElementById("edit-cancel")?.addEventListener("click", () => {
  pendingEdit = null;
  document.getElementById("edit-dialog").close();
});

document.getElementById("edit-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  const onSave = pendingEdit;
  pendingEdit = null;
  document.getElementById("edit-dialog").close();
  if (onSave) onSave(values);
});

document.getElementById("related-cancel")?.addEventListener("click", () => {
  document.getElementById("related-dialog").close();
});

document.getElementById("related-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const topic = topicById(selectedTopicId);
  if (topic) {
    topic.relatedTopicIds = [...event.currentTarget.querySelectorAll('input[name="related"]:checked')].map(
      (input) => input.value
    );
    saveState();
  }
  document.getElementById("related-dialog").close();
  render();
});

async function boot() {
  useCloud = await pingCloud();
  if (!useCloud) useApi = await pingApi();
  state = await loadState();
  if (!isBrowse) {
    saveState();
    await migrateLocalFilesToApi();
  }
  showPage("home");
}

window.addEventListener("pagehide", flushSave);
window.addEventListener("beforeunload", flushSave);
boot();
