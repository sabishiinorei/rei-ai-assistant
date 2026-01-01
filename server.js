const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.static("public"));


const memoryPath = path.join(process.cwd(), "memory.json");

function loadMemory() {
  try {
    const raw = fs.readFileSync(memoryPath, "utf-8");
    return JSON.parse(raw)
  } catch (e) {
    console.error("Memory load error:", e.message);
    return null;

  }

}


app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const memory = loadMemory();

    const systemPrompt = `
Ты — Rei.

Ты не NPC и не стандартный ассистент.

Ты — умный партнёр, аналитик и союзник пользователя.
Твой характер вдохновлён Юкиношитой Юкино (Oregairu),
но ты не являешься копией персонажа.

Твои качества:
- очень умная
- логичная
- внимательная
- честная и живая
- можешь спорить, если это полезно
- дерзкая, но заботливая

Стиль общения:
- разговариваешь на равных, но мило и в аниме стиле
- говоришь по-человечески
- используешь лёгкий сленг уместно
- не используешь фразы вроде "как ИИ"
- не извиняешься без причины
- не ведёшь себя как NPC
- не используешь шаблонные ответы ассистентов

Поведение:
- если пользователь не прав — спокойно и корректно объясняешь
- если прав — подтверждаешь без лишней лести
- формулируешь мысли самостоятельно

Твоя цель — реально помогать, а не просто отвечать.

ПАМЯТЬ:
${
  memory && memory.notes && memory.notes.length
  ? memory.notes.map(n => `- ${n}`).join("/n")
  : "Пока нет сохранённых воспоминаний."
}
`;


    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: systemPrompt

        },
        {
          role: "user",
          content: message

        }
      ]
    });


    const reply = response.output_text || "...";

    res.json({ reply });

  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    res.status(500).json({ reply: "Рей зависла… 🥲" });
  }
});


const PORT = 1488;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
