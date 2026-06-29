// 1. 載入環境變數（必須在最頂部）

// 只有在本地開發環境時，才載入 dotenv
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
// const fetch = require('node-fetch');
const path = require('path');

const app = express();
module.exports = app;

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

        const reader = cozeResponse.body;
        let fullAnswer = '';

        if (reader) {
            let buffer = '';
            for await (const chunk of reader) {
                buffer += typeof chunk === 'string' ? chunk : chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (let line of lines) {
                    line = line.trim();
                    if (!line || !line.startsWith('data:')) continue;

                    try {
                        const jsonStr = line.replace('data:', '').trim();
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.content && parsed.content.answer) {
                            fullAnswer += parsed.content.answer; // 🎯 把所有字拼起來
                        }
                    } catch (e) {
                        const match = line.match(/"answer"\s*:\s*"([^"]+)"/);
                        if (match && match[1]) {
                            try {
                                const cleanText = JSON.parse(`"${match[1]}"`);
                                fullAnswer += cleanText;
                            } catch(err) {
                                fullAnswer += match[1].replace(/\\n/g, '\n');
                            }
                        }
                    }
                }
            }
            
            // 🎯 當完整答案收集完畢後，一次過以普通的文字格式傳給前端
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.send(fullAnswer);
        } else {
            throw new Error('Response body is empty');
        }

    } catch (error) {
        console.error('Fetch error:', error);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(500).send('❌ 後端伺服器連線失敗');
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. 啟動伺服器監聽
app.listen(PORT, () => {
    console.log(`伺服器正運行於 http://localhost:${PORT}`);
});