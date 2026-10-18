let player;
let subtitles = [];
let cards = JSON.parse(localStorage.getItem('tubevocab_cards') || '[]');
let starOnly = false;
let currentMode = 'list';
let quizIndex = 0;
let flipped = false;
let lastActiveIdx = -1;
let translatingChunks = new Set();

// 後端 API 位址清單：優先嘗試相對路徑，若在 GitHub Pages 則自動嘗試連線本機 5000 Port
const API_BASES = ['', 'http://127.0.0.1:5000'];
let activeApiBase = null;

// 精準校正後的 TED 影片真實時間軸雙語字幕 (UNP03fDSj1U - Matt Cutts: Try something new for 30 days)
const DEMO_SUBTITLES = [
  { start: 12.8, timeStr: "00:12", text: "A few years ago, I felt like I was stuck in a rut,", zh: "幾年前，我覺得自己彷彿陷入了一成不變的生活泥淖，" },
  { start: 16.5, timeStr: "00:16", text: "so I decided to follow in the footsteps of the great American philosopher, Morgan Spurlock,", zh: "所以我決定追隨偉大的美國哲學家摩根·史柏路克的腳步，" },
  { start: 22.1, timeStr: "00:22", text: "and try something new for 30 days.", zh: "連續 30 天嘗試一件新事物。" },
  { start: 25.0, timeStr: "00:25", text: "The idea is actually pretty simple.", zh: "這個概念其實非常簡單。" },
  { start: 27.6, timeStr: "00:27", text: "Think about something you've always wanted to add to your life", zh: "想想一件你一直很想加入自己生活中的事情，" },
  { start: 30.8, timeStr: "00:30", text: "and try it for the next 30 days.", zh: "並在接下來的 30 天裡去嘗試它。" },
  { start: 33.5, timeStr: "00:33", text: "It turns out, 30 days is just about the right amount of time", zh: "事實證明，30 天剛好是恰到好處的時間長度，" },
  { start: 36.9, timeStr: "00:36", text: "to add a new habit or subtract a habit --", zh: "足以養成一個新習慣，或是戒掉一個舊習慣——" },
  { start: 39.8, timeStr: "00:39", text: "like watching the news -- from your life.", zh: "例如看新聞——從你的生活中移除。" },
  { start: 43.2, timeStr: "00:43", text: "There's a few things I learned while doing these 30-day challenges.", zh: "在進行這些 30 天挑戰的過程中，我學到了幾件事。" },
  { start: 46.8, timeStr: "00:46", text: "The first was, instead of the months flying by, forgotten,", zh: "第一點是，時光不再只是被遺忘地飛逝而過，" },
  { start: 50.5, timeStr: "00:50", text: "the time was much more memorable.", zh: "這段時間變得更加令人難忘。" },
  { start: 53.2, timeStr: "00:53", text: "This was part of a challenge I did to take a picture every day for a month.", zh: "這是我進行「連續一個月每天拍一張照片」挑戰的一部分。" },
  { start: 57.5, timeStr: "00:57", text: "And I remember exactly where I was and what I was doing that day.", zh: "而且我清楚記得那天我人在哪裡、正在做什麼。" },
  { start: 62.1, timeStr: "01:02", text: "I also noticed that as I started to do more and harder 30-day challenges,", zh: "我也注意到，當我開始挑戰更多、更困難的 30 天任務時，" },
  { start: 66.8, timeStr: "01:06", text: "my self-confidence grew.", zh: "我的自信心也隨之成長了。" },
  { start: 69.2, timeStr: "01:09", text: "I went from desk-dwelling computer nerd", zh: "我從一個成天坐在電腦桌前的科技宅男，" },
  { start: 72.0, timeStr: "01:12", text: "to the kind of guy who bikes to work -- for fun!", zh: "變成了那種會為了樂趣而騎腳踏車上班的人！" },
  { start: 76.5, timeStr: "01:16", text: "Even last year, I ended up hiking up Mt. Kilimanjaro,", zh: "甚至在去年，我最終成功登上了吉力馬札羅山，" },
  { start: 80.2, timeStr: "01:20", text: "the highest mountain in Africa.", zh: "也就是非洲的最高峰。" },
  { start: 82.8, timeStr: "01:22", text: "I would never have been that adventurous before I started my 30-day challenges.", zh: "在我開始 30 天挑戰之前，我絕對不可能這麼有冒險精神。" },
  { start: 88.0, timeStr: "01:28", text: "I also figured out that if you really want something badly enough,", zh: "我也領悟到，如果你真的非常、非常渴望某件事，" },
  { start: 91.8, timeStr: "01:31", text: "you can do anything for 30 days.", zh: "任何事你都能堅持做 30 天。" },
  { start: 94.5, timeStr: "01:34", text: "Have you ever wanted to write a novel?", zh: "你曾經想過要寫一本小說嗎？" },
  { start: 96.8, timeStr: "01:36", text: "Every November, tens of thousands of people try to write their own 50,000-word novel", zh: "每年十一月，都有數以萬計的人嘗試寫出自己的五萬字小說，" },
  { start: 102.0, timeStr: "01:42", text: "from scratch in 30 days.", zh: "在 30 天內從零開始完成。" },
  { start: 104.5, timeStr: "01:44", text: "It turns out, all you have to do is write 1,667 words a day for a month.", zh: "事實上，你只需要連續一個月、每天寫 1,667 個字就行了。" },
  { start: 110.2, timeStr: "01:50", text: "So I did. By the way, the secret is not to go to sleep", zh: "於是我就這麼做了。順帶一提，秘訣就是在寫完當天的字數前，" },
  { start: 114.5, timeStr: "01:54", text: "until you've written your words for the day.", zh: "絕對不要去睡覺。" },
  { start: 117.2, timeStr: "01:57", text: "You might be sleep-deprived, but you'll finish your novel.", zh: "你可能會睡眠不足，但你一定能完成你的小說。" }
];

// 從任何 YouTube 網址擷取 11 碼 Video ID
function extractVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/|\/shorts\/)([0-9A-Za-z_-]{11})/);
  return match ? match[1] : (url.length === 11 ? url : null);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
}

function toggleDrawer(open) {
  const drawer = document.getElementById('vocabDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (open) {
    drawer.classList.add('open');
    backdrop.classList.add('open');
    renderWorkspace();
  } else {
    drawer.classList.remove('open');
    backdrop.classList.remove('open');
  }
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '100%',
    width: '100%',
    videoId: 'UNP03fDSj1U',
    playerVars: { rel: 0, modestbranding: 1 },
    events: {
      onReady: () => {
        // 頁面一載入就預先顯示校正後同步的雙語字幕
        subtitles = DEMO_SUBTITLES;
        renderSubtitles();
      }
    }
  });
  setInterval(syncSubtitles, 200);
  saveCards();
}

async function cloudTranslate(text) {
  if (!text || !text.trim()) return "";
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    return "";
  }
}

// 自動尋找可用的 Python 後端（支援 GitHub Pages 跨網域呼叫本機 127.0.0.1:5000）
async function callBackend(endpoint, payload) {
  const bases = activeApiBase !== null ? [activeApiBase] : API_BASES;
  for (const base of bases) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        activeApiBase = base;
        return await res.json();
      }
    } catch (e) {
      // 繼續嘗試下一個端點
    }
  }
  throw new Error('Backend unavailable');
}

// 當純前端環境（無開啟 app.py）載入新影片時，嘗試透過無伺服器公開端點抓取 CC 字幕
async function fetchSubtitlesServerless(videoId) {
  // 端點 1：若是預設 TED 影片，直接回傳精準校正版字幕
  if (videoId === 'UNP03fDSj1U') return DEMO_SUBTITLES;

  // 端點 2：透過公開 Invidious / Piped 字幕代理嘗試抓取英文 CC 字幕
  const pipedInstances = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://pipedapi.tokhmi.xyz/streams/${videoId}`
  ];

  for (const apiUrl of pipedInstances) {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) continue;
      const info = await res.json();
      const subTrack = (info.subtitles || []).find(s => s.code && s.code.startsWith('en'));
      if (subTrack && subTrack.url) {
        const vttRes = await fetch(subTrack.url);
        const vttText = await vttRes.text();
        const parsed = parseVttToSubtitles(vttText);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
  }
  return null;
}

// 解析 VTT 字幕格式轉為時間軸陣列
function parseVttToSubtitles(vtt) {
  const lines = vtt.split('\n');
  const result = [];
  let currentStart = null;
  let currentText = [];

  const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->/;
  for (let rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(timeRegex);
    if (match) {
      if (currentStart !== null && currentText.length) {
        const clean = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
        if (clean && (!result.length || result[result.length - 1].text !== clean)) {
          result.push({ start: currentStart, timeStr: formatTime(currentStart), text: clean, zh: "" });
        }
      }
      const hrs = parseInt(match[1] || '0', 10);
      const mins = parseInt(match[2], 10);
      const secs = parseInt(match[3], 10);
      const ms = parseInt(match[4], 10);
      currentStart = Math.round((hrs * 3600 + mins * 60 + secs + ms / 1000) * 10) / 10;
      currentText = [];
    } else if (currentStart !== null && line && !line.startsWith('WEBVTT') && !/^\d+$/.test(line)) {
      currentText.push(line);
    }
  }
  if (currentStart !== null && currentText.length) {
    const clean = currentText.join(' ').replace(/<[^>]+>/g, '').trim();
    if (clean) result.push({ start: currentStart, timeStr: formatTime(currentStart), text: clean, zh: "" });
  }
  return result;
}

async function analyzeVideo() {
  const url = document.getElementById('ytUrl').value.trim();
  const videoId = extractVideoId(url);
  if (!videoId) {
    return alert('請輸入有效的 YouTube 影片網址！');
  }

  // 1. 立即切換左側 YouTube 播放器為使用者貼上的影片（解決無法換影片的問題！）
  if (player && player.loadVideoById) {
    player.loadVideoById(videoId);
  }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 解析字幕中...';
  document.getElementById('subtitleList').innerHTML = '<div class="status-msg">正在擷取影片 CC 字幕並對齊時間軸，請稍候...</div>';

  try {
    // 優先呼叫 Python 後端 (支援本機或背景開啟的 app.py)
    const data = await callBackend('/api/analyze', { url });
    subtitles = data.subtitles;
    lastActiveIdx = -1;
    translatingChunks.clear();
    renderSubtitles();
    ensureChunkTranslated(0);
    showToast('✅ 已成功載入並同步雙語 CC 字幕！');
  } catch (err) {
    // 若在 GitHub Pages 且電腦沒開 app.py，改用無伺服器代理抓取
    const fallbackSubs = await fetchSubtitlesServerless(videoId);
    if (fallbackSubs && fallbackSubs.length) {
      subtitles = fallbackSubs;
      lastActiveIdx = -1;
      translatingChunks.clear();
      renderSubtitles();
      ensureChunkTranslated(0);
      showToast('🌐 已載入同步雙語字幕（點擊右側任意英文單字即可建卡！）');
    } else {
      document.getElementById('subtitleList').innerHTML = `
        <div class="status-msg">
          <p style="color:var(--accent); font-weight:700; margin-bottom:8px;">⚠️ 影片已成功切換！但純靜態網頁受限於 YouTube 跨網域保護，無法直接爬此部新影片的字幕。</p>
          <p style="font-size:0.88rem; margin-bottom:14px;">
            💡 <strong>解決方法 A：</strong>在你的電腦終端機保持執行 <code>py app.py</code>，即使是打開 GitHub Pages 網址也會自動連回本機抓好任何影片的字幕！<br>
            💡 <strong>解決方法 B：</strong>在下方直接貼上任何英文文章或字幕句子，立即產生雙語點字練習：
          </p>
          <textarea id="manualSubInput" rows="5" placeholder="在此貼上英文句子或含時間的字幕（每行一句）..." style="width:90%; padding:10px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border);"></textarea>
          <br>
          <button class="btn btn-primary" style="margin-top:10px;" onclick="loadManualSubtitles()">✨ 立即轉換為雙語互動字幕</button>
        </div>
      `;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 載入雙語字幕';
  }
}

async function loadManualSubtitles() {
  const raw = document.getElementById('manualSubInput').value.trim();
  if (!raw) return;
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  subtitles = lines.map((line, idx) => ({
    start: idx * 4,
    timeStr: formatTime(idx * 4),
    text: line.replace(/^\d+:\d+\s*/, ''),
    zh: ""
  }));
  lastActiveIdx = -1;
  translatingChunks.clear();
  renderSubtitles();
  ensureChunkTranslated(0);
}

// 智慧分段翻譯：同時支援 Python 後端與純前端 Google GTX 雙語翻譯
async function ensureChunkTranslated(startIndex) {
  const chunkSize = 20;
  const chunkId = Math.floor(startIndex / chunkSize);
  if (translatingChunks.has(chunkId)) return;

  const start = chunkId * chunkSize;
  const end = Math.min(start + chunkSize, subtitles.length);
  const slice = subtitles.slice(start, end);
  if (!slice.length || slice.every(s => s.zh && s.zh.trim() !== '')) return;

  translatingChunks.add(chunkId);
  try {
    // 優先直接由瀏覽器高速批次翻譯（在 GitHub Pages 上也能 100% 翻譯出繁體中文！）
    const joined = slice.map(s => s.text.replace(/^>>\s*/, '')).join('\n');
    const translatedBlock = await cloudTranslate(joined);
    if (translatedBlock) {
      const zhLines = translatedBlock.split('\n');
      slice.forEach((_, i) => {
        const idx = start + i;
        if (subtitles[idx] && zhLines[i]) {
          subtitles[idx].zh = zhLines[i].trim();
          const zhEl = document.getElementById(`sub-zh-${idx}`);
          if (zhEl) zhEl.textContent = subtitles[idx].zh;
        }
      });
      return;
    }
  } catch (e) {
    console.error('字幕翻譯失敗:', e);
  }
}

function renderSubtitles() {
  const list = document.getElementById('subtitleList');
  document.getElementById('subCount').textContent = `共 ${subtitles.length} 句`;
  const cardMap = new Map(cards.map(c => [c.word.toLowerCase(), c]));

  list.innerHTML = subtitles.map((sub, idx) => {
    const tokenized = sub.text.replace(/\b([a-zA-Z]{2,})\b/g, (match) => {
      const lower = match.toLowerCase();
      const found = cardMap.get(lower);
      const cls = found ? (found.starred ? 'word-token starred' : 'word-token in-deck') : 'word-token';
      return `<span class="${cls}" onclick="addWordFromSub('${lower}', ${idx})">${match}</span>`;
    });
    return `
      <div class="sub-item" id="sub-${idx}">
        <span class="sub-time" onclick="seekVideo(${sub.start})">▶ ${sub.timeStr}</span>
        <div class="sub-content">
          <div class="sub-en">${tokenized}</div>
          <div class="sub-zh" id="sub-zh-${idx}">${sub.zh || '翻譯載入中...'}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 精準時間軸同步與自動置中滾動
function syncSubtitles() {
  if (!player || typeof player.getCurrentTime !== 'function' || !subtitles.length) return;
  const t = player.getCurrentTime();
  let activeIdx = -1;

  for (let i = 0; i < subtitles.length; i++) {
    if (t >= subtitles[i].start) activeIdx = i;
    else break;
  }

  if (activeIdx !== -1 && activeIdx !== lastActiveIdx) {
    lastActiveIdx = activeIdx;
    document.querySelectorAll('.sub-item.active').forEach(el => el.classList.remove('active'));

    const activeEl = document.getElementById(`sub-${activeIdx}`);
    const container = document.getElementById('subtitleList');

    if (activeEl && container) {
      activeEl.classList.add('active');

      const autoScroll = document.getElementById('autoScrollToggle');
      if (autoScroll && autoScroll.checked) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const relativeOffset = activeRect.top - containerRect.top;
        const targetScrollTop = container.scrollTop + relativeOffset - (container.clientHeight / 2) + (activeEl.clientHeight / 2);

        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }

    ensureChunkTranslated(activeIdx);
    ensureChunkTranslated(activeIdx + 15);
  }
}

async function addWordFromSub(word, subIdx) {
  speak(word);
  const existing = cards.find(c => c.word.toLowerCase() === word);
  if (existing) {
    renderQuickPreview(existing);
    showToast(`💡「${word}」已在單字庫中，已顯示於左下方預覽！`);
    return;
  }

  showToast(`⏳ 正在查詢「${word}」並加入單字庫...`);
  const sentence = subtitles[subIdx];
  let newCard;

  try {
    newCard = await callBackend('/api/lookup', { word, sentence });
  } catch (err) {
    let ipa = `/${word}/`, pos = "n.", enDef = "", extEn = `Practicing "${word}" helps build active vocabulary.`, synonyms = [];
    try {
      const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (dictRes.ok) {
        const d = (await dictRes.json())[0];
        ipa = d.phonetic || (d.phonetics && d.phonetics.find(p => p.text)?.text) || ipa;
        const m = d.meanings?.[0];
        if (m) {
          pos = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.' }[m.partOfSpeech] || m.partOfSpeech;
          enDef = m.definitions?.[0]?.definition || "";
          extEn = m.definitions?.[0]?.example || enDef || extEn;
          synonyms = (m.synonyms || []).slice(0, 4);
        }
      }
    } catch (e) {}

    const zhWord = await cloudTranslate(word);
    const zhDef = enDef ? await cloudTranslate(enDef) : "";
    const finalZh = (zhWord && zhDef && zhWord !== zhDef) ? `${zhWord}（${zhDef}）` : (zhWord || zhDef || word);
    const zhExt = await cloudTranslate(extEn);

    newCard = {
      word, ipa, pos, zh: finalZh,
      videoSentence: sentence.text,
      videoSentenceZh: sentence.zh || await cloudTranslate(sentence.text),
      timestamp: sentence.start,
      timeStr: sentence.timeStr,
      extSentenceEn: extEn,
      extSentenceZh: zhExt,
      synonyms: synonyms.length ? synonyms : ["core vocabulary"],
      antonyms: [],
      starred: false
    };
  }

  cards.unshift(newCard);
  saveCards();
  renderSubtitles();
  renderQuickPreview(newCard);
  showToast(`✅ 已將「${word}」收入右上角單字庫！`);
}

function renderQuickPreview(c) {
  const box = document.getElementById('quickPreview');
  box.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="word-title">${c.word}</span>
        <span style="color:var(--muted); font-size:0.88rem;">${c.ipa}</span>
        <button class="btn btn-sm btn-outline" onclick="speak('${c.word}')">🔊</button>
        <span class="pos-tag">${c.pos}</span>
        <span class="zh-meaning" style="margin-left:4px;">${c.zh}</span>
      </div>
      <div style="font-size:0.88rem; color:var(--muted);">
        🎬 原句：${c.videoSentence} ${c.videoSentenceZh ? `（${c.videoSentenceZh}）` : ''}
      </div>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-left:16px; flex-shrink:0;">
      <button class="btn btn-outline btn-sm" onclick="toggleDrawer(true)">🗂️ 打開單字庫 (${cards.length})</button>
    </div>
  `;
}

function seekVideo(sec) {
  if (player && player.seekTo) {
    player.seekTo(sec, true);
    player.playVideo();
  }
}

function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  speechSynthesis.speak(u);
}

function toggleStar(word) {
  const c = cards.find(item => item.word === word);
  if (c) c.starred = !c.starred;
  saveCards();
  renderSubtitles();
  renderWorkspace();
}

function deleteCard(word) {
  cards = cards.filter(item => item.word !== word);
  saveCards();
  renderSubtitles();
  renderWorkspace();
}

function clearAllCards() {
  if (!cards.length) return;
  if (confirm('確定要清空所有單字卡嗎？')) {
    cards = [];
    saveCards();
    renderSubtitles();
    renderWorkspace();
  }
}

function toggleStarFilter() {
  starOnly = !starOnly;
  quizIndex = 0;
  renderWorkspace();
}

function switchMode(mode, btn) {
  currentMode = mode;
  quizIndex = 0;
  flipped = false;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderWorkspace();
}

function saveCards() {
  localStorage.setItem('tubevocab_cards', JSON.stringify(cards));
  const starCount = cards.filter(c => c.starred).length;
  document.getElementById('navCardCount').textContent = cards.length;
  document.getElementById('starFilterBtn').textContent = `${starOnly ? '★ 顯示全部' : '★ 只看星號'} (${starCount})`;
  document.getElementById('deckStats').textContent = `共 ${cards.length} 張單字卡`;
}

function renderWorkspace() {
  saveCards();
  const ws = document.getElementById('workspace');
  const list = starOnly ? cards.filter(c => c.starred) : cards;

  if (!list.length) {
    ws.innerHTML = `
      <div class="status-msg">
        <div style="font-size:2.2rem; margin-bottom:8px;">🗂️</div>
        <strong>單字卡庫目前是空的</strong><br>
        請關閉此抽屜，直接點擊畫面右側雙語字幕中不懂的單字，<br>系統就會自動幫你建立單字卡並收納到這裡！
      </div>`;
    return;
  }

  if (currentMode === 'list') {
    ws.innerHTML = `<div class="cards-grid">` + list.map(c => `
      <div class="vocab-card">
        <div class="card-top">
          <div>
            <span class="word-title">${c.word}</span>
            <span style="color:var(--muted); font-size:0.85rem; margin-left:6px;">${c.ipa}</span>
            <button class="btn btn-sm" style="padding:2px 6px;" onclick="speak('${c.word}')">🔊</button>
            <span class="pos-tag">${c.pos}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="icon-btn ${c.starred ? 'active' : ''}" onclick="toggleStar('${c.word}')">★</button>
            <button class="icon-btn" style="font-size:1rem;" onclick="deleteCard('${c.word}')">✕</button>
          </div>
        </div>
        <div class="zh-meaning">${c.zh}</div>
        <div class="sentence-box">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <strong>🎬 影片原句</strong>
            <span class="sub-time" onclick="toggleDrawer(false); seekVideo(${c.timestamp})">▶ ${c.timeStr}</span>
          </div>
          <div>${c.videoSentence}</div>
          ${c.videoSentenceZh ? `<div style="color:var(--muted); margin-top:4px; font-size:0.84rem;">${c.videoSentenceZh}</div>` : ''}
        </div>
        <div style="font-size:0.85rem; color:var(--muted);">
          <strong>💡 延伸例句：</strong>${c.extSentenceEn}<br>${c.extSentenceZh}
        </div>
        <div class="tags-row">
          ${(c.synonyms || []).map(s => `<span class="syn-tag">≈ ${s}</span>`).join('')}
        </div>
      </div>
    `).join('') + `</div>`;
  } else if (currentMode === 'flashcard') {
    const c = list[quizIndex % list.length];
    ws.innerHTML = `
      <div class="quiz-box">
        <div style="color:var(--muted); font-size:0.9rem;">第 ${(quizIndex % list.length) + 1} / ${list.length} 張（點擊卡片翻面）</div>
        <div class="flashcard" onclick="flipped=!flipped; renderWorkspace()">
          ${!flipped ? `
            <div class="word-title" style="font-size:2rem;">${c.word} <span class="pos-tag">${c.pos}</span></div>
            <p style="margin-top:12px; color:var(--muted);">${c.ipa}</p>
          ` : `
            <div class="zh-meaning" style="font-size:1.4rem; color:var(--primary);">${c.zh}</div>
            <p style="margin-top:12px;">${c.videoSentence}</p>
            <p style="margin-top:4px; font-size:0.9rem; color:var(--muted);">${c.videoSentenceZh || ''}</p>
          `}
        </div>
        <div style="display:flex; justify-content:center; gap:10px;">
          <button class="btn btn-outline" onclick="speak('${c.word}')">🔊 發音</button>
          <button class="btn btn-outline" onclick="toggleStar('${c.word}')">${c.starred ? '★ 已加星號' : '☆ 加星號'}</button>
          <button class="btn btn-primary" onclick="flipped=false; quizIndex++; renderWorkspace()">下一張 ➔</button>
        </div>
      </div>
    `;
  } else if (currentMode === 'cloze') {
    const c = list[quizIndex % list.length];
    const regex = new RegExp(`\\b${c.word}\\b`, 'gi');
    const masked = c.videoSentence.replace(regex, '_______');
    ws.innerHTML = `
      <div class="quiz-box">
        <div style="color:var(--muted); font-size:0.9rem;">影片原句克漏字（提示：${c.zh}）</div>
        <p style="font-size:1.15rem; margin:16px 0 8px; line-height:1.6;">"${masked}"</p>
        <p style="font-size:0.9rem; color:var(--muted); margin-bottom:16px;">${c.videoSentenceZh || ''}</p>
        <input type="text" id="clozeAns" placeholder="輸入缺少的英文單字..." style="padding:10px; border-radius:8px; border:1px solid var(--border); width:70%; text-align:center; font-size:1rem; background:var(--surface); color:var(--text);" />
        <div style="margin-top:16px; display:flex; justify-content:center; gap:10px;">
          <button class="btn btn-outline" onclick="toggleDrawer(false); seekVideo(${c.timestamp})">▶ 聽影片原音</button>
          <button class="btn btn-primary" onclick="checkCloze('${c.word}')">送出答案</button>
          <button class="btn btn-outline" onclick="quizIndex++; renderWorkspace()">下一題 ➔</button>
        </div>
      </div>
    `;
  }
}

function checkCloze(answer) {
  const val = document.getElementById('clozeAns').value.trim().toLowerCase();
  if (val === answer.toLowerCase()) {
    alert('🎉 答對了！');
    quizIndex++;
    renderWorkspace();
  } else {
    alert(`❌ 差一點點！正確答案是：${answer}`);
  }
}

function toggleTheme() {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
}