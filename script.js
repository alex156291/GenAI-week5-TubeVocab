let player;
let subtitles = [];
let cards = JSON.parse(localStorage.getItem('tubevocab_cards') || '[]');
let starOnly = false;
let currentMode = 'list';
let quizIndex = 0;
let flipped = false;
let lastActiveIdx = -1;
let translatingChunks = new Set();

// GitHub Pages 純靜態環境備援示範雙語字幕
const DEMO_SUBTITLES = [
  { start: 0, timeStr: "00:00", text: "A few years ago, I felt like I was stuck in a rut.", zh: "幾年前，我覺得自己彷彿陷入了一成不變的生活泥淖。" },
  { start: 4.5, timeStr: "00:04", text: "So I decided to follow in the footsteps of the great American philosopher, Morgan Spurlock,", zh: "所以我決定追隨偉大的美國哲學家摩根·史柏路克的腳步，" },
  { start: 10.2, timeStr: "00:10", text: "and try something new for 30 days.", zh: "連續 30 天嘗試一件新事物。" },
  { start: 13.8, timeStr: "00:13", text: "The idea is actually pretty simple.", zh: "這個概念其實非常簡單。" },
  { start: 16.5, timeStr: "00:16", text: "Think about something you've always wanted to add to your life and try it for the next 30 days.", zh: "想想一件你一直想加入生活中的事，並在接下來的 30 天裡嘗試它。" },
  { start: 22.0, timeStr: "00:22", text: "It turns out 30 days is just about the right amount of time to add a new habit.", zh: "事實證明，30 天剛好是養成一個新習慣的恰當時間。" },
  { start: 28.4, timeStr: "00:28", text: "There were a few things I learned while doing these 30-day challenges.", zh: "在進行這些 30 天挑戰時，我學到了幾件事。" },
  { start: 33.1, timeStr: "00:33", text: "The first was, instead of the months flying by, forgotten, the time was much more memorable.", zh: "第一點是，時光不再被遺忘地飛逝，這段時間變得更加令人難忘。" },
  { start: 40.5, timeStr: "00:40", text: "I also noticed that as I started to do more and harder 30-day challenges, my self-confidence grew.", zh: "我也注意到，當我開始挑戰更多、更困難的 30 天任務時，我的自信心成長了。" },
  { start: 48.0, timeStr: "00:48", text: "If you really want something badly enough, you can do anything for 30 days.", zh: "如果你真的非常渴望某件事，任何事你都能堅持做 30 天。" }
];

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2600);
}

// 開關右側單字卡抽屜
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
    playerVars: { rel: 0, modestbranding: 1 }
  });
  // 每 250ms 偵測一次影片時間軸，驅動右側字幕自動往下滾動
  setInterval(syncSubtitles, 250);
  saveCards();
}

async function cloudTranslate(text) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0].map(item => item[0]).join('');
  } catch (e) {
    return "";
  }
}

async function analyzeVideo() {
  const url = document.getElementById('ytUrl').value.trim();
  if (!url) return alert('請輸入 YouTube 網址！');

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 載入字幕中...';
  document.getElementById('subtitleList').innerHTML = '<div class="status-msg">正在擷取影片 CC 字幕並準備中英對照，請稍候...</div>';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('切換至雲端展示模式');
    const data = await res.json();

    player.loadVideoById(data.videoId);
    subtitles = data.subtitles;
    lastActiveIdx = -1;
    translatingChunks.clear();
    renderSubtitles();
    ensureChunkTranslated(0);
  } catch (err) {
    // 若在 GitHub Pages 無後端環境，自動切換內建雙語字幕
    player.loadVideoById('UNP03fDSj1U');
    subtitles = DEMO_SUBTITLES;
    lastActiveIdx = -1;
    renderSubtitles();
    showToast('🌐 已載入雙語字幕（點擊右側字幕任意單字即可建卡！）');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 載入雙語字幕';
  }
}

// 批次翻譯接下來 25 句字幕，確保往下滾動時都有中文翻譯
async function ensureChunkTranslated(startIndex) {
  const chunkSize = 25;
  const chunkId = Math.floor(startIndex / chunkSize);
  if (translatingChunks.has(chunkId)) return;

  const start = chunkId * chunkSize;
  const end = Math.min(start + chunkSize, subtitles.length);
  const slice = subtitles.slice(start, end);
  if (!slice.length || slice.every(s => s.zh && s.zh.trim() !== '')) return;

  translatingChunks.add(chunkId);
  try {
    const res = await fetch('/api/translate_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: slice.map(s => s.text) })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.translations) {
      data.translations.forEach((zhText, i) => {
        const idx = start + i;
        if (subtitles[idx]) {
          subtitles[idx].zh = zhText;
          const zhEl = document.getElementById(`sub-zh-${idx}`);
          if (zhEl) zhEl.textContent = zhText;
        }
      });
    }
  } catch (e) {
    console.error('批次翻譯失敗:', e);
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

// 精準自動往下滾動：使用 getBoundingClientRect 確保當前字幕永遠維持在右側字幕框正中央
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

    // 預先翻譯當前與接下來的字幕區塊
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
    const res = await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence })
    });
    if (!res.ok) throw new Error('切換雲端查字');
    newCard = await res.json();
  } catch (err) {
    let ipa = `/${word}/`, pos = "n.", extEn = `Practicing "${word}" helps build active vocabulary.`, synonyms = [];
    try {
      const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (dictRes.ok) {
        const d = (await dictRes.json())[0];
        ipa = d.phonetic || (d.phonetics && d.phonetics[0]?.text) || ipa;
        const m = d.meanings?.[0];
        if (m) {
          pos = { noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.' }[m.partOfSpeech] || m.partOfSpeech;
          extEn = m.definitions?.[0]?.example || m.definitions?.[0]?.definition || extEn;
          synonyms = (m.synonyms || []).slice(0, 4);
        }
      }
    } catch (e) {}
    const zhWord = await cloudTranslate(word);
    const zhExt = await cloudTranslate(extEn);
    newCard = {
      word, ipa, pos, zh: zhWord || word,
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

// 在影片正下方顯示最新點選的單字卡預覽，不用打斷看影片
function renderQuickPreview(c) {
  const box = document.getElementById('quickPreview');
  box.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; flex:1;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="word-title">${c.word}</span>
        <span style="color:var(--muted); font-size:0.88rem;">${c.ipa}</span>
        <button class="btn btn-sm btn-outline" onclick="speak('${c.word}')">🔊</button>
        <span class="pos-tag">${c.pos}</span>
        <span class="zh-meaning" style="margin-left:6px;">${c.zh}</span>
      </div>
      <div style="font-size:0.88rem; color:var(--muted);">
        🎬 原句：${c.videoSentence} ${c.videoSentenceZh ? `（${c.videoSentenceZh}）` : ''}
      </div>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-left:16px;">
      <button class="btn btn-outline btn-sm" onclick="toggleDrawer(true)">🗂️ 打開單字庫查看全部 (${cards.length})</button>
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