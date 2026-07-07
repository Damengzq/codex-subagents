# -*- coding: utf-8 -*-
"""飞书灵感笔记网关 v3 - LLM意图识别 + 智能路由 + 飞书回复"""
import json, os, yaml, re, traceback, time
from datetime import datetime
from flask import Flask, request, jsonify
from openai import OpenAI

APP_ID = "cli_a933ac86c47ddbc0"
APP_SECRET = os.environ.get("FEISHU_APP_SECRET", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
CONFIG_PATH = r"D:\zz\codex\.codex\config.yaml"

app = Flask(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)
_feishu_token = {"token": "", "expires_at": 0}
_processed_ids = set()  # 消息去重

# ── 飞书 API ──
def get_feishu_token():
    if _feishu_token["token"] and time.time() < _feishu_token["expires_at"] - 60:
        return _feishu_token["token"]
    try:
        import requests
        r = requests.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": APP_ID, "app_secret": APP_SECRET}, timeout=10)
        d = r.json()
        _feishu_token["token"] = d.get("tenant_access_token", "")
        _feishu_token["expires_at"] = time.time() + d.get("expire", 7200)
        print(f"[FEISHU] token ok, expire={d.get('expire')}s")
        return _feishu_token["token"]
    except Exception as e:
        print(f"[FEISHU_TOKEN] {e}")
        return ""

def reply_feishu(message_id, text):
    token = get_feishu_token()
    if not token or not message_id:
        return
    try:
        import requests
        r = requests.post(
            f"https://open.feishu.cn/open-apis/im/v1/messages/{message_id}/reply",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"msg_type": "text", "content": json.dumps({"text": text})}, timeout=10)
        print(f"[REPLY] status={r.status_code} body={r.text[:300]}")
    except Exception as e:
        print(f"[REPLY] {e}")

# ── 配置与路径 ──
def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

CAT_PATH_MAP = {
    "inspiration": "vault_inbox", "todo": "vault_tasks",
    "note": "vault_notes", "hardware": "vault_hardware"
}

def get_path(cat):
    c = load_config()
    key = CAT_PATH_MAP.get(cat, "vault_inbox")
    return c["paths"][key]

# ── 第一层：关键词快速分类 ──
def classify_keyword(text):
    t = text.strip()
    if re.match(r'^(灵感|想法|点子|创意)[：:]\s*', t): return ("inspiration", 0.95)
    if re.match(r'^(TODO|待办|别忘了|要做|提醒)[：:]\s*', t): return ("todo", 0.95)
    if re.match(r'^(笔记|记录|备注)[：:]\s*', t): return ("note", 0.95)
    if re.match(r'^(硬件|电路)[：:]\s*', t): return ("hardware", 0.95)
    if re.match(r'^(查|搜|找|今天|最近|有什么|帮我查|帮我找)', t): return ("query", 0.85)
    if re.match(r'^(你好|hi|hello|你是谁|你是|介绍|谢谢|再见|早|晚安|在吗)[!！。.\s]*$', t, re.I): return ("chat", 0.90)
    # 宽松匹配：包含问候关键词
    if any(k in t for k in ["你好","hi","hello","helo","在吗","干嘛","怎么样"]): return ("chat", 0.80)
    if any(k in t for k in ["灵感","想法","点子","创意","想到","忽然","突然"]): return ("inspiration", 0.75)
    if any(k in t for k in ["TODO","待办","别忘了","要做","记得","提醒","安排"]): return ("todo", 0.75)
    if any(k in t for k in ["硬件","电路","PCB","芯片","电源","散热","信号","阻抗","MXM","GPU","TY1200","JW","MOS","DCDC"]): return ("hardware", 0.75)
    if re.search(r'[有没]什么|怎么|如何|在哪|查一下|告诉我|今天|最近', t): return ("query", 0.70)
    if len(t) >= 80:
        return ("note", 0.60)
    return (None, 0)

# ── 第二层：LLM 意图识别 ──
INTENT_PROMPT = u"""你是飞书笔记助手的意图分类器。分析用户消息，输出JSON。

分类：
- "inspiration": 灵感、想法、随想（短句）
- "todo": 待办、提醒、要做的事
- "note": 长笔记、知识点
- "hardware": 硬件相关（电路、芯片、电源、散热等）
- "query": 查询信息（有什么安排、最近记了什么）
- "chat": 闲聊、问候、自我介绍

输出纯JSON：{"intent":"xxx","title":"<=20字","confidence":0.0-1.0}"""

def classify_llm(text):
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": INTENT_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.1, max_tokens=100)
        raw = resp.choices[0].message.content.strip()
        m = re.search(r'\{[^}]+\}', raw)
        if m:
            r = json.loads(m.group())
            return (r.get("intent", "inspiration"), r.get("confidence", 0.6), r.get("title", ""))
    except Exception as e:
        print(f"[LLM] {e}")
    return (None, 0, "")

# ── 两级意图分类 ──
def classify(text):
    cat, conf = classify_keyword(text)
    if conf >= 0.75:
        return cat, text[:20]
    llm_cat, llm_conf, llm_title = classify_llm(text)
    if llm_cat and llm_conf >= 0.5:
        return llm_cat, (llm_title or text[:20])
    return ("inspiration", text[:20])

# ── 写入 Obsidian ──
def clean_prefix(text):
    return re.sub(r'^(灵感|TODO|待办|笔记|硬件|想法|点子|记录|提醒)[：:]\s*', '', text).strip()

def write_note(cat, text):
    base = get_path(cat)
    os.makedirs(base, exist_ok=True)
    now = datetime.now()
    clean = clean_prefix(text)
    safe = clean[:30].replace("/","-").replace("\\","-").replace(":","-").replace("*","").replace("?","").replace('"',"").replace("|","-")
    fname = f"{now:%Y-%m-%d-%H%M}-{safe}.md"
    tags = {"inspiration":"灵感","todo":"待办","note":"笔记","hardware":"硬件"}
    md = f'---\ndate: {now:%Y-%m-%d}\ntags: [{tags[cat]}, 飞书速记]\nsource: feishu-mobile\n---\n\n# {clean[:60]}\n\n{clean}\n'
    fp = os.path.join(base, fname)
    with open(fp, "w", encoding="utf-8") as f:
        f.write(md)
    return fp

# ── Obsidian 搜索 ──
def search_obsidian(query):
    vault = r"D:\zz\Dameng"
    keywords = [kw.lower() for kw in query.split() if len(kw) >= 1]
    if not keywords:
        return []
    results = []
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fn in files:
            if not fn.endswith(".md"):
                continue
            fp = os.path.join(root, fn)
            try:
                with open(fp, "r", encoding="utf-8") as fh:
                    content = fh.read()
                hits = sum(1 for kw in keywords if kw in content.lower())
                if hits > 0:
                    rel = os.path.relpath(fp, vault)
                    mtime = os.path.getmtime(fp)
                    preview = content[:200].replace("\n", " ")
                    results.append((hits, mtime, rel, preview))
            except:
                pass
    results.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return results[:5]

# ── 闲聊回复 ──
CHAT_REPLIES = [
    (["你好"], "你好！我是大猛哥的秘书「灵感笔记Bot」✨\n\n你可以随时给我发消息：\n• 记灵感 → 直接说「灵感：xxx」\n• 加待办 → 说「TODO：xxx」\n• 记笔记 → 说「笔记：xxx」\n• 查东西 → 直接问我\n• 硬件备忘 → 说硬件相关即可\n\n试试看吧~"),
    (["hi","hello"], "Hi! 我是大猛哥的飞书秘书 😄\n有什么需要记录的，尽管告诉我！"),
    (["你是谁","你是"], "我是大猛哥专属的「灵感笔记Bot」！\n\n我住在飞书里，随时帮你：\n📝 记录灵感和想法 → Obsidian Inbox\n✅ 管理待办事项 → Obsidian Tasks\n📒 保存笔记 → Obsidian Notes\n🔧 硬件备忘 → Obsidian Hardware\n🔍 搜索已有笔记\n\n你只需要跟我说句话，剩下的交给我~"),
    (["晚安"], "晚安！🌙 今天又积累了不少好想法吧~"),
    (["谢谢"], "不客气！有什么需要随时叫我 😊"),
    (["在吗"], "在呢在呢！24小时待命，随时等你记录灵感和待办 💪"),
    (["介绍"], "我是「灵感笔记Bot」，大猛哥的飞书秘书！\n\n✨ 灵感捕捉：直接说想法，秒存 Obsidian\n✅ 待办管理：说「TODO：xxx」自动归档\n📒 笔记整理：长内容自动分类到 Notes\n🔧 硬件备忘：包含硬件关键词自动归类\n🔍 智能查询：帮你搜索已有笔记"),
]

def chat_reply(text):
    t = text.strip().lower()
    if "早" in t and len(t) <= 3:
        return "早上好！☀️ 今天有什么需要记录的？"
    for keywords, reply in CHAT_REPLIES:
        if any(k in t for k in keywords):
            return reply
    return "收到！有什么需要我帮忙的吗？😊\n\n你可以直接说：灵感、TODO、笔记，或者问我问题~"

# ── 飞书事件处理 ──
@app.route("/feishu/event", methods=["POST"])
def event():
    try:
        data = request.json
        if not data:
            return jsonify({})
        if data.get("type") == "url_verification":
            return jsonify({"challenge": data["challenge"]})
        h = data.get("header", {})
        if h.get("event_type") == "im.message.receive_v1":
            ev = data.get("event", {})
            msg = ev.get("message", {})
            message_id = msg.get("message_id", "")
            ct_str = msg.get("content", "{}")
            try:
                ct = json.loads(ct_str)
                text = ct.get("text", "")
            except:
                text = ct_str
            if text:
                # 去重：同一消息不重复处理
                if message_id in _processed_ids:
                    print(f"[DEDUP] skip {message_id}")
                    return jsonify({})
                _processed_ids.add(message_id)
                cat, title = classify(text)
                print(f"[INTENT] {cat:12s} | {text[:120]}")
                if cat in ("inspiration", "todo", "note", "hardware"):
                    fp = write_note(cat, text)
                    cn = {"inspiration":"灵感","todo":"待办","note":"笔记","hardware":"硬件"}[cat]
                    reply_feishu(message_id, f"✅ 已记录{cn}！\n📁 Obsidian → {cn}/")
                    print(f"[WRITE] {fp}")
                elif cat == "query":
                    results = search_obsidian(text)
                    if results:
                        lines = ["🔍 找到以下相关笔记：\n"]
                        for hits, mtime, rel, preview in results:
                            ds = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")
                            lines.append(f"📄 {rel} ({ds})")
                            lines.append(f"   {preview[:100]}...")
                        reply_feishu(message_id, "\n".join(lines[:20]))
                    else:
                        reply_feishu(message_id, "🔍 没找到相关笔记，换个关键词试试？")
                    print(f"[QUERY] {text[:60]}")
                elif cat == "chat":
                    reply = chat_reply(text)
                    reply_feishu(message_id, reply)
                    print(f"[CHAT] replied")
    except Exception as e:
        print(f"[ERROR] {e}")
        traceback.print_exc()
    return jsonify({})

@app.route("/health")
def health():
    return jsonify({"status":"ok","time":str(datetime.now())})

# 定期清理去重缓存（保留最近1000条）
def _cleanup_processed():
    global _processed_ids
    if len(_processed_ids) > 2000:
        _processed_ids = set(list(_processed_ids)[-1000:])

if __name__ == "__main__":
    print("飞书灵感笔记网关 v3 (LLM意图识别)")
    print("  端口: 5678  |  事件: /feishu/event")
    print(f"  OpenAI: {'已配置' if OPENAI_API_KEY else '未配置'}")
    app.run(host="0.0.0.0", port=5678)