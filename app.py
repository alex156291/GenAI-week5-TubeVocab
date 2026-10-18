import re
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
import requests

app = Flask(__name__, static_folder='.', static_url_path='')

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

def extract_video_id(url):
    pattern = r"(?:v=|\/embed\/|\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{11})"
    match = re.search(pattern, url)
    return match.group(1) if match else url.strip()

def format_time(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"

def translate_to_zh(text):
    """使用 Google GTX 高速翻譯繁體中文，失敗時自動切換 MyMemory 備援"""
    if not text or not text.strip():
        return ""
    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = {
            "client": "gtx",
            "sl": "en",
            "tl": "zh-TW",
            "dt": "t",
            "q": text
        }
        res = requests.get(url, params=params, headers=HEADERS, timeout=6)
        if res.status_code == 200:
            data = res.json()
            result = "".join([item[0] for item in data[0] if item[0]])
            if result:
                return result.strip()
    except Exception as e:
        print(f"[Google 翻譯切換備援] {e}")

    try:
        url2 = "https://api.mymemory.translated.net/get"
        res2 = requests.get(url2, params={"q": text, "langpair": "en|zh-TW"}, headers=HEADERS, timeout=5)
        if res2.status_code == 200:
            return res2.json().get("responseData", {}).get("translatedText", "").strip()
    except Exception:
        pass
    return ""

def fetch_bilingual_transcript(video_id):
    """擷取英文 CC 字幕，並嘗試自動取得或轉譯繁體中文字幕軌道"""
    en_raw = []
    zh_raw = []

    try:
        # 相容 youtube-transcript-api 1.2.4 新版語法
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)
        en_trans = transcript_list.find_transcript(['en', 'en-US', 'en-GB'])
        en_raw = en_trans.fetch().to_raw_data()

        # 優先尋找官方繁體中文字幕，若無則嘗試使用 YT 內建自動翻譯軌道
        try:
            zh_trans = transcript_list.find_transcript(['zh-TW', 'zh-Hant', 'zh-HK'])
            zh_raw = zh_trans.fetch().to_raw_data()
        except Exception:
            if en_trans.is_translatable:
                zh_raw = en_trans.translate('zh-TW').fetch().to_raw_data()
    except Exception:
        # 退回基本抓取模式
        try:
            ytt_api = YouTubeTranscriptApi()
            en_raw = ytt_api.fetch(video_id, languages=['en', 'en-US', 'en-GB']).to_raw_data()
        except AttributeError:
            en_raw = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'en-US', 'en-GB'])

    # 建立中文字幕時間軸索引（若 YT 有提供）
    zh_map = {}
    for item in zh_raw:
        zh_map[round(item['start'], 1)] = item['text'].replace('\n', ' ').strip()

    subtitles = []
    for item in en_raw:
        clean_en = item['text'].replace('\n', ' ').strip()
        if clean_en:
            start_sec = round(item['start'], 1)
            subtitles.append({
                "start": start_sec,
                "timeStr": format_time(item['start']),
                "text": clean_en,
                "zh": zh_map.get(start_sec, "")  # 若為空，前端播放時會自動批次翻譯補齊
            })
    return subtitles

def fetch_word_details(word, sentence):
    """當使用者點擊字幕生字時，即時查詢字典與翻譯"""
    ipa = ""
    pos = "n."
    en_definition = ""
    ext_en = f"Learning the word '{word}' in context helps improve your vocabulary."
    synonyms = []
    antonyms = []

    try:
        res = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}", headers=HEADERS, timeout=4)
        if res.status_code == 200:
            data = res.json()[0]
            ipa = data.get("phonetic", "")
            if not ipa and data.get("phonetics"):
                for p in data["phonetics"]:
                    if p.get("text"):
                        ipa = p["text"]
                        break

            meanings = data.get("meanings", [])
            if meanings:
                first_m = meanings[0]
                pos_raw = first_m.get("partOfSpeech", "noun")
                pos_map = {"noun": "n.", "verb": "v.", "adjective": "adj.", "adverb": "adv."}
                pos = pos_map.get(pos_raw, pos_raw)

                defs = first_m.get("definitions", [])
                if defs:
                    en_definition = defs[0].get("definition", "")

                for m in meanings:
                    synonyms.extend(m.get("synonyms", []))
                    antonyms.extend(m.get("antonyms", []))
                    for d in m.get("definitions", []):
                        if d.get("example") and ext_en.startswith("Learning"):
                            ext_en = d["example"]
                        synonyms.extend(d.get("synonyms", []))
                        antonyms.extend(d.get("antonyms", []))
    except Exception:
        pass

    zh_word = translate_to_zh(word)
    zh_def = translate_to_zh(en_definition) if en_definition else ""

    if zh_word and zh_def and zh_word != zh_def:
        final_zh = f"{zh_word}（{zh_def}）"
    elif zh_def:
        final_zh = zh_def
    elif zh_word:
        final_zh = zh_word
    else:
        final_zh = en_definition or "查無釋義"

    video_sent_en = sentence.get("text", "")
    video_sent_zh = sentence.get("zh", "") or translate_to_zh(video_sent_en)
    zh_ext = translate_to_zh(ext_en)

    print(f"✨ 點擊新增單字卡: {word} -> {final_zh}")

    return {
        "word": word,
        "ipa": ipa or f"/{word}/",
        "pos": pos,
        "zh": final_zh,
        "videoSentence": video_sent_en,
        "videoSentenceZh": video_sent_zh,
        "timestamp": sentence.get("start", 0),
        "timeStr": format_time(sentence.get("start", 0)),
        "extSentenceEn": ext_en,
        "extSentenceZh": zh_ext or "（見上方英文例句）",
        "synonyms": list(dict.fromkeys(synonyms))[:4] or ["related term"],
        "antonyms": list(dict.fromkeys(antonyms))[:3],
        "starred": False
    }

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    """只載入影片與雙語 CC 字幕，不預先塞入單字卡"""
    data = request.json
    url = data.get("url", "")
    video_id = extract_video_id(url)

    try:
        subtitles = fetch_bilingual_transcript(video_id)
    except Exception as e:
        return jsonify({"error": f"無法取得此影片的英文 CC 字幕：{str(e)}"}), 400

    return jsonify({
        "videoId": video_id,
        "subtitles": subtitles
    })

@app.route('/api/translate_batch', methods=['POST'])
def translate_batch():
    """批次將一段英文字幕一次翻譯為繁體中文（用換行符號合併，1秒完成25句）"""
    data = request.json
    texts = data.get("texts", [])
    if not texts:
        return jsonify({"translations": []})

    cleaned = [re.sub(r"^>>\s*", "", t) for t in texts]
    joined_text = "\n".join(cleaned)
    translated_block = translate_to_zh(joined_text)
    translations = [line.strip() for line in translated_block.split("\n")]

    # 確保回傳長度一致
    while len(translations) < len(texts):
        translations.append("")
    return jsonify({"translations": translations[:len(texts)]})

@app.route('/api/lookup', methods=['POST'])
def lookup_single_word():
    """使用者點擊字幕單字時即時建立單字卡"""
    data = request.json
    word = data.get("word", "").lower().strip()
    sentence = data.get("sentence", {"text": "", "zh": "", "start": 0})
    card = fetch_word_details(word, sentence)
    return jsonify(card)

if __name__ == '__main__':
    print("🚀 TubeVocab (雙語自動捲動字幕 ＋ 點擊選字建卡版) 已啟動！請前往 http://127.0.0.1:5000")
    app.run(port=5000, debug=True)