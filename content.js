/* ==================================================================
   Inject external CSS and fallback pane styles
   ================================================================== */
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = chrome.runtime.getURL("overlay.css");
document.head.appendChild(link);

/* ensure panes toggle even if overlay.css is missing */
const fallback = document.createElement("style");
fallback.textContent = `
  .pane        { display:none; }
  .pane.active { display:block; }
  .tab.active  { background:#0f766e!important; color:#fff!important; }
`;
document.head.appendChild(fallback);

/* ==================================================================
   Helper – impact classifier
   ================================================================== */
const classify = (txt = "") => {
  const t = txt.toLowerCase();
  const hi = /(earnings|profit|loss|merger|acquisition|lawsuit|plunge|surge|recall|investigation|downgrade|upgrade|guidance|dividend|bankruptcy)/;
  const nu = /(report|analysis|forecast|outlook|price target|coverage)/;
  if (hi.test(t)) return { l: "High Impact", c: "high"   };
  if (nu.test(t)) return { l: "Neutral",     c: "neutral"};
  return            { l: "FYI",         c: "fyi"    };
};

/* ==================================================================
   Draggable launcher button 
   ================================================================== */
const logo = document.createElement("div");
logo.id = "news-logo";
logo.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon.png')}" alt="N">`;
document.body.appendChild(logo);

let dragging = false, ox = 0, oy = 0;
logo.onmousedown = e => { dragging = true; ox = e.offsetX; oy = e.offsetY; };
document.onmousemove = e => {
  if (!dragging) return;
  logo.style.left = e.clientX - ox + "px";
  logo.style.top  = e.clientY - oy + "px";
};
document.onmouseup = () => (dragging = false);

/* ==================================================================
   Build overlay HTML (Search + Updates tabs)
   ================================================================== */
const overlay = document.createElement("div");
overlay.id = "news-overlay";
overlay.innerHTML = `
<button class="close">×</button>
<h2 class="overlay-title">Portfolio Insights</h2> 
  <div class="tabs">
    <button class="tab active" data-tab="search">Search</button>
    <button class="tab"        data-tab="updates">Updates</button>
  </div>

  <!-- SEARCH -->
  <div id="pane-search" class="pane active">
    <div class="search-row">
      <input id="searchInput" placeholder="Search Stock / ETF">
      <button id="searchBtn"   class="btn">Fetch</button>
      <button id="refreshSearch" class="btn sec">Refresh</button>
      <button id="clearSearch"   class="btn sec">Clear</button>
    </div>
    <div id="searchList" class="news-list">
      Highlight text or search to fetch news …
    </div>
  </div>

  <!-- UPDATES -->
  <div id="pane-updates" class="pane">
   
    <div class="search-row">
      <input id="watchInput" placeholder="Add company e.g. AAPL">
      <button id="addBtn"        class="btn">Save</button>
      <button id="refreshUpdates" class="btn sec">Refresh</button>
      <button id="clearUpdates"   class="btn sec">Clear</button>
    </div>
     <div id="tagWrap" class="tag-wrap"></div>
    <div id="updatesList" class="news-list">
      Add companies to watch for high-impact updates …
    </div>
  </div>
`;
overlay.style.zIndex = '999999';
overlay.style.pointerEvents = 'auto';

const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.style.pointerEvents = 'auto';
  searchInput.addEventListener('mousedown', e => e.stopPropagation());
  searchInput.addEventListener('click', e => e.stopPropagation());
  searchInput.addEventListener('keydown', e => e.stopPropagation());
}

document.body.appendChild(overlay);
overlay.querySelector("#refreshSearch").textContent  = "⟳";
overlay.querySelector("#clearSearch").textContent    = "×";
overlay.querySelector("#refreshUpdates").textContent = "⟳";
overlay.querySelector("#clearUpdates").textContent   = "×";

/* show / hide */
overlay.style.display = "none";
logo.onclick               = () => overlay.style.display = (overlay.style.display === "none" ? "block" : "none");
overlay.querySelector(".close").onclick = () => overlay.style.display = "none";

/* ==================================================================
   Tab switching
   ================================================================== */
const panes = {
  search : overlay.querySelector("#pane-search"),
  updates: overlay.querySelector("#pane-updates")
};
overlay.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    overlay.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    Object.values(panes).forEach(p => p.classList.toggle("active", p.id === "pane-" + tab.dataset.tab));
  };
});

/* ==================================================================
   SEARCH Pane logic
   ================================================================== */
const sInput  = overlay.querySelector("#searchInput");
const sBtn    = overlay.querySelector("#searchBtn");
const sBox    = overlay.querySelector("#searchList");
const sRefBtn = overlay.querySelector("#refreshSearch");
const sClrBtn = overlay.querySelector("#clearSearch");

let lastQuery = "";

const runSearch = q => {
  if (!q) return;
  lastQuery = q;
  sBox.innerHTML = `🔍 Fetching <b>${q}</b> …`;
  chrome.runtime.sendMessage({ query: q });
  overlay.style.display = "block";
};

sBtn.onclick      = () => runSearch(sInput.value.trim());
sInput.onkeydown  = e => e.key === "Enter" && runSearch(sInput.value.trim());
sRefBtn.onclick   = () => lastQuery && runSearch(lastQuery);
sClrBtn.onclick   = () => { sInput.value = ""; sBox.innerHTML = "Highlight text or search to fetch news …"; lastQuery = ""; };

document.addEventListener("mouseup", () => {
  const sel = window.getSelection().toString().trim();
  if (sel) { sInput.value = sel; runSearch(sel); }
});

/* ==================================================================
   UPDATES Pane logic
   ================================================================== */
const wInput  = overlay.querySelector("#watchInput");
const addBtn  = overlay.querySelector("#addBtn");
const refBtn  = overlay.querySelector("#refreshUpdates");
const clrBtn  = overlay.querySelector("#clearUpdates");
const tagWrap = overlay.querySelector("#tagWrap");
const uBox    = overlay.querySelector("#updatesList");

let watchList = JSON.parse(localStorage.getItem("watchList") || "[]");
const saveList = () => localStorage.setItem("watchList", JSON.stringify(watchList));

/* chips */
const renderChips = () => {
  tagWrap.innerHTML = watchList.map(c =>
    `<span class="tag">${c}<button class="x" data-c="${c}">×</button></span>`
  ).join("");

  tagWrap.querySelectorAll(".x").forEach(btn =>
    btn.onclick = () => {
      watchList = watchList.filter(v => v !== btn.dataset.c);
      saveList();
      renderChips();
      refreshBlocks();
    });
};

/* placeholder + fetch per company */
const refreshBlocks = () => {
  if (!watchList.length) {
    uBox.textContent = "Add companies to watch for high-impact updates …";
    return;
  }

  uBox.innerHTML = watchList.map(c => `
    <div class="watch-block" id="block-${c}">
      <h4>${c}</h4>
      <div class="news-list">🔄 Loading …</div>
    </div>`).join("");

  watchList.forEach(c =>
    chrome.runtime.sendMessage({ query: c, __watch: c })
  );
};

/* add company */
addBtn.onclick = () => {
  const val = wInput.value.trim();
  if (val && !watchList.includes(val)) {
    watchList.push(val);
    saveList();
    wInput.value = "";
    renderChips();
    refreshBlocks();
  }
};

/* refresh / clear buttons */
refBtn.onclick = refreshBlocks;
clrBtn.onclick = () => {
  watchList = [];
  saveList();
  renderChips();
  refreshBlocks();
};

/* init */
renderChips();
if (watchList.length) refreshBlocks();

/* ==================================================================
   Render helpers
   ================================================================== */
const renderCards = (arr, target) => {
  target.innerHTML = arr.slice(0, 5).map((a, idx) => {
    const { headline: h, url, datetime } = a;
    const { l, c } = classify(h);
    const id = `card-${idx}-${Math.random().toString(36).slice(2, 6)}`;

    if (l === "FYI")
      chrome.runtime.sendMessage({ sentiment: h, __id: id });

    return `
      <div class="card" id="${id}">
        <span class="impact ${c}">${l}</span>
        <a class="headline" href="${url}" target="_blank" rel="noreferrer">${h}</a>
        <small class="date">${new Date(datetime * 1000).toLocaleString()}</small>
      </div>`;
  }).join("");
};

/* ==================================================================
   background.js responses
   ================================================================== */
chrome.runtime.onMessage.addListener(msg => {

  /* sentiment upgrade */
  if (msg.sentiment && msg.__id) {
    const card  = document.getElementById(msg.__id);
    if (!card) return;
    const badge = card.querySelector(".impact");
    badge.classList.remove("fyi");
    const map = { positive: "fyi-pos", negative: "fyi-neg", neutral: "fyi-neu" };
    badge.classList.add(map[msg.sentiment]);
    badge.textContent = `FYI – ${msg.sentiment.charAt(0).toUpperCase()}${msg.sentiment.slice(1)}`;
    return;
  }

  /* Updates pane result */
  if (msg.__watch) {
    if (msg.error) return;
    const block = document.getElementById(`block-${msg.__watch}`);
    if (!block) return;

    const hi = (msg.articles || []).find(
      a => classify(a.headline).l === "High Impact"
    );
    const list = block.querySelector(".news-list");

    if (!hi) {
      list.textContent = "No high-impact news.";
    } else {
      list.innerHTML = `
        <div class="card">
          <span class="impact high">High Impact</span>
          <a class="headline" href="${hi.url}" target="_blank" rel="noreferrer">${hi.headline}</a>
          <small class="date">${new Date(hi.datetime * 1000).toLocaleString()}</small>
        </div>`;
    }
    return;
  }

  /* Search pane result */
  if (msg.error)      { sBox.textContent = "❌ Error fetching news."; return; }
  if (!msg.articles)  { sBox.textContent = "😶 No news found.";       return; }
  renderCards(msg.articles, sBox);
});
