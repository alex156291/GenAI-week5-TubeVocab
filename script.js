let player;
let subtitles = [];
let cards = JSON.parse(localStorage.getItem('tubevocab_cards') || '[]');
let starOnly = false;
let currentMode = 'list';
let quizIndex = 0;
let flipped = false;
let lastActiveIdx = -1;
let translatingChunks = new Set();

const DEMO_SUBTITLES = [
  { start: 12.8, timeStr: "00:12", text: "A few years ago, I felt like I was stuck in a rut,", zh: "幾年前, 我覺得自己彷彿陷入了一成不變的生活泥淖," },
  { start: 16.5, timeStr: "00:16", text: "so I decided to follow in the footsteps of the great American philosopher, Morgan Spurlock,", zh: "所以我決定追隨偉大的美國哲學家摩根·史柏路克的腳步," },
  { start: 22.1, timeStr: "00:22", text: "and try something new for 30 days.", zh: "連續 30 天嘗試一件新事物。" },
  { start: 25.0, timeStr: "00:25", text: "The idea is actually pretty simple.", zh: "這個概念其實非常簡單。" },
  { start: 27.6, timeStr: "00:27", text: "Think about something you've always wanted to add to your life", zh: "想想一件你一直很想加入自己生活中的事情," },
  { start: 30.8, timeStr: "00:30", text: "and try it for the next 30 days.", zh: "並在接下來的 30 天裡去嘗試它。" }
];

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

// 純前端直接抓取 YouTube 影片字幕（透過代理繞過跨域限制）
async function fetchYouTubeSubtitlesDirect(videoId) {
  if (videoId === 'UNP03fDSj1U') return DEMO_SUBTITLES;

  // 使用多個公開無伺服器代理端點取得 CC 字幕
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent('https://www.youtube.com/api/timedtext?v=' + videoId + '&lang=en')}`,
    `https://corsproxy.io/?` + encodeURIComponent(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`)
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) continue;
      let xmlText = "";
      if (proxyUrl.includes('allorigins.win')) {
        const json = await res.json();
        xmlText = json.contents;
      } else {
        xmlText = await res.text();
      }

      if (xmlText && xmlText.includes('<transcript>')) {
        const parsed = parseXmlToSubtitles(xmlText);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
  }
  return null;
}

// 解析 YouTube XML 字幕格式
function parseXmlToSubtitles(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const textNodes = doc.getElementsByTagName('text');
  const result = [];

  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    const startSec = parseFloat(node.getAttribute('start') || '0');
    let rawText = node.textContent || '';
    // 清理 HTML 標籤與特殊字元
    const cleanText = decodeHtmlEntities(rawText).replace(/<[^>]+>/g, '').replace(/\n/g, ' ').trim();
    if (cleanText) {
      result.push({
        start: Math.round(startSec * 10) / 10,
        timeStr: formatTime(startSec),
        text: cleanText,
        zh: ""
      });
    }
  }
  return result;
}

function decodeHtmlEntities(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

async function analyzeVideo() {
  const url = document.getElementById('ytUrl').value.trim();
  const videoId = extractVideoId(url);
  if (!videoId) {
    return alert('請輸入有效的 YouTube 影片網址！');
  }

  if (player && player.loadVideoById) {
    player.loadVideoById(videoId);
  }

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 抓取 CC 字幕中...';
  document.getElementById('subtitleList').innerHTML = '<div class="status-msg">正在透過雲端代理讀取該影片的英文 CC 字幕，請稍候...</div>';

  try {
    // 優先嘗試純前端直接抓取
    const directSubs = await fetchYouTubeSubtitlesDirect(videoId);
    if (directSubs && directSubs.length > 0) {
      subtitles = directSubs;
      lastActiveIdx = -1;
      translatingChunks.clear();
      renderSubtitles();
      ensureChunkTranslated(0);
      showToast('✅ 成功載入該影片的同步雙語 CC 字幕！');
      return;
    }
    throw new Error('無法直接抓取');
  } catch (err) {
    // 若無字幕，顯示貼心提示與手動輸入框
    document.getElementById('subtitleList').innerHTML = `
      <div class="status-msg">
        <p style="color:var(--accent); font-weight:700; margin-bottom:8px;">⚠️ 此影片未開放公開英文字幕或受版權保護。</p>
        <p style="font-size:0.88rem; margin-bottom:14px;">
          💡 <strong>快速練習方法：</strong>請在下方直接貼上該段英文對話或字幕句子（每行一句），即可立刻轉為雙語互動單字練習：
        </p>
        <textarea id="manualSubInput" rows="5" placeholder="在此貼上英文句子或對話..." style="width:90%; padding:10px; border-radius:8px; background:var(--bg); color:var(--text); border:1px solid var(--border);"></textarea>
        <br>
        <button class="btn btn-primary" style="margin-top:10px;" onclick="loadManualSubtitles()">✨ 立即產生雙語互動字幕</button>
      </div>
    `;
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
  } catch (e) {}
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
    showToast(`💡「${word}」已在單字庫中！`);
    return;
  }

  showToast(`⏳ 正在查詢「${word}」...`);
  const sentence = subtitles[subIdx];
  let ipa = `/${word}/`, pos = "n.", enDef = "", extEn = `Practicing "${word}" helps build vocabulary.`, synonyms = [];

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

  const newCard = {
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

  cards.unshift(newCard);
  saveCards();
  renderSubtitles();
  renderQuickPreview(newCard);
  showToast(`✅ 已將「${word}」收入單字庫！`);
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
        請點擊畫面右側雙語字幕中不懂的單字，即可自動建立單字卡！
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