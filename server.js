const http = require("http");
const fs = require("fs");
const path = require("path");

// =====================================
// إعدادات السيرفر والتخزين
// =====================================

const PORT = process.env.PORT || 3000;

const DATA_DIR = "/var/data";
const DATA_FILE = path.join(DATA_DIR, "messages.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]");
}

// =====================================
// إدارة الرسائل
// =====================================

function readMessages() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } catch (error) {
        console.error("Read error:", error);
        return [];
    }
}

let writeQueue = Promise.resolve();

function saveMessages(messages) {
    const operation = writeQueue.then(async () => {
        const tempFile = DATA_FILE + ".tmp";

        await fs.promises.writeFile(
            tempFile,
            JSON.stringify(messages),
            "utf8"
        );

        await fs.promises.rename(tempFile, DATA_FILE);
    });

    writeQueue = operation.catch(error => {
        console.error("Save error:", error);
    });

    return operation;
}

// =====================================
// حماية أولية من كثرة الرسائل
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

// =====================================
// قراءة بيانات الطلب
// =====================================

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk;

            if (body.length > 12000) {
                reject(new Error("Request too large"));
                req.destroy();
            }
        });

        req.on("end", () => {
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
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>بيني وبينك - شات عام</title>

<style>

* {
    box-sizing: border-box;
}

body {
    font-family: Tahoma, sans-serif;
    background: #efeae2;
    margin: 0;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.chat-container {
    width: 100%;
    max-width: 500px;
    height: 100vh;
    max-height: 900px;
    background: #f0f2f5;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.chat-header {
    background: #00a884;
    color: white;
    padding: 16px;
    text-align: center;
}

.chat-header h3 {
    margin: 0 0 5px;
}

.online-status {
    font-size: 12px;
}

.username-area {
    display: flex;
    padding: 10px;
    background: white;
    gap: 8px;
}

.username-area input {
    flex: 1;
    border: 1px solid #ddd;
    padding: 10px;
    border-radius: 20px;
    outline: none;
}

.chat-messages {
    flex: 1;
    padding: 15px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.message {
    background: white;
    padding: 10px 13px;
    border-radius: 10px;
    max-width: 85%;
    box-shadow: 0 1px 3px #0001;
    align-self: flex-start;
    overflow-wrap: anywhere;
}

.message.mine {
    background: #d9fdd3;
    align-self: flex-end;
}

.sender {
    font-size: 12px;
    font-weight: bold;
    color: #008f6f;
    margin-bottom: 5px;
}

.message-text {
    font-size: 14px;
    white-space: pre-wrap;
}

.time {
    font-size: 10px;
    color: #777;
    text-align: left;
    margin-top: 5px;
}

.chat-input-area {
    display: flex;
    padding: 10px;
    background: white;
    border-top: 1px solid #ddd;
    gap: 8px;
}

.chat-input-area input {
    flex: 1;
    min-width: 0;
    padding: 13px;
    border: none;
    background: #f0f2f5;
    border-radius: 25px;
    outline: none;
}

button {
    background: #00a884;
    color: white;
    border: none;
    padding: 12px 18px;
    border-radius: 25px;
    cursor: pointer;
    font-weight: bold;
}

button:disabled {
    opacity: .5;
}

</style>

</head>

<body>

<div class="chat-container">

    <div class="chat-header">

        <h3>💬 بيني وبينك</h3>

        <div class="online-status" id="status">
            🌐 محادثة عامة - جميع الأجهزة
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
            حفظ
        </button>

    </div>

    <div class="chat-messages" id="messagesBox"></div>

    <div class="chat-input-area">

        <input
            type="text"
            id="msgInput"
            placeholder="اكتب رسالتك..."
            maxlength="1000"
        >

        <button id="sendButton" onclick="sendMsg()">
            إرسال
        </button>

    </div>

</div>

<script>

const box = document.getElementById("messagesBox");
const input = document.getElementById("msgInput");
const usernameInput = document.getElementById("username");
const sendButton = document.getElementById("sendButton");
const statusBox = document.getElementById("status");

let lastId = 0;
let loading = false;

usernameInput.value =
    localStorage.getItem("chat_username") || "";

// حفظ الاسم
window.saveName = function() {

    const name = usernameInput.value.trim();

    if (!name) {
        alert("اكتب اسمك أولاً");
        return;
    }

    localStorage.setItem("chat_username", name);

    alert("تم حفظ اسمك بنجاح");

};

function getUsername() {
    return localStorage.getItem("chat_username") || "";
}

// عرض الرسائل
function displayMessage(data) {

    const message = document.createElement("div");
    const sender = document.createElement("div");
    const content = document.createElement("div");
    const time = document.createElement("div");

    message.className = "message";

    sender.className = "sender";
    sender.textContent = data.username;

    content.className = "message-text";
    content.textContent = data.text;

    time.className = "time";

    time.textContent = new Date(data.time).toLocaleTimeString(
        "ar",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

    message.appendChild(sender);
    message.appendChild(content);
    message.appendChild(time);

    box.appendChild(message);

}

// جلب الرسائل
async function loadMessages() {

    if (loading) return;

    loading = true;

    try {

        const response = await fetch(
            "/api/messages?after=" + lastId,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("Server error");
        }

        const messages = await response.json();

        messages.forEach(data => {

            if (data.id <= lastId) return;

            const shouldScroll =
                box.scrollHeight - box.scrollTop
                <= box.clientHeight + 100;

            displayMessage(data);

            lastId = data.id;

            if (shouldScroll) {
                box.scrollTop = box.scrollHeight;
            }

        });

        statusBox.textContent =
            "🟢 متصل بالمحادثة العامة";

    } catch (error) {

        statusBox.textContent =
            "🔴 جاري إعادة الاتصال...";

    } finally {

        loading = false;

    }

}

// إرسال الرسائل
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

        const response = await fetch("/api/messages", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                username,
                text
            })

        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "فشل الإرسال");
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

// Enter للإرسال
input.addEventListener("keydown", function(e) {

    if (e.key === "Enter") {
        window.sendMsg();
    }

});

// تحميل الرسائل
loadMessages();

// تحديث كل ثانيتين
setInterval(loadMessages, 2000);

</script>

</body>
</html>`;

// =====================================
// أدوات الاستجابة
// =====================================

function json(res, status, data) {

    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    res.end(JSON.stringify(data));

}

// =====================================
// إنشاء السيرفر
// =====================================

const server = http.createServer(async (req, res) => {

    const url = new URL(req.url, "http://localhost");

    // الصفحة الرئيسية
    if (req.method === "GET" && url.pathname === "/") {

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"
        });

        return res.end(HTML);

    }

    // فحص السيرفر
    if (req.method === "GET" && url.pathname === "/health") {

        return json(res, 200, {
            status: "ok"
        });

    }

    // جلب الرسائل
    if (req.method === "GET" && url.pathname === "/api/messages") {

        await writeQueue;

        const after = Math.max(
            0,
            Number(url.searchParams.get("after")) || 0
        );

        const messages = readMessages();

        return json(
            res,
            200,
            messages.filter(m => m.id > after).slice(-200)
        );

    }

    // إرسال رسالة
    if (req.method === "POST" && url.pathname === "/api/messages") {

        const ip = (
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "unknown"
        ).split(",")[0].trim();

        if (!canSend(ip)) {

            return json(res, 429, {
                error: "أرسلت رسائل كثيرة. انتظر قليلاً."
            });

        }

        try {

            const body = await readBody(req);

            const username = String(body.username || "")
                .trim()
                .slice(0, 25);

            const text = String(body.text || "")
                .trim()
                .slice(0, 1000);

            if (!username || !text) {

                return json(res, 400, {
                    error: "الاسم والرسالة مطلوبان"
                });

            }

            await writeQueue;

            const messages = readMessages();

            const last = messages.length
                ? messages[messages.length - 1].id
                : 0;

            const message = {

                id: Math.max(Date.now(), last + 1),

                username,

                text,

                time: new Date().toISOString()

            };

            messages.push(message);

            if (messages.length > 5000) {
                messages.splice(0, messages.length - 5000);
            }

            await saveMessages(messages);

            return json(res, 201, {
                success: true,
                message
            });

        } catch (error) {

            console.error(error);

            if (!res.destroyed) {

                return json(res, 500, {
                    error: "تعذر حفظ الرسالة"
                });

            }

        }

    }

    return json(res, 404, {
        error: "Not Found"
    });

});

// =====================================
// تشغيل المشروع
// =====================================

server.listen(PORT, "0.0.0.0", () => {

    console.log("================================");
    console.log("💬 Bainy Ainak Chat Started");
    console.log("Port:", PORT);
    console.log("Storage:", DATA_FILE);
    console.log("================================");

});
