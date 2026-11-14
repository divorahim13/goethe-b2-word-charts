(() => {
  "use strict";

  const STORAGE_KEY = "goethe_b2_wordcharts_v1";
  const SYNC_DEBOUNCE_MS = 3500;
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
    syncStatus: "local", // "local" | "synced" | "pending" | "error"
    theme: "light"
  };

  let syncTimer = null;
  let isSyncInFlight = false;

  // DOM Elements
  const el = {
    btnViewCards: document.getElementById("btnViewCards"),
    btnViewList: document.getElementById("btnViewList"),
    btnTheme: document.getElementById("btnTheme"),
    cardsView: document.getElementById("cardsView"),
    listView: document.getElementById("listView"),
    statTotal: document.getElementById("statTotal"),
    statLearned: document.getElementById("statLearned"),
    statStarred: document.getElementById("statStarred"),
    progressFill: document.getElementById("progressFill"),
    progressPct: document.getElementById("progressPct"),
    searchInput: document.getElementById("searchInput"),
    filterTopic: document.getElementById("filterTopic"),
    filterPos: document.getElementById("filterPos"),
    filterStatus: document.getElementById("filterStatus"),
    btnDirection: document.getElementById("btnDirection"),
    directionLabel: document.getElementById("directionLabel"),
    btnShuffle: document.getElementById("btnShuffle"),
    cardCounter: document.getElementById("cardCounter"),
    toggleAutoReveal: document.getElementById("toggleAutoReveal"),
    btnPrev: document.getElementById("btnPrev"),
    btnNext: document.getElementById("btnNext"),
    btnPrevMobile: document.getElementById("btnPrevMobile"),
    btnNextMobile: document.getElementById("btnNextMobile"),
    btnFlipMobile: document.getElementById("btnFlipMobile"),
    cardViewport: document.getElementById("cardViewport"),
    flashcard: document.getElementById("flashcard"),
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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.learned)) state.learned = new Set(parsed.learned);
        if (Array.isArray(parsed.starred)) state.starred = new Set(parsed.starred);
        if (typeof parsed.updatedAt === "number") state.updatedAt = parsed.updatedAt;
        if (typeof parsed.dirty === "boolean") state.dirty = parsed.dirty;
        if (typeof parsed.syncKey === "string") state.syncKey = parsed.syncKey;
        if (parsed.theme === "dark" || parsed.theme === "light") state.theme = parsed.theme;
      } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        state.theme = "dark";
      }
    } catch {
      // Ignore storage errors
    }
    applyTheme();
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
          theme: state.theme
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  function canUseCloudSync() {
    return Boolean(state.syncKey) && location.protocol.startsWith("http");
  }

  async function fetchRemoteProgress(syncKey) {
    const res = await fetch("/api/progress", {
      method: "GET",
      headers: { "x-sync-key": syncKey },
      cache: "no-store"
    });
    if (res.status === 401) throw new Error("UNAUTHORIZED");
    if (!res.ok) throw new Error("SERVER_ERROR");
    return res.json();
  }

  async function pushSync({ keepalive = false } = {}) {
    if (!canUseCloudSync() || (isSyncInFlight && !keepalive)) return false;
    clearTimeout(syncTimer);
    syncTimer = null;
    isSyncInFlight = true;
    setSyncStatus("pending", "Menyimpan...");

    const payload = {
      learned: Array.from(state.learned),
      starred: Array.from(state.starred),
      updatedAt: state.updatedAt || Date.now()
    };

    try {
      const res = await fetch("/api/progress", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-sync-key": state.syncKey
        },
        body: JSON.stringify(payload),
        keepalive
      });
      if (res.status === 401) {
        setSyncStatus("error", "Kode Salah");
        return false;
      }
      if (!res.ok) throw new Error("SERVER_ERROR");
      state.dirty = false;
      state.updatedAt = payload.updatedAt;
      saveStorage();
      setSyncStatus("synced", "Tersinkron");
      return true;
    } catch {
      setSyncStatus("error", "Gagal Sync");
      return false;
    } finally {
      isSyncInFlight = false;
    }
  }

  function schedulePushSync() {
    if (!canUseCloudSync()) return;
    setSyncStatus("pending", "Menyimpan...");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushSync();
    }, SYNC_DEBOUNCE_MS);
  }

  async function syncOnStartupOrManual({ mergeIfBoth = false } = {}) {
    if (!canUseCloudSync()) return { ok: false, reason: "NO_KEY" };
    setSyncStatus("pending", "Sinkronisasi...");
    try {
      const remote = await fetchRemoteProgress(state.syncKey);
      const remoteUpdated = typeof remote.updatedAt === "number" ? remote.updatedAt : 0;
      const remoteLearned = Array.isArray(remote.learned) ? remote.learned : [];
      const remoteStarred = Array.isArray(remote.starred) ? remote.starred : [];

      if (mergeIfBoth && (state.learned.size > 0 || state.starred.size > 0) && remoteUpdated > 0) {
        state.learned = new Set([...remoteLearned, ...state.learned]);
        state.starred = new Set([...remoteStarred, ...state.starred]);
        state.updatedAt = Math.max(Date.now(), remoteUpdated);
        state.dirty = true;
        saveStorage();
        render();
        await pushSync();
      } else if (state.dirty && state.updatedAt >= remoteUpdated) {
        await pushSync();
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
        await pushSync();
      } else {
        setSyncStatus("synced", "Tersinkron");
      }
      return { ok: true };
    } catch (err) {
      if (err && err.message === "UNAUTHORIZED") {
        setSyncStatus("error", "Kode Salah");
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
    const topics = new Set();
    const poses = new Set();

    allWords.forEach((item) => {
      if (item.topic) topics.add(item.topic);
      if (item.pos) poses.add(item.pos);
    });

    Array.from(topics)
      .sort((a, b) => a.localeCompare(b))
      .forEach((topic) => {
        const opt = document.createElement("option");
        opt.value = topic;
        opt.textContent = topic;
        el.filterTopic.appendChild(opt);
      });

    Array.from(poses)
      .sort((a, b) => a.localeCompare(b))
      .forEach((pos) => {
        const opt = document.createElement("option");
        opt.value = pos;
        opt.textContent = pos;
        el.filterPos.appendChild(opt);
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

  function renderBadges(container, item) {
    container.replaceChildren();
    const article = detectArticle(item);
    if (article === "der") container.appendChild(createBadge("Maskulin (der)", "badge-der"));
    else if (article === "die") container.appendChild(createBadge("Feminin (die)", "badge-die"));
    else if (article === "das") container.appendChild(createBadge("Neutrum (das)", "badge-das"));
    else if (article === "plural") container.appendChild(createBadge("Plural", "badge-plural"));

    if (item.pos) container.appendChild(createBadge(item.pos));
    if (item.topic) container.appendChild(createBadge(item.topic, "badge-topic"));
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

    const meaning = document.createElement("p");
    meaning.className = "meaning-main";
    meaning.textContent = item.meaning || "";
    container.appendChild(meaning);

    if (item.example) {
      const box = document.createElement("div");
      box.className = "example-box";
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
      note.textContent = item.note;
      container.appendChild(note);
    }
  }

  function updateStats() {
    const total = allWords.length;
    const learnedCount = allWords.filter((w, i) => state.learned.has(getWordId(w, i))).length;
    const starredCount = allWords.filter((w, i) => state.starred.has(getWordId(w, i))).length;
    const pct = total > 0 ? Math.round((learnedCount / total) * 100) : 0;

    el.statTotal.textContent = String(total);
    el.statLearned.textContent = String(learnedCount);
    el.statStarred.textContent = String(starredCount);
    el.progressFill.style.width = `${pct}%`;
    el.progressPct.textContent = `${pct}%`;
  }

  function renderCards() {
    const words = getFilteredWords();
    const total = words.length;

    if (state.currentIndex >= total) state.currentIndex = Math.max(0, total - 1);

    const hasWords = total > 0;
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

    el.cardCounter.textContent = `${state.currentIndex + 1} / ${total}`;
    el.flashcard.setAttribute("data-article", detectArticle(item));

    renderBadges(el.frontBadges, item);
    renderBadges(el.backBadges, item);

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

  function render() {
    updateStats();
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

  function animateSlide(cls) {
    el.cardViewport.classList.remove("slide-next", "slide-prev");
    void el.cardViewport.offsetWidth;
    el.cardViewport.classList.add(cls);
  }

  function stepCard(delta) {
    const words = getFilteredWords();
    if (words.length <= 1) return;
    state.currentIndex = (state.currentIndex + delta + words.length) % words.length;
    state.isFlipped = false;
    animateSlide(delta > 0 ? "slide-next" : "slide-prev");
    renderCards();
  }

  function flipCard() {
    const words = getFilteredWords();
    if (words.length === 0) return;
    if (state.autoReveal) {
      state.autoReveal = false;
      el.toggleAutoReveal.checked = false;
      state.isFlipped = false;
    } else {
      state.isFlipped = !state.isFlipped;
    }
    renderCards();
  }

  function toggleCurrentFlag(setObj) {
    const words = getFilteredWords();
    if (words.length === 0) return;
    const item = words[state.currentIndex];
    const origIdx = allWords.indexOf(item);
    const id = getWordId(item, origIdx >= 0 ? origIdx : state.currentIndex);

    if (setObj.has(id)) setObj.delete(id);
    else setObj.add(id);

    state.updatedAt = Date.now();
    state.dirty = true;
    saveStorage();
    render();
    schedulePushSync();
  }

  function shuffleDeck() {
    const words = getFilteredWords();
    if (words.length <= 1) return;
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
    animateSlide("slide-next");
    render();
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
    window.speechSynthesis.speak(utter);
  }

  function resetFilters() {
    state.search = "";
    state.topic = "all";
    state.pos = "all";
    state.status = "all";
    state.shuffledOrder = null;
    state.currentIndex = 0;
    el.searchInput.value = "";
    el.filterTopic.value = "all";
    el.filterPos.value = "all";
    el.filterStatus.value = "all";
    render();
  }

  function bindEvents() {
    el.btnViewCards.addEventListener("click", () => setView("cards"));
    el.btnViewList.addEventListener("click", () => setView("list"));

    el.btnTheme.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
      saveStorage();
    });

    el.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value;
      state.shuffledOrder = null;
      state.currentIndex = 0;
      state.isFlipped = false;
      render();
    });

    el.filterTopic.addEventListener("change", (e) => {
      state.topic = e.target.value;
      state.shuffledOrder = null;
      state.currentIndex = 0;
      state.isFlipped = false;
      render();
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

    el.btnDirection.addEventListener("click", () => {
      state.direction = state.direction === "DE_ID" ? "ID_DE" : "DE_ID";
      el.directionLabel.textContent = state.direction === "DE_ID" ? "DE → ID" : "ID → DE";
      state.isFlipped = false;
      renderCards();
    });

    el.btnShuffle.addEventListener("click", shuffleDeck);

    el.toggleAutoReveal.addEventListener("change", (e) => {
      state.autoReveal = e.target.checked;
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

    el.btnStar.addEventListener("click", () => toggleCurrentFlag(state.starred));
    el.btnLearned.addEventListener("click", () => toggleCurrentFlag(state.learned));
    el.btnResetFilters.addEventListener("click", resetFilters);

    el.btnResetProgress.addEventListener("click", () => {
      if (state.learned.size === 0 && state.starred.size === 0) return;
      state.learned.clear();
      state.starred.clear();
      state.updatedAt = Date.now();
      state.dirty = true;
      saveStorage();
      render();
      schedulePushSync();
    });

    // Sync dialog controls
    el.btnSyncModal.addEventListener("click", () => {
      showDialogMsg("");
      updateSyncDialogUI();
      el.syncDialog.showModal();
    });

    el.btnCloseSync.addEventListener("click", () => {
      el.syncDialog.close();
    });

    el.syncForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = el.syncKeyInput.value.trim();
      if (!key) {
        showDialogMsg("Masukkan Kode Sinkron terlebih dahulu.", "is-error");
        return;
      }
      if (!location.protocol.startsWith("http")) {
        showDialogMsg("Sinkronisasi cloud hanya aktif saat dibuka lewat web/Vercel.", "is-error");
        return;
      }

      el.btnConnectSync.disabled = true;
      showDialogMsg("Menghubungkan...", "");
      try {
        await fetchRemoteProgress(key);
        const isFirstConnect = state.syncKey !== key;
        state.syncKey = key;
        saveStorage();
        const res = await syncOnStartupOrManual({ mergeIfBoth: isFirstConnect });
        updateSyncDialogUI();
        if (res.ok) {
          showDialogMsg("Terhubung & tersinkronisasi!", "is-ok");
        } else {
          showDialogMsg("Gagal menyinkronkan dengan server.", "is-error");
        }
      } catch (err) {
        if (err && err.message === "UNAUTHORIZED") {
          showDialogMsg("Kode sinkron salah. Periksa kembali kode Anda.", "is-error");
        } else {
          showDialogMsg("Tidak dapat terhubung ke server sinkron.", "is-error");
        }
      } finally {
        el.btnConnectSync.disabled = false;
      }
    });

    el.btnSyncNow.addEventListener("click", async () => {
      el.btnSyncNow.disabled = true;
      showDialogMsg("Menyinkronkan...", "");
      const res = await syncOnStartupOrManual();
      el.btnSyncNow.disabled = false;
      if (res.ok) showDialogMsg("Sinkronisasi selesai!", "is-ok");
      else if (res.reason === "UNAUTHORIZED") showDialogMsg("Kode sinkron salah.", "is-error");
      else showDialogMsg("Gagal menyinkronkan.", "is-error");
    });

    el.btnDisconnectSync.addEventListener("click", () => {
      clearTimeout(syncTimer);
      state.syncKey = "";
      state.dirty = false;
      el.syncKeyInput.value = "";
      saveStorage();
      setSyncStatus("local", "Lokal");
      updateSyncDialogUI();
      showDialogMsg("Perangkat ini diputuskan dari sinkronisasi cloud.", "");
    });

    // Flush pending sync when leaving/backgrounding tab
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.dirty && canUseCloudSync()) {
        pushSync({ keepalive: true });
      }
    });
    window.addEventListener("pagehide", () => {
      if (state.dirty && canUseCloudSync()) {
        pushSync({ keepalive: true });
      }
    });

    // Touch swipe on card viewport
    let touchStartX = 0;
    let touchStartY = 0;
    el.cardViewport.addEventListener(
      "touchstart",
      (e) => {
        if (e.changedTouches.length !== 1) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      },
      { passive: true }
    );

    el.cardViewport.addEventListener(
      "touchend",
      (e) => {
        if (e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          stepCard(dx < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (el.syncDialog && el.syncDialog.open) return;
      const active = document.activeElement;
      const tag = active && active.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (state.view !== "cards") return;

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
      } else if (e.key.toLowerCase() === "h") {
        toggleCurrentFlag(state.learned);
      } else if (e.key.toLowerCase() === "s") {
        toggleCurrentFlag(state.starred);
      } else if (e.key.toLowerCase() === "a") {
        speakCurrentWord();
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
