// 1. 載入環境變數（必須在最頂部）
// 只有在本地開發環境時，才載入 dotenv
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
// const fetch = require('node-fetch');
const path = require('path');

module.exports = app;
const app = express();

// 2. 從環境變數讀取安全設定
const API_TOKEN = process.env.API_TOKEN;
const PROJECT_ID = process.env.PROJECT_ID;
const PORT = process.env.PORT || 3000;

// 3. 設定中間件與靜態資料夾
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 4. API 串流路由
app.post('/api/chat-stream', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const cozeResponse = await fetch('https://5d399xsf75.coze.site/stream_run', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: {
                    query: {
                        prompt: [{ type: "text", content: { text: message } }]
                    },
                    type: "query",
                    session_id: `session_${Date.now()}`,
                    project_id: PROJECT_ID
                }
            })
        });

        if (!cozeResponse.ok) throw new Error(`Coze API error: ${cozeResponse.statusText}`);

        let buffer = '';
        cozeResponse.body.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (let line of lines) {
                line = line.trim();
                if (!line || !line.startsWith('data:')) continue;

                try {
                    const jsonStr = line.replace('data:', '').trim();
                    const parsed = JSON.parse(jsonStr);

                    // 🎯 精準攔截文字內容
                    if (parsed.content && parsed.content.answer) {
                        res.write(parsed.content.answer); 
                    }
                } catch (e) {
                    // JSON 解析失敗時的保底機制
                    const match = line.match(/"answer"\s*:\s*"([^"]+)"/);
                    if (match && match[1]) {
                        try {
                            const cleanText = JSON.parse(`"${match[1]}"`);
                            res.write(cleanText);
                        } catch(err) {
                            res.write(match[1].replace(/\\n/g, '\n'));
                        }
                    }
                }
            }
        });

        cozeResponse.body.on('end', () => {
            res.end();
        });

    } catch (error) {
        console.error('Fetch error:', error);
        res.write('❌ 後端伺服器連線失敗');
        res.end();
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. 啟動伺服器監聽
app.listen(PORT, () => {
    console.log(`伺服器正運行於 http://localhost:${PORT}`);
});