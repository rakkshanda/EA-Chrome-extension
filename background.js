chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === "FETCH_NEWS") {
    try {
      const articles = await fetchNews(request.query);
      sendResponse({ articles });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return true; // keep message channel open for async
  }
});

async function fetchNews(query) {
  const res = await fetch(`https://finnhub.io/api/v1/news?category=${query}&token=YOUR_API_KEY`);
  const data = await res.json();
  return data;
}

