const FINN_KEY = "d25j8t1r01qns40f7tk0d25j8t1r01qns40f7tkg";

/** Search company symbol */
export async function lookupSymbol(query) {
  const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINN_KEY}`);
  const { result = [] } = await res.json();
  return result[0]?.symbol || query.toUpperCase();
}

/** Fetch recent news */
export async function fetchNews(ticker) {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
  const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINN_KEY}`);
  return await res.json();
}

/** Sentiment classification */
export async function fetchSentiment(text) {
  const res = await fetch("https://sentim-api.herokuapp.com/api/v1/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text })
  });
  const { result } = await res.json();
  return result.type;
}