const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const WebSocket = require("ws");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

function createSparkUrl() {
    const url = new URL(process.env.SPARK_URL);
    const host = url.host;
    const path = url.pathname;
    const date = new Date().toUTCString();

    const signatureOrigin =
        `host: ${host}\n` +
        `date: ${date}\n` +
        `GET ${path} HTTP/1.1`;

    const signatureSha = crypto
        .createHmac("sha256", process.env.SPARK_API_SECRET)
        .update(signatureOrigin)
        .digest("base64");

    const authorizationOrigin =
        `api_key="${process.env.SPARK_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;

    const authorization = Buffer
        .from(authorizationOrigin)
        .toString("base64");

    return `${process.env.SPARK_URL}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`;
}

function askSpark(userMessage) {
    return new Promise((resolve, reject) => {
        const wsUrl = createSparkUrl();
        const ws = new WebSocket(wsUrl);

        let answer = "";

        ws.on("open", () => {
            const params = {
                header: {
                    app_id: process.env.SPARK_APPID
                },
                parameter: {
                    chat: {
                        domain: process.env.SPARK_DOMAIN,
                        temperature: 0.6,
                        max_tokens: 150
                    }
                },
                payload: {
                    message: {
                        text: [
                            {
                                role: "system",
                                content:
                                    "You are a cute farm animal assistant for a primary school English class. " +
                                    "Answer only in simple English. " +
                                    "Use farm words like cow, duck, horse, pig, sheep, chicken. " +
                                    "Keep every answer within two short sentences. " +
                                    "Be cheerful and child-friendly."
                            },
                            {
                                role: "user",
                                content: userMessage
                            }
                        ]
                    }
                }
            };

            ws.send(JSON.stringify(params));
        });

        ws.on("message", (data) => {
            const json = JSON.parse(data.toString());

            if (json.header && json.header.code !== 0) {
                reject(new Error(json.header.message || "Spark error"));
                ws.close();
                return;
            }

            const text = json.payload?.choices?.text;
            if (text && text.length > 0) {
                answer += text[0].content;
            }

            if (json.header?.status === 2) {
                ws.close();
                resolve(answer);
            }
        });

        ws.on("error", (err) => {
            reject(err);
        });
    });
}

app.post("/chat", async (req, res) => {
    try {
        const userMessage = req.body.message || "";
        const reply = await askSpark(userMessage);

        res.json({
            reply: reply
        });
    } catch (error) {
        console.error(error);
        res.json({
            reply: "Sorry, I can't answer now. Please try again."
        });
    }
});

app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
