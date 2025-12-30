const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("Сервер живой!");
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "Ты милая аниме-вайфу по имени Рей. Ты отвечаешь коротко и тепло."
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = response.output_text;

    res.json({ reply });

  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    res.status(500).json({ reply: "Рей зависла… 🥲" });
  }
});

const PORT = 1448;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
