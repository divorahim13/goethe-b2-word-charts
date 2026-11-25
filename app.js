(() => {
  "use strict";

  const STORAGE_KEY = "goethe_b2_wordcharts_v2";
  const LEGACY_STORAGE_KEY = "goethe_b2_wordcharts_v1";
  const GIST_FILENAME = "goethe-b2-wordcharts-progress.json";
  const GIST_DESCRIPTION = "Goethe B2 Word Charts Progress";
  const SYNC_DEBOUNCE_MS = 3500;
  const MIN_PUSH_INTERVAL_MS = 4000;
  const allWords = Array.isArray(window.GOETHE_B2_WORDS) ? window.GOETHE_B2_WORDS : [];

  const state = {
    view: "cards", // "cards" | "list"
    direction: "DE_ID", // "DE_ID" | "ID_DE"
    autoReveal: false,
    isFlipped: false,
    shuffledOrder: null, // array of indices or null
    currentIndex: 0,
    search: "",
    topic: "all",
    pos: "all",
    status: "all",
    learned: new Set(),
    starred: new Set(),
    updatedAt: 0,
    dirty: false,
    syncKey: "",
    gistId: "",
    syncStatus: "local", // "local" | "synced" | "pending" | "error"
    theme: "light"
  };

  let syncTimer = null;
  let isSyncInFlight = false;
  let lastPushAt = 0;
  let consecutiveFailures = 0;
  let syncHalted = false;
  let toastTimer = null;
  let lastUndoAction = null;

  // DOM Elements
  const el = {
    btnViewCards: document.getElementById("btnViewCards"),
    btnViewList: document.getElementById("btnViewList"),
    btnTheme: document.getElementById("btnTheme"),
    cardsView: document.getElementById("cardsView"),
    listView: document.getElementById("listView"),
    statScope: document.getElementById("statScope"),
    statTotal: document.getElementById("statTotal"),
    statLearned: document.getElementById("statLearned"),
    statStarred: document.getElementById("statStarred"),
    progressFill: document.getElementById("progressFill"),
    progressPct: document.getElementById("progressPct"),
    topicPills: document.getElementById("topicPills"),
    searchInput: document.getElementById("searchInput"),
    btnClearSearch: document.getElementById("btnClearSearch"),
    btnToggleFilters: document.getElementById("btnToggleFilters"),
    filtersRow: document.getElementById("filtersRow"),
    filterTopic: document.getElementById("filterTopic"),
    filterPos: document.getElementById("filterPos"),
    filterStatus: document.getElementById("filterStatus"),
    btnDirection: document.getElementById("btnDirection"),
    directionLabel: document.getElementById("directionLabel"),
    btnShuffle: document.getElementById("btnShuffle"),
    btnResetFiltersTop: document.getElementById("btnResetFiltersTop"),
    completionBanner: document.getElementById("completionBanner"),
    completionTitle: document.getElementById("completionTitle"),
    completionDesc: document.getElementById("completionDesc"),
    btnCompletionShuffle: document.getElementById("btnCompletionShuffle"),
    btnCompletionAll: document.getElementById("btnCompletionAll"),
    cardCounter: document.getElementById("cardCounter"),
    deckProgressFill: document.getElementById("deckProgressFill"),
    toggleAutoReveal: document.getElementById("toggleAutoReveal"),
    btnPrev: document.getElementById("btnPrev"),
    btnNext: document.getElementById("btnNext"),
    btnPrevMobile: document.getElementById("btnPrevMobile"),
    btnNextMobile: document.getElementById("btnNextMobile"),
    btnFlipMobile: document.getElementById("btnFlipMobile"),
    cardViewport: document.getElementById("cardViewport"),
    deckStack1: document.getElementById("deckStack1"),
    flashcard: document.getElementById("flashcard"),
    swipeCueLeft: document.getElementById("swipeCueLeft"),
    swipeCueRight: document.getElementById("swipeCueRight"),
    frontPipNum: document.getElementById("frontPipNum"),
    frontPipSuit: document.getElementById("frontPipSuit"),
    frontPipNumBot: document.getElementById("frontPipNumBot"),
    frontPipSuitBot: document.getElementById("frontPipSuitBot"),
    backPipNum: document.getElementById("backPipNum"),
    backPipSuit: document.getElementById("backPipSuit"),
    backPipNumBot: document.getElementById("backPipNumBot"),
    backPipSuitBot: document.getElementById("backPipSuitBot"),
    frontBadges: document.getElementById("frontBadges"),
    backBadges: document.getElementById("backBadges"),
    frontContent: document.getElementById("frontContent"),
    backContent: document.getElementById("backContent"),
    btnSpeakFront: document.getElementById("btnSpeakFront"),
    btnSpeakBack: document.getElementById("btnSpeakBack"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyDesc: document.getElementById("emptyDesc"),
    btnResetFilters: document.getElementById("btnResetFilters"),
    masteryActions: document.getElementById("masteryActions"),
    btnStar: document.getElementById("btnStar"),
    starText: document.getElementById("starText"),
    btnLearned: document.getElementById("btnLearned"),
    learnedText: document.getElementById("learnedText"),
    listCount: document.getElementById("listCount"),
    wordListContainer: document.getElementById("wordListContainer"),
    btnResetProgress: document.getElementById("btnResetProgress"),
    toastBar: document.getElementById("toastBar"),
    toastMsg: document.getElementById("toastMsg"),
    btnToastUndo: document.getElementById("btnToastUndo"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmDialogDesc: document.getElementById("confirmDialogDesc"),
    btnCloseConfirm: document.getElementById("btnCloseConfirm"),
    btnCancelReset: document.getElementById("btnCancelReset"),
    btnConfirmReset: document.getElementById("btnConfirmReset"),
    btnSyncModal: document.getElementById("btnSyncModal"),
    syncStatusText: document.getElementById("syncStatusText"),
    syncDialog: document.getElementById("syncDialog"),
    syncForm: document.getElementById("syncForm"),
    btnCloseSync: document.getElementById("btnCloseSync"),
    syncKeyInput: document.getElementById("syncKeyInput"),
    syncDialogMsg: document.getElementById("syncDialogMsg"),
    btnConnectSync: document.getElementById("btnConnectSync"),
    btnSyncNow: document.getElementById("btnSyncNow"),
    btnDisconnectSync: document.getElementById("btnDisconnectSync")
  };

  function showToast(message, undoFn = null, durationMs = 4500) {
    if (!el.toastBar || !el.toastMsg) return;
    clearTimeout(toastTimer);
    lastUndoAction = typeof undoFn === "function" ? undoFn : null;
    el.toastMsg.textContent = message;
    if (el.btnToastUndo) {
      el.btnToastUndo.classList.toggle("hidden", !lastUndoAction);
    }
    el.toastBar.classList.remove("hidden");
    toastTimer = setTimeout(() => {
      el.toastBar.classList.add("hidden");
      lastUndoAction = null;
    }, durationMs);
  }

  function runUndo() {
    if (!lastUndoAction) return;
    const fn = lastUndoAction;
    lastUndoAction = null;
    clearTimeout(toastTimer);
    if (el.toastBar) el.toastBar.classList.add("hidden");
    fn();
  }

  function setSyncStatus(status, label) {
    state.syncStatus = status;
    el.btnSyncModal.setAttribute("data-sync", status);
    el.syncStatusText.textContent = label;
  }

  function showDialogMsg(text, kind = "") {
    if (!text) {
      el.syncDialogMsg.className = "sync-msg hidden";
      el.syncDialogMsg.textContent = "";
      return;
    }
    el.syncDialogMsg.textContent = text;
    el.syncDialogMsg.className = `sync-msg ${kind}`.trim();
  }

  function updateSyncDialogUI() {
    const connected = Boolean(state.syncKey);
    el.btnSyncNow.classList.toggle("hidden", !connected);
    el.btnDisconnectSync.classList.toggle("hidden", !connected);
    if (connected && !el.syncKeyInput.value) {
      el.syncKeyInput.value = state.syncKey;
    }
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.learned)) state.learned = new Set(parsed.learned);
        if (Array.isArray(parsed.starred)) state.starred = new Set(parsed.starred);
        if (typeof parsed.updatedAt === "number") state.updatedAt = parsed.updatedAt;
        if (typeof parsed.dirty === "boolean") state.dirty = parsed.dirty;
        if (typeof parsed.syncKey === "string") state.syncKey = parsed.syncKey;
        if (typeof parsed.gistId === "string") state.gistId = parsed.gistId;
        if (parsed.theme === "dark" || parsed.theme === "light") state.theme = parsed.theme;
        if (typeof parsed.topic === "string") state.topic = parsed.topic;
        if (parsed.direction === "DE_ID" || parsed.direction === "ID_DE") state.direction = parsed.direction;
        if (typeof parsed.autoReveal === "boolean") state.autoReveal = parsed.autoReveal;
      } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        state.theme = "dark";
      }
    } catch {
      // Ignore storage errors
    }
    applyTheme();
    el.directionLabel.textContent = state.direction === "DE_ID" ? "DE → ID" : "ID → DE";
    el.toggleAutoReveal.checked = state.autoReveal;
    if (state.syncKey) {
      setSyncStatus(state.dirty ? "pending" : "synced", state.dirty ? "Menyimpan..." : "Tersinkron");
    } else {
      setSyncStatus("local", "Lokal");
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          learned: Array.from(state.learned),
          starred: Array.from(state.starred),
          updatedAt: state.updatedAt,
          dirty: state.dirty,
          syncKey: state.syncKey,
          gistId: state.gistId,
          theme: state.theme,
          topic: state.topic,
          direction: state.direction,
          autoReveal: state.autoReveal
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  function canUseCloudSync() {
    return Boolean(state.syncKey);
  }

  function githubHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  function parseGistProgress(gist) {
    const file = gist && gist.files && gist.files[GIST_FILENAME];
    if (!file || !file.content) {
      return { learned: [], starred: [], updatedAt: 0 };
    }
    try {
      const parsed = JSON.parse(file.content);
      return {
        learned: Array.isArray(parsed.learned) ? parsed.learned : [],
        starred: Array.isArray(parsed.starred) ? parsed.starred : [],
        updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0
      };
    } catch {
      return { learned: [], starred: [], updatedAt: 0 };
    }
  }

  async function resolveGist(token, knownGistId = "") {
    if (knownGistId) {
      const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(knownGistId)}`, {
        method: "GET",
        headers: githubHeaders(token),
        cache: "no-store"
      });
      if (res.status === 401 || res.status === 403) throw new Error("UNAUTHORIZED");
      if (res.ok) return res.json();
    }

    // Search existing private gist with our filename
    const listRes = await fetch("https://api.github.com/gists?per_page=100", {
      method: "GET",
      headers: githubHeaders(token),
      cache: "no-store"
    });
    if (listRes.status === 401 || listRes.status === 403) throw new Error("UNAUTHORIZED");
    if (!listRes.ok) throw new Error("SERVER_ERROR");

    const gists = await listRes.json();
    const existing = Array.isArray(gists)
      ? gists.find((g) => g && g.files && Object.prototype.hasOwnProperty.call(g.files, GIST_FILENAME))
      : null;

    if (existing) {
      const detailRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(existing.id)}`, {
        method: "GET",
        headers: githubHeaders(token),
        cache: "no-store"
      });
      if (detailRes.status === 401 || detailRes.status === 403) throw new Error("UNAUTHORIZED");
      if (!detailRes.ok) throw new Error("SERVER_ERROR");
      return detailRes.json();
    }

    // Create a brand-new private gist
    const initialContent = JSON.stringify({
      learned: Array.from(state.learned),
      starred: Array.from(state.starred),
      updatedAt: state.updatedAt || 0
    });
    const createRes = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          [GIST_FILENAME]: { content: initialContent }
        }
      })
    });
    if (createRes.status === 401 || createRes.status === 403) throw new Error("UNAUTHORIZED");
    if (!createRes.ok) throw new Error("SERVER_ERROR");
    return createRes.json();
  }

  async function pushSync({ keepalive = false, manual = false } = {}) {
    if (!canUseCloudSync() || (isSyncInFlight && !keepalive)) return false;
    if (syncHalted && !manual) return false;

    const now = Date.now();
    if (!manual && !keepalive && now - lastPushAt < MIN_PUSH_INTERVAL_MS) {
      schedulePushSync();
      return false;
    }

    clearTimeout(syncTimer);
    syncTimer = null;
    isSyncInFlight = true;
    lastPushAt = now;
    setSyncStatus("pending", "Menyimpan...");

    const payload = {
      learned: Array.from(state.learned),
      starred: Array.from(state.starred),
      updatedAt: state.updatedAt || Date.now()
    };

    try {
      if (!state.gistId) {
        const gist = await resolveGist(state.syncKey);
        state.gistId = gist.id;
      }

      const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(state.gistId)}`, {
        method: "PATCH",
        headers: githubHeaders(state.syncKey),
        body: JSON.stringify({
          files: {
            [GIST_FILENAME]: { content: JSON.stringify(payload) }
          }
        }),
        keepalive
      });

      if (res.status === 401 || res.status === 403) {
        consecutiveFailures++;
        syncHalted = true;
        setSyncStatus("error", "Token Salah");
        return false;
      }
      if (!res.ok) throw new Error("SERVER_ERROR");

      consecutiveFailures = 0;
      syncHalted = false;
      state.dirty = false;
      state.updatedAt = payload.updatedAt;
      saveStorage();
      setSyncStatus("synced", "Tersinkron");
      return true;
    } catch {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) {
        syncHalted = true;
      }
      setSyncStatus("error", "Gagal Sync");
      return false;
    } finally {
      isSyncInFlight = false;
    }
  }

  function schedulePushSync() {
    if (!canUseCloudSync() || syncHalted) return;
    setSyncStatus("pending", "Menyimpan...");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushSync();
    }, SYNC_DEBOUNCE_MS);
  }

  async function syncOnStartupOrManual({ mergeIfBoth = false, manual = false } = {}) {
    if (!canUseCloudSync()) return { ok: false, reason: "NO_KEY" };
    if (syncHalted && !manual) return { ok: false, reason: "HALTED" };

    setSyncStatus("pending", "Sinkronisasi...");
    try {
      const gist = await resolveGist(state.syncKey, state.gistId);
      state.gistId = gist.id;
      const remote = parseGistProgress(gist);
      const remoteUpdated = remote.updatedAt;
      const remoteLearned = remote.learned;
      const remoteStarred = remote.starred;

      consecutiveFailures = 0;
      syncHalted = false;

      if (mergeIfBoth && (state.learned.size > 0 || state.starred.size > 0) && remoteUpdated > 0) {
        state.learned = new Set([...remoteLearned, ...state.learned]);
        state.starred = new Set([...remoteStarred, ...state.starred]);
        state.updatedAt = Math.max(Date.now(), remoteUpdated);
        state.dirty = true;
        saveStorage();
        render();
        await pushSync({ manual: true });
      } else if (state.dirty && state.updatedAt >= remoteUpdated) {
        await pushSync({ manual: true });
      } else if (remoteUpdated > state.updatedAt || (!state.dirty && remoteUpdated > 0)) {
        state.learned = new Set(remoteLearned);
        state.starred = new Set(remoteStarred);
        state.updatedAt = remoteUpdated;
        state.dirty = false;
        saveStorage();
        render();
        setSyncStatus("synced", "Tersinkron");
      } else if ((state.learned.size > 0 || state.starred.size > 0) && remoteUpdated === 0) {
        state.updatedAt = state.updatedAt || Date.now();
        state.dirty = true;
        saveStorage();
        await pushSync({ manual: true });
      } else {
        saveStorage();
        setSyncStatus("synced", "Tersinkron");
      }
      return { ok: true };
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= 2) syncHalted = true;
      if (err && err.message === "UNAUTHORIZED") {
        syncHalted = true;
        setSyncStatus("error", "Token Salah");
        return { ok: false, reason: "UNAUTHORIZED" };
      }
      setSyncStatus("error", "Offline");
      return { ok: false, reason: "NETWORK" };
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
  }

  function populateFilters() {
    const topicCounts = new Map();
    const poses = new Set();

    allWords.forEach((item) => {
      if (item.topic) {
        topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
      }
      if (item.pos) poses.add(item.pos);
    });

    const sortedTopics = Array.from(topicCounts.keys()).sort((a, b) => a.localeCompare(b));

    // Validate restored topic preference against current dataset
    if (state.topic !== "all" && !topicCounts.has(state.topic)) {
      state.topic = "all";
    }

    sortedTopics.forEach((topic) => {
      const opt = document.createElement("option");
      opt.value = topic;
      opt.textContent = `${topic} (${topicCounts.get(topic)})`;
      el.filterTopic.appendChild(opt);
    });
    el.filterTopic.value = state.topic;

    // Build 1-tap quick topic pills (Rule 2 & Rule 7)
    if (el.topicPills) {
      el.topicPills.replaceChildren();
      const pillDefs = [
        { value: "all", label: "Semua", count: allWords.length },
        ...sortedTopics.map((t) => ({ value: t, label: t, count: topicCounts.get(t) }))
      ];
      pillDefs.forEach(({ value, label, count }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "topic-pill";
        btn.dataset.topic = value;
        btn.appendChild(document.createTextNode(label));
        const badge = document.createElement("span");
        badge.className = "topic-pill-count";
        badge.textContent = String(count);
        btn.appendChild(badge);
        btn.addEventListener("click", () => selectTopic(value));
        el.topicPills.appendChild(btn);
      });
    }

    Array.from(poses)
      .sort((a, b) => a.localeCompare(b))
      .forEach((pos) => {
        const opt = document.createElement("option");
        opt.value = pos;
        opt.textContent = pos;
        el.filterPos.appendChild(opt);
      });
  }

  function selectTopic(topicValue) {
    state.topic = topicValue;
    el.filterTopic.value = topicValue;
    state.shuffledOrder = null;
    state.currentIndex = 0;
    state.isFlipped = false;
    resetCardScroll();
    saveStorage();
    render();
  }

  function updateTopicPillsUI() {
    if (!el.topicPills) return;
    el.topicPills.querySelectorAll(".topic-pill").forEach((btn) => {
      const active = btn.dataset.topic === state.topic;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function getWordId(item, fallbackIdx) {
    return item.id || `${item.word || "item"}-${fallbackIdx}`;
  }

  function getFilteredWords() {
    const q = state.search.trim().toLowerCase();
    const list = allWords.filter((item, idx) => {
      const id = getWordId(item, idx);
      if (state.topic !== "all" && item.topic !== state.topic) return false;
      if (state.pos !== "all" && item.pos !== state.pos) return false;
      if (state.status === "learned" && !state.learned.has(id)) return false;
      if (state.status === "unlearned" && state.learned.has(id)) return false;
      if (state.status === "starred" && !state.starred.has(id)) return false;
      if (q) {
        const haystack = [
          item.word,
          item.meaning,
          item.plural,
          item.example,
          item.note,
          item.topic
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (state.shuffledOrder && state.shuffledOrder.length === list.length) {
      return state.shuffledOrder.map((i) => list[i]);
    }
    return list;
  }

  function detectArticle(item) {
    if (item.article) return item.article.toLowerCase();
    const w = (item.word || "").trim().toLowerCase();
    if (w.startsWith("der ")) return "der";
    if (w.startsWith("die ")) return "die";
    if (w.startsWith("das ")) return "das";
    return "";
  }

  function createBadge(text, className = "") {
    const span = document.createElement("span");
    span.className = `badge ${className}`.trim();
    span.textContent = text;
    return span;
  }

  function renderBadges(container, item, id) {
    container.replaceChildren();
    const article = detectArticle(item);
    if (article === "der") container.appendChild(createBadge("Maskulin (der)", "badge-der"));
    else if (article === "die") container.appendChild(createBadge("Feminin (die)", "badge-die"));
    else if (article === "das") container.appendChild(createBadge("Neutrum (das)", "badge-das"));
    else if (article === "plural") container.appendChild(createBadge("Plural", "badge-plural"));

    if (item.pos) container.appendChild(createBadge(item.pos));
    if (item.topic) container.appendChild(createBadge(item.topic, "badge-topic"));
    if (id && state.learned.has(id)) container.appendChild(createBadge("✓ Hafal", "badge-das"));
    if (id && state.starred.has(id)) container.appendChild(createBadge("★ Sulit", "badge-plural"));
  }

  function renderGermanSide(container, item) {
    container.replaceChildren();
    const h = document.createElement("h2");
    h.className = "word-main";
    h.textContent = item.word || "";
    container.appendChild(h);

    if (item.plural) {
      const sub = document.createElement("p");
      sub.className = "word-sub";
      sub.textContent = item.plural;
      container.appendChild(sub);
    }
  }

  function renderMeaningSide(container, item, showGermanHeader) {
    container.replaceChildren();

    if (showGermanHeader && item.word) {
      const smallDe = document.createElement("p");
      smallDe.className = "word-sub";
      smallDe.textContent = item.plural ? `${item.word} (${item.plural})` : item.word;
      container.appendChild(smallDe);
    }

    if (showGermanHeader) {
      const meaningLabel = document.createElement("span");
      meaningLabel.className = "back-section-label";
      meaningLabel.textContent = "Arti";
      container.appendChild(meaningLabel);
    }

    const meaning = document.createElement("p");
    meaning.className = "meaning-main";
    meaning.textContent = item.meaning || "";
    container.appendChild(meaning);

    if (item.example) {
      const box = document.createElement("div");
      box.className = "example-box";
      const exLabel = document.createElement("span");
      exLabel.className = "back-section-label";
      exLabel.textContent = "Contoh Kalimat";
      box.appendChild(exLabel);
      const exDe = document.createElement("p");
      exDe.className = "example-de";
      exDe.textContent = item.example;
      box.appendChild(exDe);
      if (item.exampleId) {
        const exId = document.createElement("p");
        exId.className = "example-id";
        exId.textContent = item.exampleId;
        box.appendChild(exId);
      }
      container.appendChild(box);
    }

    if (item.note) {
      const note = document.createElement("div");
      note.className = "note-box";
      const noteLabel = document.createElement("span");
      noteLabel.className = "back-section-label";
      noteLabel.textContent = "Parafrase & Catatan B2";
      note.appendChild(noteLabel);
      note.appendChild(document.createTextNode(item.note));
      container.appendChild(note);
    }
  }

  function updateStats() {
    const scopeWords =
      state.topic === "all" ? allWords : allWords.filter((w) => w.topic === state.topic);
    const total = scopeWords.length;
    const learnedCount = scopeWords.filter((w) => {
      const origIdx = allWords.indexOf(w);
      return state.learned.has(getWordId(w, origIdx));
    }).length;
    const starredCount = scopeWords.filter((w) => {
      const origIdx = allWords.indexOf(w);
      return state.starred.has(getWordId(w, origIdx));
    }).length;
    const pct = total > 0 ? Math.round((learnedCount / total) * 100) : 0;

    if (el.statScope) {
      el.statScope.textContent = state.topic === "all" ? "Semua" : state.topic;
    }
    el.statTotal.textContent = String(total);
    el.statLearned.textContent = String(learnedCount);
    el.statStarred.textContent = String(starredCount);
    el.progressFill.style.width = `${pct}%`;
    el.progressPct.textContent = `${pct}%`;

    // Closure Banner when 100% of current topic is learned (Rule 4)
    if (el.completionBanner) {
      const isComplete = total > 0 && learnedCount === total;
      el.completionBanner.classList.toggle("hidden", !isComplete);
      if (isComplete) {
        const scopeLabel = state.topic === "all" ? "seluruh kosakata B2" : state.topic;
        el.completionTitle.textContent = `Tuntas! ${learnedCount}/${total} kosakata ${scopeLabel} sudah hafal.`;
        el.btnCompletionAll.classList.toggle("hidden", state.topic === "all");
      }
    }
  }

  function renderCards() {
    const words = getFilteredWords();
    const total = words.length;

    if (state.currentIndex >= total) state.currentIndex = Math.max(0, total - 1);

    const hasWords = total > 0;
    el.cardViewport.classList.toggle("is-empty", !hasWords);
    el.flashcard.classList.toggle("hidden", !hasWords);
    el.emptyState.classList.toggle("hidden", hasWords);
    el.btnPrev.disabled = !hasWords || total <= 1;
    el.btnNext.disabled = !hasWords || total <= 1;
    el.btnPrevMobile.disabled = !hasWords || total <= 1;
    el.btnNextMobile.disabled = !hasWords || total <= 1;
    el.btnFlipMobile.disabled = !hasWords;
    el.btnStar.disabled = !hasWords;
    el.btnLearned.disabled = !hasWords;
    el.btnShuffle.disabled = !hasWords || total <= 1;

    if (!hasWords) {
      el.cardCounter.textContent = "0 / 0";
      if (el.deckProgressFill) el.deckProgressFill.style.width = "0%";
      el.btnStar.classList.remove("active");
      el.btnLearned.classList.remove("active");
      if (allWords.length === 0) {
        el.emptyTitle.textContent = "Belum ada kosakata Goethe B2";
        el.emptyDesc.textContent =
          "Daftar word charts masih kosong. Kirimkan daftar kata atau materi B2 Anda kapan saja untuk dimasukkan ke sini.";
        el.btnResetFilters.classList.add("hidden");
      } else {
        el.emptyTitle.textContent = "Tidak ada kosakata yang cocok";
        el.emptyDesc.textContent = "Coba ubah kata kunci pencarian atau reset filter yang aktif.";
        el.btnResetFilters.classList.remove("hidden");
      }
      return;
    }

    const item = words[state.currentIndex];
    const origIdx = allWords.indexOf(item);
    const id = getWordId(item, origIdx >= 0 ? origIdx : state.currentIndex);
    const article = detectArticle(item);

    el.cardCounter.textContent = `${state.currentIndex + 1} / ${total}`;
    if (el.deckProgressFill) {
      const deckPct = Math.round(((state.currentIndex + 1) / total) * 100);
      el.deckProgressFill.style.width = `${deckPct}%`;
    }
    el.flashcard.setAttribute("data-article", article);

    const pipNo = `#${String(state.currentIndex + 1).padStart(2, "0")}`;
    const frontSuit = article && article !== "none" ? article.toUpperCase() : (item.pos ? item.pos.slice(0, 3).toUpperCase() : "B2");
    const backSuit = state.direction === "DE_ID" ? "ID" : "DE";
    el.frontPipNum.textContent = pipNo;
    el.frontPipNumBot.textContent = pipNo;
    el.frontPipSuit.textContent = frontSuit;
    el.frontPipSuitBot.textContent = frontSuit;
    el.backPipNum.textContent = pipNo;
    el.backPipNumBot.textContent = pipNo;
    el.backPipSuit.textContent = backSuit;
    el.backPipSuitBot.textContent = backSuit;

    renderBadges(el.frontBadges, item, id);
    renderBadges(el.backBadges, item, id);

    if (state.direction === "DE_ID") {
      renderGermanSide(el.frontContent, item);
      renderMeaningSide(el.backContent, item, true);
    } else {
      renderMeaningSide(el.frontContent, { meaning: item.meaning }, false);
      renderMeaningSide(el.backContent, item, true);
    }

    const flipped = state.autoReveal ? true : state.isFlipped;
    el.flashcard.classList.toggle("is-flipped", flipped);
    el.btnFlipMobile.textContent = flipped ? "Lihat Depan" : "Lihat Arti";

    const isLearned = state.learned.has(id);
    const isStarred = state.starred.has(id);
    el.btnLearned.classList.toggle("active", isLearned);
    el.learnedText.textContent = isLearned ? "Hafal ✓" : "Sudah Hafal";
    el.btnStar.classList.toggle("active", isStarred);
    el.starText.textContent = isStarred ? "Sulit ★" : "Tandai Sulit";
  }

  function renderList() {
    const words = getFilteredWords();
    el.listCount.textContent = `${words.length} kata ditampilkan`;
    el.wordListContainer.replaceChildren();

    if (words.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML =
        allWords.length === 0
          ? `<div class="empty-icon">🗂️</div><h2>Belum ada kosakata</h2><p>Daftar masih kosong dan siap diisi dengan kosakata Goethe B2 Anda.</p>`
          : `<div class="empty-icon">🔍</div><h2>Tidak ada hasil</h2><p>Coba ubah filter atau kata kunci pencarian.</p>`;
      el.wordListContainer.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    words.forEach((item, idx) => {
      const origIdx = allWords.indexOf(item);
      const id = getWordId(item, origIdx >= 0 ? origIdx : idx);

      const row = document.createElement("div");
      row.className = "word-row";
      const art = detectArticle(item);
      if (art && art !== "none") row.setAttribute("data-article", art);
      row.addEventListener("click", () => {
        state.currentIndex = idx;
        state.isFlipped = false;
        setView("cards");
      });

      const main = document.createElement("div");
      main.className = "word-row-main";

      const de = document.createElement("div");
      de.className = "word-row-de";
      de.textContent = item.plural ? `${item.word} (${item.plural})` : item.word || "";

      const meaning = document.createElement("div");
      meaning.className = "word-row-id";
      meaning.textContent = item.meaning || "";

      main.appendChild(de);
      main.appendChild(meaning);

      const meta = document.createElement("div");
      meta.className = "word-row-meta";
      if (item.topic) meta.appendChild(createBadge(item.topic, "badge-topic"));
      if (state.starred.has(id)) meta.appendChild(createBadge("★", "badge-plural"));
      if (state.learned.has(id)) meta.appendChild(createBadge("✓", "badge-das"));

      row.appendChild(main);
      row.appendChild(meta);
      frag.appendChild(row);
    });

    el.wordListContainer.appendChild(frag);
  }

  function updateFilterToggleBadge() {
    let activeCount = 0;
    if (state.topic !== "all") activeCount += 1;
    if (state.pos !== "all") activeCount += 1;
    if (state.status !== "all") activeCount += 1;
    const hasSearch = state.search.trim().length > 0;

    if (el.btnToggleFilters) {
      el.btnToggleFilters.classList.toggle("has-active", activeCount > 0);
      el.btnToggleFilters.textContent = activeCount > 0 ? `Filter (${activeCount})` : "Filter";
    }
    if (el.btnResetFiltersTop) {
      el.btnResetFiltersTop.classList.toggle("hidden", activeCount === 0 && !hasSearch);
    }
    if (el.btnClearSearch) {
      el.btnClearSearch.classList.toggle("hidden", !hasSearch);
    }
  }

  function resetCardScroll() {
    if (!el.flashcard) return;
    el.flashcard.querySelectorAll(".poker-frame").forEach((frame) => {
      frame.scrollTop = 0;
    });
  }

  function render() {
    updateStats();
    updateTopicPillsUI();
    updateFilterToggleBadge();
    if (state.view === "cards") {
      renderCards();
    } else {
      renderList();
    }
  }

  function setView(view) {
    state.view = view;
    const isCards = view === "cards";
    el.btnViewCards.classList.toggle("active", isCards);
    el.btnViewList.classList.toggle("active", !isCards);
    el.cardsView.classList.toggle("hidden", !isCards);
    el.listView.classList.toggle("hidden", isCards);
    render();
  }

  let didSwipeRecently = false;

  function launchGhostCard(exitDir, startTransform = "") {
    if (!el.flashcard || el.flashcard.classList.contains("hidden")) return;
    const ghost = el.flashcard.cloneNode(true);
    ghost.removeAttribute("id");
    ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    ghost.classList.remove("is-dragging", "is-springing", "is-entering");
    ghost.classList.add("is-ghost");
    if (startTransform) {
      ghost.style.transform = startTransform;
    }
    el.cardViewport.appendChild(ghost);
    void ghost.offsetWidth;

    const targetX = exitDir > 0 ? "135%" : "-135%";
    const targetRot = exitDir > 0 ? "14deg" : "-14deg";
    ghost.style.transform = `translate3d(${targetX}, 22px, 0) rotate(${targetRot})`;
    ghost.style.opacity = "0";

    setTimeout(() => {
      ghost.remove();
    }, 300);
  }

  function animateSlide(exitDir) {
    launchGhostCard(exitDir);
    el.flashcard.classList.remove("is-entering");
    void el.flashcard.offsetWidth;
    el.flashcard.classList.add("is-entering");
  }

  function stepCard(delta, startTransform = "") {
    const words = getFilteredWords();
    if (words.length <= 1) return;
    const exitDir = delta > 0 ? -1 : 1;
    launchGhostCard(exitDir, startTransform);
    state.currentIndex = (state.currentIndex + delta + words.length) % words.length;
    state.isFlipped = false;
    el.flashcard.style.transform = "";
    el.flashcard.classList.remove("is-dragging", "is-springing", "is-entering");
    void el.flashcard.offsetWidth;
    el.flashcard.classList.add("is-entering");
    resetCardScroll();
    renderCards();
  }

  function flipCard() {
    if (didSwipeRecently) return;
    const words = getFilteredWords();
    if (words.length === 0) return;
    if (state.autoReveal) {
      state.autoReveal = false;
      el.toggleAutoReveal.checked = false;
      state.isFlipped = false;
    } else {
      state.isFlipped = !state.isFlipped;
    }
    resetCardScroll();
    renderCards();
  }

  function toggleCurrentFlag(setObj, label) {
    const words = getFilteredWords();
    if (words.length === 0) return;
    const item = words[state.currentIndex];
    const origIdx = allWords.indexOf(item);
    const id = getWordId(item, origIdx >= 0 ? origIdx : state.currentIndex);

    const wasPresent = setObj.has(id);
    if (wasPresent) setObj.delete(id);
    else setObj.add(id);

    state.updatedAt = Date.now();
    state.dirty = true;
    saveStorage();
    render();
    schedulePushSync();

    const actionMsg = wasPresent ? `Tanda ${label} dihapus` : `Ditandai ${label}`;
    showToast(actionMsg, () => {
      if (wasPresent) setObj.add(id);
      else setObj.delete(id);
      state.updatedAt = Date.now();
      state.dirty = true;
      saveStorage();
      render();
      schedulePushSync();
      showToast("Perubahan dibatalkan", null, 2000);
    });
  }

  function shuffleDeck() {
    const words = getFilteredWords();
    if (words.length <= 1) return;
    const prevOrder = state.shuffledOrder ? [...state.shuffledOrder] : null;
    const prevIndex = state.currentIndex;

    // Reset to base filtered list first, then shuffle indices
    state.shuffledOrder = null;
    const base = getFilteredWords();
    const indices = base.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    state.shuffledOrder = indices;
    state.currentIndex = 0;
    state.isFlipped = false;
    animateSlide(-1);
    resetCardScroll();
    render();

    showToast(`Urutan ${base.length} kartu diacak`, () => {
      state.shuffledOrder = prevOrder;
      state.currentIndex = prevIndex;
      state.isFlipped = false;
      resetCardScroll();
      render();
      showToast("Urutan kartu dikembalikan", null, 2000);
    });
  }

  function setSpeakingUI(isSpeaking) {
    if (el.btnSpeakFront) el.btnSpeakFront.classList.toggle("is-speaking", isSpeaking);
    if (el.btnSpeakBack) el.btnSpeakBack.classList.toggle("is-speaking", isSpeaking);
  }

  function speakCurrentWord(e) {
    if (e) e.stopPropagation();
    const words = getFilteredWords();
    if (words.length === 0 || !("speechSynthesis" in window)) return;
    const item = words[state.currentIndex];
    if (!item.word) return;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(item.word);
    utter.lang = "de-DE";
    utter.rate = 0.95;
    utter.onstart = () => setSpeakingUI(true);
    utter.onend = () => setSpeakingUI(false);
    utter.onerror = () => setSpeakingUI(false);
    setSpeakingUI(true);
    window.speechSynthesis.speak(utter);
  }

  function resetFilters() {
    state.search = "";
    state.topic = "all";
    state.pos = "all";
    state.status = "all";
    state.shuffledOrder = null;
    state.currentIndex = 0;
    state.isFlipped = false;
    el.searchInput.value = "";
    el.filterTopic.value = "all";
    el.filterPos.value = "all";
    el.filterStatus.value = "all";
    saveStorage();
    resetCardScroll();
    render();
    showToast("Semua filter direset", null, 2200);
  }

  function bindEvents() {
    el.btnViewCards.addEventListener("click", () => setView("cards"));
    el.btnViewList.addEventListener("click", () => setView("list"));

    el.btnTheme.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      saveStorage();
    });

    el.btnToggleFilters.addEventListener("click", () => {
      const open = el.filtersRow.classList.toggle("is-open");
      el.btnToggleFilters.setAttribute("aria-expanded", String(open));
    });

    el.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      state.shuffledOrder = null;
      state.currentIndex = 0;
      state.isFlipped = false;
      render();
    });

    if (el.btnClearSearch) {
      el.btnClearSearch.addEventListener("click", () => {
        state.search = "";
        el.searchInput.value = "";
        state.shuffledOrder = null;
        state.currentIndex = 0;
        state.isFlipped = false;
        render();
        el.searchInput.focus();
      });
    }

    el.filterTopic.addEventListener("change", (e) => {
      selectTopic(e.target.value);
    });

    el.filterPos.addEventListener("change", (e) => {
      state.pos = e.target.value;
      state.shuffledOrder = null;
      state.currentIndex = 0;
      state.isFlipped = false;
      render();
    });

    el.filterStatus.addEventListener("change", (e) => {
      state.status = e.target.value;
      state.shuffledOrder = null;
      state.currentIndex = 0;
      state.isFlipped = false;
      render();
    });

    function toggleDirection() {
      state.direction = state.direction === "DE_ID" ? "ID_DE" : "DE_ID";
      const label = state.direction === "DE_ID" ? "DE → ID" : "ID → DE";
      el.directionLabel.textContent = label;
      state.isFlipped = false;
      saveStorage();
      resetCardScroll();
      renderCards();
      showToast(`Mode kartu: ${label}`, null, 2200);
    }

    el.btnDirection.addEventListener("click", toggleDirection);

    el.btnShuffle.addEventListener("click", shuffleDeck);
    if (el.btnResetFiltersTop) {
      el.btnResetFiltersTop.addEventListener("click", resetFilters);
    }
    if (el.btnCompletionShuffle) {
      el.btnCompletionShuffle.addEventListener("click", () => {
        setView("cards");
        shuffleDeck();
      });
    }
    if (el.btnCompletionAll) {
      el.btnCompletionAll.addEventListener("click", () => selectTopic("all"));
    }
    if (el.btnToastUndo) {
      el.btnToastUndo.addEventListener("click", runUndo);
    }

    el.toggleAutoReveal.addEventListener("change", (e) => {
      state.autoReveal = e.target.checked;
      saveStorage();
      renderCards();
    });

    el.btnPrev.addEventListener("click", () => stepCard(-1));
    el.btnNext.addEventListener("click", () => stepCard(1));
    el.btnPrevMobile.addEventListener("click", () => stepCard(-1));
    el.btnNextMobile.addEventListener("click", () => stepCard(1));
    el.btnFlipMobile.addEventListener("click", flipCard);

    el.flashcard.addEventListener("click", flipCard);
    el.btnSpeakFront.addEventListener("click", speakCurrentWord);
    el.btnSpeakBack.addEventListener("click", speakCurrentWord);

    el.btnStar.addEventListener("click", () => toggleCurrentFlag(state.starred, "Sulit"));
    el.btnLearned.addEventListener("click", () => toggleCurrentFlag(state.learned, "Hafal"));
    el.btnResetFilters.addEventListener("click", resetFilters);

    // Error Prevention Dialog before Resetting Progress (Rule 5 & Rule 6)
    el.btnResetProgress.addEventListener("click", () => {
      if (state.learned.size === 0 && state.starred.size === 0) {
        showToast("Belum ada progres hafalan untuk direset.", null, 2200);
        return;
      }
      if (el.confirmDialogDesc) {
        el.confirmDialogDesc.textContent = `Anda akan menghapus ${state.learned.size} tanda Hafal dan ${state.starred.size} tanda Sulit. Anda masih dapat membatalkannya lewat tombol Urungkan sesaat setelah reset.`;
      }
      if (el.confirmDialog && typeof el.confirmDialog.showModal === "function") {
        el.confirmDialog.showModal();
      }
    });

    if (el.btnCloseConfirm) {
      el.btnCloseConfirm.addEventListener("click", () => el.confirmDialog.close());
    }
    if (el.btnCancelReset) {
      el.btnCancelReset.addEventListener("click", () => el.confirmDialog.close());
    }
    if (el.confirmDialog) {
      el.confirmDialog.addEventListener("click", (e) => {
        if (e.target === el.confirmDialog) el.confirmDialog.close();
      });
    }
    if (el.btnConfirmReset) {
      el.btnConfirmReset.addEventListener("click", () => {
        const prevLearned = new Set(state.learned);
        const prevStarred = new Set(state.starred);
        state.learned.clear();
        state.starred.clear();
        state.updatedAt = Date.now();
        state.dirty = true;
        saveStorage();
        render();
        schedulePushSync();
        el.confirmDialog.close();

        showToast(
          "Semua progres hafalan direset.",
          () => {
            state.learned = prevLearned;
            state.starred = prevStarred;
            state.updatedAt = Date.now();
            state.dirty = true;
            saveStorage();
            render();
            schedulePushSync();
            showToast("Progres hafalan berhasil dipulihkan!", null, 2400);
          },
          6000
        );
      });
    }

    // Sync dialog controls
    el.btnSyncModal.addEventListener("click", () => {
      showDialogMsg("");
      updateSyncDialogUI();
      el.syncDialog.showModal();
    });

    el.btnCloseSync.addEventListener("click", () => {
      el.syncDialog.close();
    });

    el.syncDialog.addEventListener("click", (e) => {
      if (e.target === el.syncDialog) {
        el.syncDialog.close();
      }
    });

    el.syncForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = el.syncKeyInput.value.trim();
      if (!key) {
        showDialogMsg("Masukkan GitHub Token (izin gist) terlebih dahulu.", "is-error");
        return;
      }

      el.btnConnectSync.disabled = true;
      showDialogMsg("Menghubungkan ke GitHub Gist Private...", "");
      try {
        const isFirstConnect = state.syncKey !== key;
        const gist = await resolveGist(key, isFirstConnect ? "" : state.gistId);
        state.syncKey = key;
        state.gistId = gist.id;
        syncHalted = false;
        consecutiveFailures = 0;
        saveStorage();
        const res = await syncOnStartupOrManual({ mergeIfBoth: isFirstConnect, manual: true });
        updateSyncDialogUI();
        if (res.ok) {
          showDialogMsg("Terhubung ke Gist Private & tersinkronisasi!", "is-ok");
        } else {
          showDialogMsg("Gagal menyinkronkan dengan GitHub Gist.", "is-error");
        }
      } catch (err) {
        if (err && err.message === "UNAUTHORIZED") {
          showDialogMsg("Token tidak valid atau tidak memiliki izin gist.", "is-error");
        } else {
          showDialogMsg("Tidak dapat terhubung ke GitHub API.", "is-error");
        }
      } finally {
        el.btnConnectSync.disabled = false;
      }
    });

    el.btnSyncNow.addEventListener("click", async () => {
      el.btnSyncNow.disabled = true;
      syncHalted = false;
      consecutiveFailures = 0;
      showDialogMsg("Menyinkronkan...", "");
      const res = await syncOnStartupOrManual({ manual: true });
      el.btnSyncNow.disabled = false;
      if (res.ok) showDialogMsg("Sinkronisasi selesai!", "is-ok");
      else if (res.reason === "UNAUTHORIZED") showDialogMsg("Token salah atau tidak punya izin gist.", "is-error");
      else showDialogMsg("Gagal menyinkronkan.", "is-error");
    });

    el.btnDisconnectSync.addEventListener("click", () => {
      clearTimeout(syncTimer);
      state.syncKey = "";
      state.gistId = "";
      state.dirty = false;
      syncHalted = false;
      consecutiveFailures = 0;
      el.syncKeyInput.value = "";
      saveStorage();
      setSyncStatus("local", "Lokal");
      updateSyncDialogUI();
      showDialogMsg("Perangkat ini diputuskan dari sinkronisasi Gist.", "");
    });

    // Flush pending sync when leaving/backgrounding tab (respects circuit breaker)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.dirty && !syncHalted && canUseCloudSync()) {
        pushSync({ keepalive: true });
      }
    });
    window.addEventListener("pagehide", () => {
      if (state.dirty && !syncHalted && canUseCloudSync()) {
        pushSync({ keepalive: true });
      }
    });

    // Live poker-card touch drag + swipe (with safe vertical scroll inside tall cards)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let dragMode = null; // null | "horizontal" | "vertical"
    let currentDx = 0;
    let maxDy = 0;
    let touchIgnored = false;

    el.cardViewport.addEventListener(
      "touchstart",
      (e) => {
        if (e.changedTouches.length !== 1 || el.flashcard.classList.contains("hidden")) {
          touchIgnored = true;
          return;
        }
        if (e.target && e.target.closest("button, a, input, select")) {
          touchIgnored = true;
          return;
        }
        touchIgnored = false;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        touchStartTime = Date.now();
        dragMode = null;
        currentDx = 0;
        maxDy = 0;
        el.flashcard.classList.remove("is-springing", "is-entering");
      },
      { passive: true }
    );

    el.cardViewport.addEventListener(
      "touchmove",
      (e) => {
        if (touchIgnored || e.changedTouches.length !== 1 || el.flashcard.classList.contains("hidden")) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        maxDy = Math.max(maxDy, Math.abs(dy));

        if (!dragMode) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          dragMode = Math.abs(dx) > Math.abs(dy) * 1.15 ? "horizontal" : "vertical";
        }

        if (dragMode === "horizontal") {
          e.preventDefault();
          currentDx = dx;
          const words = getFilteredWords();
          const dampedDx = words.length <= 1 ? dx * 0.28 : dx;
          const rot = dampedDx * 0.048;
          const arcY = Math.min(18, Math.abs(dampedDx) * 0.07);
          el.flashcard.classList.add("is-dragging");
          el.flashcard.style.transform = `translate3d(${dampedDx}px, ${arcY}px, 0) rotate(${rot}deg)`;

          if (el.deckStack1) {
            const progress = Math.min(1, Math.abs(dampedDx) / 140);
            const scale = 0.955 + progress * 0.045;
            const y = 7 - progress * 7;
            const deckRot = -1.4 + progress * 1.4;
            el.deckStack1.style.transform = `translateY(${y}px) scale(${scale}) rotate(${deckRot}deg)`;
          }

          if (words.length > 1 && el.swipeCueLeft && el.swipeCueRight) {
            const cueAlpha = Math.min(0.95, Math.max(0, (Math.abs(dampedDx) - 24) / 70));
            el.swipeCueLeft.style.opacity = dampedDx < 0 ? String(cueAlpha) : "0";
            el.swipeCueRight.style.opacity = dampedDx > 0 ? String(cueAlpha) : "0";
          }
        }
      },
      { passive: false }
    );

    function resetSwipeCues() {
      if (el.swipeCueLeft) el.swipeCueLeft.style.opacity = "0";
      if (el.swipeCueRight) el.swipeCueRight.style.opacity = "0";
    }

    function finishTouchDrag() {
      resetSwipeCues();
      if (touchIgnored) {
        touchIgnored = false;
        return;
      }
      if (dragMode === "horizontal") {
        const elapsed = Date.now() - touchStartTime;
        const velocity = Math.abs(currentDx) / Math.max(1, elapsed);
        const words = getFilteredWords();
        const shouldSlide = words.length > 1 && (Math.abs(currentDx) > 65 || (Math.abs(currentDx) > 28 && velocity > 0.35));

        didSwipeRecently = true;
        setTimeout(() => {
          didSwipeRecently = false;
        }, 260);

        if (el.deckStack1) {
          el.deckStack1.style.transform = "";
        }

        if (shouldSlide) {
          const delta = currentDx < 0 ? 1 : -1;
          const startTransform = el.flashcard.style.transform;
          stepCard(delta, startTransform);
        } else {
          el.flashcard.classList.remove("is-dragging");
          el.flashcard.classList.add("is-springing");
          el.flashcard.style.transform = "translate3d(0, 0, 0) rotate(0deg)";
          setTimeout(() => {
            el.flashcard.classList.remove("is-springing");
            el.flashcard.style.transform = "";
          }, 280);
        }
      } else if (dragMode === "vertical" && maxDy > 10) {
        // Prevent accidental flip right after scrolling inside a long card face
        didSwipeRecently = true;
        setTimeout(() => {
          didSwipeRecently = false;
        }, 220);
      }
      dragMode = null;
      currentDx = 0;
      maxDy = 0;
    }

    el.cardViewport.addEventListener("touchend", finishTouchDrag, { passive: true });
    el.cardViewport.addEventListener("touchcancel", finishTouchDrag, { passive: true });

    // Keyboard shortcuts (Rule 2: Shortcuts & Rule 6: Reversal)
    document.addEventListener("keydown", (e) => {
      if ((el.syncDialog && el.syncDialog.open) || (el.confirmDialog && el.confirmDialog.open)) return;
      const active = document.activeElement;
      const tag = active && active.tagName;

      if (e.key === "Escape") {
        if (tag === "INPUT" && el.searchInput.value) {
          state.search = "";
          el.searchInput.value = "";
          render();
        } else if (active && typeof active.blur === "function") {
          active.blur();
        }
        return;
      }

      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "/") {
        e.preventDefault();
        el.searchInput.focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (lastUndoAction) {
          e.preventDefault();
          runUndo();
        }
        return;
      }

      if (state.view !== "cards") return;

      const lower = e.key.toLowerCase();
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepCard(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepCard(1);
      } else if (e.key === " " || e.key === "Enter") {
        if (tag === "BUTTON" || tag === "A") return;
        e.preventDefault();
        flipCard();
      } else if (lower === "h") {
        toggleCurrentFlag(state.learned, "Hafal");
      } else if (lower === "s") {
        toggleCurrentFlag(state.starred, "Sulit");
      } else if (lower === "a") {
        speakCurrentWord();
      } else if (lower === "d") {
        toggleDirection();
      } else if (lower === "r") {
        shuffleDeck();
      } else if (lower === "z") {
        runUndo();
      }
    });

    // Hide audio buttons if SpeechSynthesis is unavailable
    if (!("speechSynthesis" in window)) {
      el.btnSpeakFront.classList.add("hidden");
      el.btnSpeakBack.classList.add("hidden");
    }
  }

  loadStorage();
  populateFilters();
  bindEvents();
  render();
  if (canUseCloudSync()) {
    syncOnStartupOrManual();
  }
})();
