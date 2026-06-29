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

    // 🎯 關鍵 1：設定專屬 Header，強制 Vercel 不要扣留字串，收到一個字就立刻推給前端！
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); 

    try {
        const cozeResponse = await fetch('https://5d399xsf75.coze.site/stream_run', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: {
                    query: { prompt: [{ type: "text", content: { text: message } }] },
                    type: "query",
                    session_id: `session_${Date.now()}`,
                    project_id: PROJECT_ID
                }
            })
        });

        if (!cozeResponse.ok) throw new Error(`Coze API error: ${cozeResponse.statusText}`);

        // 🎯 關鍵 2：使用原生的 getReader() 和 TextDecoder 讀取串流，完美相容所有平台
        const reader = cozeResponse.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = '';

        while (true) {
            // 一塊一塊（chunk）把資料讀出來
            const { done, value } = await reader.read();
            if (done) break;

            // 將二進制資料解碼成字串，{ stream: true } 可防止中文字在切斷時變成亂碼
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留不完整的最後一行到下一輪

            for (let line of lines) {
                let cleanLine = line.trim();
                if (!cleanLine || !cleanLine.startsWith('data:')) continue;
                
                cleanLine = cleanLine.replace('data:', '').trim();
                if (cleanLine === '[DONE]') continue; // Coze 傳送完畢的標記

                try {
                    const parsed = JSON.parse(cleanLine);
                    let textToPrint = '';
                    
                    // 用我們剛才驗證成功的邏輯抓出真正的字
                    if (parsed.content && parsed.content.answer) {
                        textToPrint = parsed.content.answer;
                    } else if (parsed.content && typeof parsed.content === 'string') {
                        textToPrint = parsed.content;
                    } else if (parsed.answer) {
                        textToPrint = parsed.answer;
                    }

                    // 只要有抓到字，立刻寫入並「沖（flush）」給前端！
                    if (textToPrint) {
                        res.write(textToPrint);
                        if (res.flush) res.flush(); 
                    }
                } catch (e) {
                    // JSON 解析失敗的保底：用正則表達式硬抓
                    const matchAnswer = cleanLine.match(/"answer"\s*:\s*"([^"]+)"/);
                    const matchContent = cleanLine.match(/"content"\s*:\s*"([^"]+)"/);
                    let targetText = (matchAnswer && matchAnswer[1]) || (matchContent && matchContent[1]);
                    
                    if (targetText) {
                        try {
                            const cleanText = JSON.parse(`"${targetText}"`);
                            res.write(cleanText);
                        } catch(err) {
                            res.write(targetText.replace(/\\n/g, '\n'));
                        }
                        if (res.flush) res.flush();
                    }
                }
            }
        }
        res.end(); // 迴圈結束，關閉連線

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