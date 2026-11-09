<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>بيني وبينك - Ho Chat</title>
    <!-- استدعاء مكتبة PeerJS للاتصال المباشر ونظام الشات الحقيقي -->
    <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: system-ui, -apple-system, sans-serif;
        }
        body {
            background-color: #0f172a;
            color: #f8fafc;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        header {
            background-color: #1e293b;
            padding: 15px;
            text-align: center;
            border-bottom: 1px solid #334155;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        header h1 {
            font-size: 1.25rem;
            color: #38bdf8;
        }
        .connection-box {
            background-color: #1e293b;
            padding: 15px;
            margin: 15px;
            border-radius: 12px;
            border: 1px solid #334155;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .connection-box input {
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #475569;
            background: #0f172a;
            color: #fff;
            font-size: 1rem;
            outline: none;
        }
        .connection-box button {
            padding: 10px;
            background-color: #0284c7;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        .connection-box button:hover {
            background-color: #0369a1;
        }
        .my-id-container {
            font-size: 0.9rem;
            color: #94a3b8;
            word-break: break-all;
        }
        .my-id-container span {
            color: #38bdf8;
            font-weight: bold;
            user-select: all;
        }
        #chat-section {
            display: none;
            flex-direction: column;
            flex: 1;
            overflow: hidden;
        }
        #messages {
            flex: 1;
            padding: 15px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .message {
            max-width: 75%;
            padding: 10px 14px;
            border-radius: 12px;
            word-break: break-word;
            font-size: 0.95rem;
            line-height: 1.4;
        }
        .message.sent {
            background-color: #0284c7;
            color: white;
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }
        .message.received {
            background-color: #334155;
            color: #f8fafc;
            align-self: flex-end;
            border-bottom-right-radius: 2px;
        }
        .input-box {
            padding: 15px;
            background-color: #1e293b;
            display: flex;
            gap: 10px;
            border-top: 1px solid #334155;
        }
        .input-box input {
            flex: 1;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid #475569;
            background: #0f172a;
            color: #fff;
            outline: none;
            font-size: 1rem;
        }
        .input-box button {
            padding: 0 20px;
            background-color: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
        }
        .input-box button:hover {
            background-color: #059669;
        }
        .status {
            text-align: center;
            font-size: 0.85rem;
            padding: 5px;
            color: #fbbf24;
        }
    </style>
</head>
<body>

    <header>
        <h1>بيني وبينك - Ho Chat 💬</h1>
    </header>

    <!-- شاشة الاتصال والربط -->
    <div id="setup-section" class="connection-box">
        <div class="my-id-container">معرفك الخاص (أعطه لصديقك): <span id="my-peer-id">جاري التوليد...</span></div>
        <input type="text" id="friend-id-input" placeholder="الصق معرف صديقك هنا للاتصال به">
        <button onclick="connectToFriend()">اتصال</button>
    </div>

    <div id="connection-status" class="status">في انتظار الاتصال...</div>

    <!-- شاشة المحادثة الفعلية -->
    <div id="chat-section">
        <div id="messages"></div>
        <div class="input-box">
            <input type="text" id="message-input" placeholder="اكتب رسالتك هنا..." onkeypress="handleKeyPress(event)">
            <button onclick="sendMessage()">إرسال</button>
        </div>
    </div>

    <script>
        let peer;
        let conn;
        let myId = '';
        let currentPartnerId = '';

        // توليد معرف عشوائي فريد ومنع التكرار
        function generateId() {
            return 'bainy-' + Math.random().toString(36).substring(2, 8);
        }

        // تهيئة الاتصال عبر PeerJS
        function initPeer() {
            myId = generateId();
            peer = new Peer(myId);

            peer.on('open', (id) => {
                document.getElementById('my-peer-id').innerText = id;
            });

            // استقبال الاتصال من الطرف الآخر
            peer.on('connection', (connection) => {
                conn = connection;
                currentPartnerId = conn.peer;
                setupConnection();
                updateStatus("متصل الآن بنجاح! 🟢", "#10b981");
            });

            peer.on('error', (err) => {
                console.error(err);
                updateStatus("حدث خطأ في الاتصال، حاول تحديث الصفحة.", "#ef4444");
            });
        }

        // الاتصال بصديق باستخدام معرفه
        function connectToFriend() {
            const friendId = document.getElementById('friend-id-input').value.trim();
            if (!friendId) {
                alert('الرجاء إدخال معرف الطرف الآخر أولاً!');
                return;
            }

            currentPartnerId = friendId;
            updateStatus("جاري الاتصال بالصديق...", "#fbbf24");
            conn = peer.connect(friendId);
            setupConnection();
        }

        // إعداد أحداث الاتصال (استقبال وإرسال البيانات)
        function setupConnection() {
            conn.on('open', () => {
                updateStatus("متصل الآن بنجاح! 🟢", "#10b981");
                document.getElementById('setup-section').style.display = 'none';
                document.getElementById('chat-section').style.display = 'flex';
                
                loadChatHistory(currentPartnerId);
            });

            conn.on('data', (data) => {
                appendMessage(data, 'received', true);
            });

            conn.on('close', () => {
                updateStatus("انقطع الاتصال مع الطرف الآخر.", "#ef4444");
            });
        }

        // إرسال رسالة
        function sendMessage() {
            const input = document.getElementById('message-input');
            const message = input.value.trim();
            if (!message) return;

            if (conn && conn.open) {
                conn.send(message);
                appendMessage(message, 'sent', true);
                input.value = '';
            } else {
                alert('الخط غير متصل بالطرف الآخر بعد!');
            }
        }

        // دعم زر Enter للإرسال السريع
        function handleKeyPress(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        }

        // عرض الرسائل في الشاشة وحفظها
        function appendMessage(text, type, save = false) {
            const messagesDiv = document.getElementById('messages');
            const msgElement = document.createElement('div');
            msgElement.classList.add('message', type);
            msgElement.innerText = text;
            messagesDiv.appendChild(msgElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            if (save && currentPartnerId) {
                saveMessageToStorage(currentPartnerId, text, type);
            }
        }

        // حفظ الرسالة في التخزين المحلي (LocalStorage)
        function saveMessageToStorage(partnerId, text, type) {
            const storageKey = 'ho_chat_' + partnerId;
            let history = JSON.parse(localStorage.getItem(storageKey)) || [];
            history.push({ text, type });
            localStorage.setItem(storageKey, JSON.stringify(history));
        }

        // تحميل سجل الدردشة من التخزين المحلي
        function loadChatHistory(partnerId) {
            const storageKey = 'ho_chat_' + partnerId;
            let history = JSON.parse(localStorage.getItem(storageKey)) || [];
            
            const messagesDiv = document.getElementById('messages');
            messagesDiv.innerHTML = '';

            history.forEach(msg => {
                const msgElement = document.createElement('div');
                msgElement.classList.add('message', msg.type);
                msgElement.innerText = msg.text;
                messagesDiv.appendChild(msgElement);
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        // تحديث حالة الاتصال النصية واللونية
        function updateStatus(text, color) {
            const statusEl = document.getElementById('connection-status');
            statusEl.innerText = text;
            statusEl.style.color = color;
        }

        // بدء التشغيل فور فتح الصفحة
        initPeer();
    </script>
</body>
</html>
