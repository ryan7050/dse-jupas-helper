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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        if (!cozeResponse.ok) throw new Error(`Coze API error: ${cozeResponse.statusText}`);

        // 🎯 修正後的 Web Stream 串流讀取機制（完美相容 Vercel）
        const reader = cozeResponse.body;
        
        if (reader) {
            let buffer = '';
            // 使用符合 Web Stream 的異步迭代器讀取數據
            for await (const chunk of reader) {
                // 將 chunk 轉為字串（相容不同環境的 buffer 或物件）
                buffer += typeof chunk === 'string' ? chunk : chunk.toString();
                
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 留下未完整的最後一行

                for (let line of lines) {
                    line = line.trim();
                    if (!line || !line.startsWith('data:')) continue;

                    try {
                        const jsonStr = line.replace('data:', '').trim();
                        const parsed = JSON.parse(jsonStr);
                        if (parsed.content && parsed.content.answer) {
                            res.write(parsed.content.answer); 
                        }
                    } catch (e) {
                        // 當 JSON 解析不完全時的保底 RegExp
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
            }
            res.end();
        } else {
            throw new Error('Response body is empty');
        }

    } catch (error) {
        console.error('Fetch error:', error);
        res.write('❌ 後端伺服器連線失敗');
        res.end();
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 5. 啟動伺服器監聽
app.listen(PORT, () => {
    console.log(`伺服器正運行於 http://localhost:${PORT}`);
});