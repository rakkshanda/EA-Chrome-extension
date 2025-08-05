/* ---------------- Finnhub helpers ---------------- */
const FINN_KEY = "d25j8t1r01qns40f7tk0d25j8t1r01qns40f7tkg";        //  <- paste API key

/** Map company name → ticker symbol via Finnhub search */
async function lookupSymbol(q) {
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINN_KEY}`;
  const res = await fetch(url);
  const { result = [] } = await res.json();
  return result[0]?.symbol || q.toUpperCase();   // fallback: treat as ticker
}

/** Fetch company-news JSON (last 7 days) */
async function fetchNews(ticker) {
  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
  const url  = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINN_KEY}`;
  const res  = await fetch(url);
  return await res.json();       // array of {headline,url,datetime,...}
}

/* ---------------- message router ---------------- */
chrome.runtime.onMessage.addListener(async (msg, sender) => {

  /* 1️⃣  News fetch (Search or Updates pane) */
  if (msg.query) {
    try {
      const symbol   = await lookupSymbol(msg.query);
      const articles = await fetchNews(symbol);
      chrome.tabs.sendMessage(sender.tab.id, { articles, __watch: msg.__watch || null });
    } catch {
      chrome.tabs.sendMessage(sender.tab.id, { error: true, __watch: msg.__watch || null });
    }
    return;   // stop here
  }

  /* 2️⃣  Sentiment request for FYI headlines  */
  if (msg.sentiment) {
    try {
      const r = await fetch("https://sentim-api.herokuapp.com/api/v1/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ text: msg.sentiment })
      });
      const { result } = await r.json();
      chrome.tabs.sendMessage(sender.tab.id, { sentiment: result.type, __id: msg.__id });
    } catch {
      chrome.tabs.sendMessage(sender.tab.id, { sentiment: "neutral", __id: msg.__id });
    }
  }
});

/* Re-open overlay on icon click */
chrome.action.onClicked.addListener(tab =>
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const o = document.getElementById("news-overlay");
      if (o) o.style.display = "block";
    }
  })
);
