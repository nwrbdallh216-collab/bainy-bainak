const http = require("http");
const fs = require("fs");
const path = require("path");

// =====================================
// إعدادات السيرفر والتخزين
// =====================================

const PORT = process.env.PORT || 3000;

// يحاول استخدام قرص Render الدائم.
// إذا لم يكن موجوداً، يستخدم مجلداً محلياً مؤقتاً.
let DATA_DIR = "/var/data";

try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    fs.accessSync(DATA_DIR, fs.constants.W_OK);

} catch (error) {

    DATA_DIR = path.join(__dirname, "data");

    fs.mkdirSync(DATA_DIR, { recursive: true });

    console.log("Using temporary local storage.");

}

const DATA_FILE = path.join(DATA_DIR, "messages.json");

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

// =====================================
// قراءة الرسائل
// =====================================

function readMessages() {

    try {

        return JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

    } catch (error) {

        console.error("Read error:", error);

        return [];

    }

}

// =====================================
// تسلسل عمليات الحفظ
// =====================================

let writeQueue = Promise.resolve();

function saveNewMessage(message) {

    const operation = writeQueue.then(async () => {

        const messages = readMessages();

        messages.push(message);

        if (messages.length > 5000) {
            messages.splice(0, messages.length - 5000);
        }

        const tempFile = DATA_FILE + ".tmp";

        await fs.promises.writeFile(
            tempFile,
            JSON.stringify(messages),
            "utf8"
        );

        await fs.promises.rename(
            tempFile,
            DATA_FILE
        );

    });

    writeQueue = operation.catch(error => {
        console.error("Save error:", error);
    });

    return operation;

}

// =====================================
// حماية من كثرة الرسائل
// =====================================

const rateLimits = new Map();

function canSend(ip) {

    const now = Date.now();

    const record = rateLimits.get(ip);

    if (!record || now - record.start >= 60000) {

        rateLimits.set(ip, {
            start: now,
            count: 1
        });

        return true;

    }

    if (record.count >= 15) {
        return false;
    }

    record.count++;

    return true;

}

// تنظيف سجلات تحديد المعدل دورياً
setInterval(() => {

    const now = Date.now();

    for (const [ip, record] of rateLimits) {

        if (now - record.start > 120000) {
            rateLimits.delete(ip);
        }

    }

}, 60000);

// =====================================
// قراءة بيانات الطلب
// =====================================

function readBody(req) {

    return new Promise((resolve, reject) => {

        let body = "";
        let rejected = false;

        req.on("data", chunk => {

            if (rejected) return;

            body += chunk;

            if (Buffer.byteLength(body) > 12000) {

                rejected = true;

                reject(new Error("Request too large"));

                req.destroy();

            }

        });

        req.on("end", () => {

            if (rejected) return;

            try {

                resolve(JSON.parse(body));

            } catch {

                reject(new Error("Invalid JSON"));

            }

        });

        req.on("error", reject);

    });

}

// =====================================
// واجهة الموقع HTML + CSS + JS
// =====================================

const HTML = String.raw`<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<meta name="theme-color" content="#075e54">

<title>بيني وبينك - محادثة عامة</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: Tahoma, Arial, sans-serif;
    background: #e9edef;
    height: 100dvh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.chat-container {
    width: 100%;
    max-width: 550px;
    height: 100dvh;
    background: #efeae2;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.chat-header {
    background: #075e54;
    color: white;
    padding: 18px;
    text-align: center;
}

.chat-header h2 {
    margin: 0 0 8px;
}

.online-status {
    font-size: 12px;
    opacity: .9;
}

.username-area {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: white;
    border-bottom: 1px solid #eee;
}

input {
    font-family: inherit;
    outline: none;
}

.username-area input {
    flex: 1;
    min-width: 0;
    border: 1px solid #ddd;
    border-radius: 25px;
    padding: 12px;
}

button {
    border: none;
    background: #00a884;
    color: white;
    padding: 11px 18px;
    border-radius: 25px;
    cursor: pointer;
    font-weight: bold;
    font-family: inherit;
}

button:disabled {
    opacity: .5;
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.message {
    background: white;
    padding: 11px 14px;
    border-radius: 12px;
    max-width: 85%;
    align-self: flex-start;
    box-shadow: 0 1px 2px #0001;
    overflow-wrap: anywhere;
}

.message.mine {
    background: #d9fdd3;
    align-self: flex-end;
}

.sender {
    color: #008f6f;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 6px;
}

.message-text {
    font-size: 14px;
    line-height: 1.7;
    white-space: pre-wrap;
}

.time {
    font-size: 10px;
    color: #888;
    text-align: left;
    margin-top: 6px;
}

.chat-input-area {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: white;
    border-top: 1px solid #ddd;
}

.chat-input-area input {
    flex: 1;
    min-width: 0;
    border: none;
    background: #f0f2f5;
    border-radius: 25px;
    padding: 14px;
}

.chat-input-area button {
    min-width: 75px;
}

.empty {
    text-align: center;
    color: #888;
    margin: auto;
    font-size: 14px;
}

@media (min-width: 600px) {

    .chat-container {
        height: 95vh;
        max-height: 900px;
        border-radius: 12px;
        box-shadow: 0 4px 20px #0002;
    }

}

</style>

</head>

<body>

<div class="chat-container">

    <div class="chat-header">

        <h2>💬 بيني وبينك</h2>

        <div class="online-status" id="status">
            🌐 محادثة عامة للجميع
        </div>

    </div>

    <div class="username-area">

        <input
            type="text"
            id="username"
            placeholder="اكتب اسمك..."
            maxlength="25"
        >

        <button onclick="saveName()">
            حفظ الاسم
        </button>

    </div>

    <div class="chat-messages" id="messagesBox">

        <div class="empty" id="empty">
            مرحباً بك في بيني وبينك 💚
        </div>

    </div>

    <div class="chat-input-area">

        <input
            type="text"
            id="msgInput"
            placeholder="اكتب رسالتك..."
            maxlength="1000"
        >

        <button
            id="sendButton"
            onclick="sendMsg()">

            إرسال

        </button>

    </div>

</div>

<script>

const box = document.getElementById("messagesBox");

const input = document.getElementById("msgInput");

const usernameInput =
    document.getElementById("username");

const sendButton =
    document.getElementById("sendButton");

const statusBox =
    document.getElementById("status");

let lastId = 0;

let loading = false;

let messageIds = new Set();

usernameInput.value =
    localStorage.getItem("chat_username") || "";

// =====================================
// حفظ الاسم
// =====================================

window.saveName = function() {

    const name = usernameInput.value.trim();

    if (!name) {

        alert("اكتب اسمك أولاً");

        return;

    }

    localStorage.setItem("chat_username", name);

    alert("تم حفظ اسمك بنجاح 💚");

};

function getUsername() {

    return localStorage.getItem("chat_username") || "";

}

// =====================================
// عرض الرسائل
// =====================================

function displayMessage(data) {

    if (messageIds.has(data.id)) return;

    messageIds.add(data.id);

    const empty = document.getElementById("empty");

    if (empty) {
        empty.remove();
    }

    const message = document.createElement("div");

    const sender = document.createElement("div");

    const content = document.createElement("div");

    const time = document.createElement("div");

    message.className = "message";

    if (data.username === getUsername()) {
        message.classList.add("mine");
    }

    sender.className = "sender";

    sender.textContent = data.username;

    content.className = "message-text";

    content.textContent = data.text;

    time.className = "time";

    time.textContent = new Date(data.time)
        .toLocaleTimeString("ar", {
            hour: "2-digit",
            minute: "2-digit"
        });

    message.appendChild(sender);

    message.appendChild(content);

    message.appendChild(time);

    box.appendChild(message);

}

// =====================================
// تحميل الرسائل
// =====================================

async function loadMessages() {

    if (loading) return;

    loading = true;

    try {

        const response = await fetch(
            "/api/messages?after=" + lastId,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error("Server error");
        }

        const messages = await response.json();

        const shouldScroll =
            box.scrollHeight - box.scrollTop
            <= box.clientHeight + 120;

        messages.forEach(data => {

            displayMessage(data);

            if (data.id > lastId) {
                lastId = data.id;
            }

        });

        if (shouldScroll) {
            box.scrollTop = box.scrollHeight;
        }

        statusBox.textContent =
            "🟢 متصل بالمحادثة العامة";

    } catch (error) {

        statusBox.textContent =
            "🔴 جاري إعادة الاتصال...";

    } finally {

        loading = false;

    }

}

// =====================================
// إرسال الرسائل
// =====================================

window.sendMsg = async function() {

    const text = input.value.trim();

    const username = getUsername();

    if (!username) {

        alert("احفظ اسمك أولاً");

        usernameInput.focus();

        return;

    }

    if (!text) return;

    sendButton.disabled = true;

    try {

        const response = await fetch(
            "/api/messages",
            {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username,
                    text
                })

            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.error || "فشل الإرسال"
            );

        }

        input.value = "";

        await loadMessages();

    } catch (error) {

        alert(error.message || "تعذر إرسال الرسالة");

    } finally {

        sendButton.disabled = false;

        input.focus();

    }

};

// =====================================
// الإرسال بزر Enter
// =====================================

input.addEventListener("keydown", function(e) {

    if (e.key === "Enter") {
        window.sendMsg();
    }

});

// =====================================
// تشغيل المحادثة
// =====================================

loadMessages();

setInterval(loadMessages, 2000);

</script>

</body>

</html>`;

// =====================================
// إرسال JSON
// =====================================

function json(res, status, data) {

    res.writeHead(status, {

        "Content-Type":
            "application/json; charset=utf-8",

        "Cache-Control":
            "no-store"

    });

    res.end(JSON.stringify(data));

}

// =====================================
// إنشاء السيرفر
// =====================================

const server = http.createServer(async (req, res) => {

    const url = new URL(
        req.url,
        "http://localhost"
    );

    // الصفحة الرئيسية
    if (
        req.method === "GET" &&
        url.pathname === "/"
    ) {

        res.writeHead(200, {

            "Content-Type":
                "text/html; charset=utf-8",

            "Cache-Control":
                "no-store",

            "X-Content-Type-Options":
                "nosniff"

        });

        return res.end(HTML);

    }

    // فحص السيرفر
    if (
        req.method === "GET" &&
        url.pathname === "/health"
    ) {

        return json(res, 200, {
            status: "ok"
        });

    }

    // جلب الرسائل
    if (
        req.method === "GET" &&
        url.pathname === "/api/messages"
    ) {

        await writeQueue;

        const after = Math.max(
            0,
            Number(url.searchParams.get("after")) || 0
        );

        const messages = readMessages();

        return json(
            res,
            200,
            messages.filter(m => m.id > after)
                .slice(-200)
        );

    }

    // إرسال رسالة
    if (
        req.method === "POST" &&
        url.pathname === "/api/messages"
    ) {

        const ip = (

            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "unknown"

        ).split(",")[0].trim();

        if (!canSend(ip)) {

            return json(res, 429, {

                error:
                    "أرسلت رسائل كثيرة. انتظر قليلاً."

            });

        }

        try {

            const body = await readBody(req);

            const username = String(
                body.username || ""
            ).trim().slice(0, 25);

            const text = String(
                body.text || ""
            ).trim().slice(0, 1000);

            if (!username || !text) {

                return json(res, 400, {

                    error:
                        "الاسم والرسالة مطلوبان"

                });

            }

            const message = {

                id: Date.now(),

                username,

                text,

                time: new Date().toISOString()

            };

            await saveNewMessage(message);

            return json(res, 201, {

                success: true,

                message

            });

        } catch (error) {

            console.error("Message error:", error);

            if (!res.destroyed) {

                return json(res, 500, {

                    error:
                        "تعذر حفظ الرسالة"

                });

            }

        }

    }

    return json(res, 404, {

        error: "Not Found"

    });

});

// =====================================
// تشغيل السيرفر
// =====================================

server.listen(PORT, "0.0.0.0", () => {

    console.log("==============================");

    console.log("💬 Bainy Ainak Chat Started");

    console.log("Port:", PORT);

    console.log("Storage:", DATA_FILE);

    console.log("==============================");

});
