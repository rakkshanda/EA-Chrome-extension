# EA Chrome Extension - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend Services](#backend-services)
4. [Frontend Components](#frontend-components)
5. [API Integration](#api-integration)
6. [Data Flow](#data-flow)
7. [Security & Permissions](#security--permissions)
8. [File Structure](#file-structure)
9. [Installation & Setup](#installation--setup)
10. [Development Guide](#development-guide)

---

## Overview

The EA Chrome Extension is a **Portfolio News** extension that provides real-time stock news and sentiment analysis directly within the browser. It allows users to search for company news, track watchlists, and receive impact-classified news updates without leaving their current webpage.

### Key Features
- **Real-time News Fetching**: Retrieves latest company news from Finnhub API
- **Sentiment Analysis**: Analyzes news sentiment using external sentiment API
- **Impact Classification**: Automatically categorizes news as High Impact, Neutral, or FYI
- **Watchlist Management**: Track multiple companies for high-impact updates
- **Text Selection Integration**: Automatically searches for news when text is selected
- **Draggable Interface**: Moveable launcher button and overlay interface

---

## Architecture

### Extension Type
- **Manifest Version**: 3 (Modern Chrome Extension)
- **Architecture Pattern**: Service Worker + Content Script + Overlay UI
- **Communication**: Message passing between components

### Core Components
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Background    │◄──►│  Content Script │◄──►│   External APIs │
│  Service Worker │    │   (content.js)  │    │  (Finnhub, etc) │
│ (background.js) │    └─────────────────┘    └─────────────────┘
└─────────────────┘            │
                               ▼
                    ┌─────────────────┐
                    │   Overlay UI    │
                    │  (HTML + CSS)   │
                    └─────────────────┘
```

---

## Backend Services

### Service Worker (background.js)

The background service worker handles all API communications and serves as the central message router.

#### Core Functions

**1. Symbol Lookup Service**
```javascript
async function lookupSymbol(q) {
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINN_KEY}`;
  const res = await fetch(url);
  const { result = [] } = await res.json();
  return result[0]?.symbol || q.toUpperCase();
}
```
- **Purpose**: Converts company names to ticker symbols
- **API**: Finnhub Search API
- **Fallback**: Treats input as ticker if no match found

**2. News Fetching Service**
```javascript
async function fetchNews(ticker) {
  const to   = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
  const url  = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${FINN_KEY}`;
  const res  = await fetch(url);
  return await res.json();
}
```
- **Purpose**: Retrieves company news for the last 7 days
- **API**: Finnhub Company News API
- **Data**: Returns array of news articles with headline, URL, datetime

**3. Sentiment Analysis Service**
```javascript
// Sentiment API call for FYI headlines
const r = await fetch("https://sentim-api.herokuapp.com/api/v1/", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ text: msg.sentiment })
});
```
- **Purpose**: Analyzes sentiment of FYI-classified news
- **API**: Sentim API (Heroku-hosted)
- **Output**: Returns positive/negative/neutral sentiment

#### Message Router
The service worker uses Chrome's message passing API to handle requests:

```javascript
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  // News fetch requests
  if (msg.query) {
    // Handle search/watchlist requests
  }
  
  // Sentiment analysis requests
  if (msg.sentiment) {
    // Handle sentiment analysis for FYI news
  }
});
```

### API Configuration
- **Rate Limiting**: Handled by external APIs
- **Error Handling**: Graceful fallbacks for API failures

---

## Frontend Components

### Content Script (content.js)

The content script is injected into every webpage and manages the user interface.

#### UI Components

**1. Draggable Launcher Button**
```javascript
const logo = document.createElement("div");
logo.id = "news-logo";
logo.innerHTML = `<img src="${chrome.runtime.getURL('assets/icon.png')}" alt="N">`;
```
- **Position**: Fixed bottom-right corner
- **Functionality**: Draggable, toggles overlay visibility
- **Styling**: Circular button with extension icon

**2. Main Overlay Interface**
- **Dimensions**: 420px width, max 80vh height
- **Position**: Fixed top-right corner
- **Tabs**: Search and Updates panes
- **Scrollable**: Vertical overflow handling

**3. Search Pane**
```javascript
<div id="pane-search" class="pane active">
  <div class="search-row">
    <input id="searchInput" placeholder="Search Stock / ETF">
    <button id="searchBtn" class="btn">Fetch</button>
    <button id="refreshSearch" class="btn sec">Refresh</button>
    <button id="clearSearch" class="btn sec">Clear</button>
  </div>
  <div id="searchList" class="news-list">
    Highlight text or search to fetch news …
  </div>
</div>
```

**4. Updates/Watchlist Pane**
```javascript
<div id="pane-updates" class="pane">
  <div class="search-row">
    <input id="watchInput" placeholder="Add company e.g. AAPL">
    <button id="addBtn" class="btn">Save</button>
    <button id="refreshUpdates" class="btn sec">Refresh</button>
    <button id="clearUpdates" class="btn sec">Clear</button>
  </div>
  <div id="tagWrap" class="tag-wrap"></div>
  <div id="updatesList" class="news-list">
    Add companies to watch for high-impact updates …
  </div>
</div>
```

#### Interactive Features

**1. Text Selection Integration**
```javascript
document.addEventListener("mouseup", () => {
  const sel = window.getSelection().toString().trim();
  if (sel) { 
    sInput.value = sel; 
    runSearch(sel); 
  }
});
```
- **Trigger**: Mouse selection on any webpage
- **Action**: Automatically populates search and fetches news

**2. Drag and Drop Functionality**
```javascript
let dragging = false, ox = 0, oy = 0;
logo.onmousedown = e => { dragging = true; ox = e.offsetX; oy = e.offsetY; };
document.onmousemove = e => {
  if (!dragging) return;
  logo.style.left = e.clientX - ox + "px";
  logo.style.top  = e.clientY - oy + "px";
};
```

**3. Persistent Watchlist**
```javascript
let watchList = JSON.parse(localStorage.getItem("watchList") || "[]");
const saveList = () => localStorage.setItem("watchList", JSON.stringify(watchList));
```
- **Storage**: Browser localStorage
- **Persistence**: Survives browser sessions
- **Management**: Add/remove companies dynamically

#### Impact Classification System

**News Impact Classifier**
```javascript
const classify = (txt = "") => {
  const t = txt.toLowerCase();
  const hi = /(earnings|profit|loss|merger|acquisition|lawsuit|plunge|surge|recall|investigation|downgrade|upgrade|guidance|dividend|bankruptcy)/;
  const nu = /(report|analysis|forecast|outlook|price target|coverage)/;
  if (hi.test(t)) return { l: "High Impact", c: "high"   };
  if (nu.test(t)) return { l: "Neutral",     c: "neutral"};
  return            { l: "FYI",         c: "fyi"    };
};
```

**Classification Categories**:
- **High Impact**: Earnings, mergers, lawsuits, major price movements
- **Neutral**: Reports, analysis, forecasts, price targets
- **FYI**: General news requiring sentiment analysis

### Styling (overlay.css)

**Design System**
- **Color Palette**: 
  - Primary: `#0f766e` (Teal)
  - Background: `#fafafa` (Light gray)
  - Text: `#111` (Near black)
- **Typography**: Inter font family
- **Border Radius**: 8-12px for modern look
- **Shadows**: Subtle box-shadows for depth

**Impact Badge Colors**:
- **High Impact**: `#22c55e` (Green)
- **Neutral**: `#eab308` (Yellow)
- **FYI**: `#3b82f6` (Blue)
- **FYI Positive**: `#16a34a` (Dark Green)
- **FYI Negative**: `#dc2626` (Red)
- **FYI Neutral**: `#3b82f6` (Blue)

---

## API Integration

### Finnhub API Integration

**1. Search Endpoint**
```
GET https://finnhub.io/api/v1/search?q={query}&token={API_KEY}
```
- **Purpose**: Convert company names to ticker symbols
- **Response**: Array of matching securities
- **Usage**: Symbol resolution for news fetching

**2. Company News Endpoint**
```
GET https://finnhub.io/api/v1/company-news?symbol={ticker}&from={date}&to={date}&token={API_KEY}
```
- **Purpose**: Retrieve company-specific news
- **Time Range**: Last 7 days
- **Response**: Array of news articles with metadata

**Response Structure**:
```json
[
  {
    "headline": "Company announces quarterly earnings",
    "url": "https://example.com/news/article",
    "datetime": 1640995200,
    "source": "Reuters",
    "summary": "Article summary..."
  }
]
```

### Sentiment Analysis API

**Sentim API Integration**
```
POST https://sentim-api.herokuapp.com/api/v1/
Content-Type: application/json

{
  "text": "News headline text"
}
```

**Response**:
```json
{
  "result": {
    "type": "positive|negative|neutral",
    "confidence": 0.85
  }
}
```

### Error Handling Strategy

```javascript
try {
  const symbol = await lookupSymbol(msg.query);
  const articles = await fetchNews(symbol);
  chrome.tabs.sendMessage(sender.tab.id, { articles, __watch: msg.__watch || null });
} catch {
  chrome.tabs.sendMessage(sender.tab.id, { error: true, __watch: msg.__watch || null });
}
```

- **Graceful Degradation**: Continue operation on API failures
- **User Feedback**: Clear error messages in UI
- **Fallback Behavior**: Default to neutral sentiment on API failure

---

## Data Flow

### Search Flow
```
1. User Input/Text Selection
   ↓
2. Content Script → Background Service Worker
   ↓
3. Background → Finnhub Search API (Symbol Resolution)
   ↓
4. Background → Finnhub News API (Fetch Articles)
   ↓
5. Background → Content Script (Return Results)
   ↓
6. Content Script → UI Rendering (Display Cards)
   ↓
7. For FYI Articles → Sentiment API → UI Update
```

### Watchlist Flow
```
1. User Adds Company to Watchlist
   ↓
2. Store in localStorage
   ↓
3. Render Watchlist Tags
   ↓
4. For Each Company → Fetch News (Same as Search Flow)
   ↓
5. Filter for High-Impact News Only
   ↓
6. Display in Company-Specific Blocks
```

### Message Passing Architecture

**Content Script → Background**
```javascript
// Search request
chrome.runtime.sendMessage({ query: "AAPL" });

// Sentiment analysis request
chrome.runtime.sendMessage({ sentiment: "headline text", __id: "card-123" });
```

**Background → Content Script**
```javascript
// News results
chrome.tabs.sendMessage(sender.tab.id, { 
  articles: [...], 
  __watch: "AAPL" 
});

// Sentiment results
chrome.tabs.sendMessage(sender.tab.id, { 
  sentiment: "positive", 
  __id: "card-123" 
});
```

---

## Security & Permissions

### Manifest Permissions

```json
{
  "permissions": ["scripting", "activeTab"],
  "host_permissions": [
    "https://finnhub.io/*",
    "https://sentim-api.herokuapp.com/*"
  ]
}
```

**Permission Breakdown**:
- **scripting**: Required for content script injection
- **activeTab**: Access to currently active tab
- **host_permissions**: Specific API endpoints only

### Security Measures

**1. Content Security Policy**
- No inline scripts or eval()
- External resources loaded via chrome.runtime.getURL()
- API calls restricted to whitelisted domains

**2. Data Sanitization**
```javascript
const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINN_KEY}`;
```
- URL encoding for user input
- No direct DOM innerHTML with user data

**3. Cross-Origin Resource Sharing**
- API calls made from background script (privileged context)
- Content script receives sanitized data only

**4. API Key Management**
- API key stored in background script
- Not accessible from content scripts or web pages
- Should be moved to environment variables in production

---

## File Structure

```
EA-Chrome-extension/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (API calls, message routing)
├── content.js            # Content script (UI logic, DOM manipulation)
├── overlay.css           # Compiled styles
├── overlay.scss          # Source styles (SASS)
├── overlay.css.map       # Source map for debugging
├── README.MD             # Basic documentation
└── assets/
    └── icon.png          # Extension icon (16x16, 32x32, 48x48, 128x128)
```

### File Dependencies

```
manifest.json
├── background.js (service_worker)
├── content.js (content_scripts)
├── overlay.css (web_accessible_resources)
└── assets/icon.png (web_accessible_resources, icons, action.default_icon)
```

---

## Installation & Setup

### Development Setup

**1. Load Extension in Chrome**
```bash
1. Open Chrome → Extensions (chrome://extensions/)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select EA-Chrome-extension directory
```

**2. API Configuration**
```javascript
// In background.js, update API key
const FINN_KEY = "your-finnhub-api-key-here";
```

**3. SCSS Compilation (Optional)**
```bash
# If modifying styles
sass overlay.scss overlay.css --watch
```

### Production Deployment

**1. Package Extension**
```bash
# Create ZIP file excluding development files
zip -r ea-chrome-extension.zip . -x "*.scss" "*.map" "README.MD"
```

**2. Chrome Web Store Submission**
- Upload ZIP to Chrome Developer Dashboard
- Complete store listing information
- Submit for review

### Environment Variables (Recommended)
```javascript
// For production, use environment-based configuration
const FINN_KEY = process.env.FINNHUB_API_KEY || "fallback-key";
```

---

## Development Guide

### Adding New Features

**1. New API Integration**
```javascript
// In background.js
async function newAPICall(params) {
  const response = await fetch(`https://api.example.com/endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return await response.json();
}

// Add to message listener
if (msg.newFeature) {
  const result = await newAPICall(msg.data);
  chrome.tabs.sendMessage(sender.tab.id, { newFeatureResult: result });
}
```

**2. UI Components**
```javascript
// In content.js
const newComponent = document.createElement("div");
newComponent.innerHTML = `
  <div class="new-feature">
    <!-- Component HTML -->
  </div>
`;
overlay.appendChild(newComponent);
```

**3. Styling**
```scss
// In overlay.scss
.new-feature {
  background: $primary-color;
  border-radius: 8px;
  padding: 12px;
  
  &:hover {
    background: darken($primary-color, 10%);
  }
}
```

### Testing Strategy

**1. Manual Testing**
- Test on various websites
- Verify text selection functionality
- Check API error handling
- Test watchlist persistence

**2. API Testing**
```javascript
// Test API endpoints directly
const testFinnhub = async () => {
  const response = await fetch('https://finnhub.io/api/v1/search?q=AAPL&token=YOUR_KEY');
  console.log(await response.json());
};
```

**3. Extension Debugging**
- Use Chrome DevTools for content script debugging
- Check background script in Extensions page
- Monitor network requests in DevTools

### Performance Optimization

**1. API Rate Limiting**
```javascript
// Implement debouncing for search
let searchTimeout;
const debouncedSearch = (query) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => runSearch(query), 300);
};
```

**2. Memory Management**
```javascript
// Clean up event listeners
const cleanup = () => {
  document.removeEventListener('mouseup', textSelectionHandler);
  document.removeEventListener('mousemove', dragHandler);
};
```

**3. Caching Strategy**
```javascript
// Cache API responses
const newsCache = new Map();
const getCachedNews = (ticker) => {
  const cached = newsCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
    return cached.data;
  }
  return null;
};
```

---

## How Everything Works Together

### Complete User Journey

**1. Extension Installation**
- User installs extension from Chrome Web Store
- Extension registers service worker and content scripts
- Icon appears in browser toolbar

**2. Page Load**
- Content script injects into every webpage
- Creates draggable launcher button
- Loads CSS styles and initializes UI components

**3. News Search**
- User highlights text or clicks launcher button
- Content script captures selection and sends to background
- Background script resolves company name to ticker symbol
- Fetches news from Finnhub API
- Returns results to content script for display

**4. Impact Classification**
- Each news headline is analyzed using regex patterns
- High-impact news (earnings, mergers) gets green badge
- Neutral news (reports, analysis) gets yellow badge
- FYI news gets blue badge and sentiment analysis

**5. Sentiment Analysis**
- FYI headlines sent to sentiment API
- Results update badge color (positive/negative/neutral)
- Provides additional context for investment decisions

**6. Watchlist Management**
- Users can add companies to persistent watchlist
- Stored in browser localStorage
- Automatically fetches high-impact news for watched companies
- Displays in dedicated company blocks

### Technical Integration Points

**Chrome Extension APIs Used**:
- `chrome.runtime.onMessage` - Message passing
- `chrome.tabs.sendMessage` - Tab communication
- `chrome.scripting.executeScript` - Script injection
- `chrome.action.onClicked` - Toolbar icon clicks
- `chrome.runtime.getURL` - Resource access

**Web APIs Used**:
- `fetch()` - HTTP requests
- `localStorage` - Data persistence
- `window.getSelection()` - Text selection
- `document.createElement()` - DOM manipulation
- `addEventListener()` - Event handling

**External Services**:
- **Finnhub API**: Stock data and news
- **Sentim API**: Sentiment analysis
- **Chrome Web Store**: Distribution platform

This comprehensive architecture enables real-time financial news monitoring with intelligent classification and sentiment analysis, all within a lightweight Chrome extension that doesn't interfere with normal browsing activities.
