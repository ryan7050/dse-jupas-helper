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

        // 🎯 終極殺手鐧：直接把整個回應當成純文字一次讀出來！完全避開串流陷阱！
        const rawText = await cozeResponse.text();
        
        // 這樣絕對能印出東西！
        console.log("Coze 完整原始回應:", rawText); 

        let fullAnswer = '';
        const lines = rawText.split('\n');

        for (let line of lines) {
            let cleanLine = line.trim();
            if (!cleanLine) continue;

            if (cleanLine.startsWith('data:')) {
                cleanLine = cleanLine.replace('data:', '').trim();
            }

            try {
                // 嘗試解析 JSON 並抓字
                const parsed = JSON.parse(cleanLine);
                if (parsed.content && parsed.content.answer) {
                    fullAnswer += parsed.content.answer;
                } else if (parsed.content && typeof parsed.content === 'string') {
                    fullAnswer += parsed.content;
                } else if (parsed.answer) {
                    fullAnswer += parsed.answer;
                } else if (parsed.messages && parsed.messages[0] && parsed.messages[0].content) {
                    fullAnswer += parsed.messages[0].content;
                }
            } catch (e) {
                // 如果不是標準 JSON，用正則表達式硬抓
                const matchAnswer = cleanLine.match(/"answer"\s*:\s*"([^"]+)"/);
                const matchContent = cleanLine.match(/"content"\s*:\s*"([^"]+)"/);
                let targetText = (matchAnswer && matchAnswer[1]) || (matchContent && matchContent[1]);
                
                if (targetText) {
                    try {
                        fullAnswer += JSON.parse(`"${targetText}"`);
                    } catch(err) {
                        fullAnswer += targetText.replace(/\\n/g, '\n');
                    }
                }
            }
        }
        
        console.log("最終拼湊出的完整回答:", fullAnswer);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(fullAnswer || "⚠️ 依然無法解析文字，請去 Logs 查看「Coze 完整原始回應」。");

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