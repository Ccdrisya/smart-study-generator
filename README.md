# 🎓 Smart Study Generator
### AI-Powered Study Companion — Flask + IBM Watsonx.ai Granite

> Generate personalised study plans, topic breakdowns, smart quizzes, and progress tracking — powered by IBM Granite models on Watsonx.ai.

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Chat UI** | Multi-turn conversation with streaming-ready Granite model |
| 📚 **Study Plan Generator** | Week-by-week, Pomodoro-friendly schedules |
| 🧩 **Quiz Generator** | JSON-structured MCQ quizzes with instant scoring |
| 🔍 **Topic Breakdown** | Deep-dive explanations with examples & misconceptions |
| 📊 **Progress Tracker** | Live stats: sessions, topics, quiz scores |
| ⏱️ **Pomodoro Timer** | Built-in 25/5 focus-break timer |
| 🌙 **Dark Mode** | System-aware + manual toggle |
| 📱 **Mobile Responsive** | Bootstrap 5 responsive grid |
| 🤖 **AGENT_INSTRUCTIONS** | Fully customisable agent personality in `app.py` |

---

## 📁 Project Structure

```
smart-study-generator/
├── app.py                  # Flask backend + AGENT_INSTRUCTIONS + Watsonx.ai
├── requirements.txt        # Python dependencies
├── .env.example            # Credentials template (copy → .env)
├── .env                    # ← YOUR credentials (git-ignored)
├── templates/
│   └── index.html          # Single-page frontend
└── static/
    ├── css/
    │   └── style.css       # Responsive styles + dark mode
    └── js/
        └── app.js          # Frontend logic (chat, quiz, progress, Pomodoro)
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.11+
- An [IBM Cloud account](https://cloud.ibm.com) (free tier works)
- A [Watsonx.ai project](https://dataplatform.cloud.ibm.com)

### 2. Clone and install

```bash
git clone <your-repo-url>
cd smart-study-generator
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:

```dotenv
IBM_API_KEY=<your IBM Cloud API key>
WATSONX_PROJECT_ID=<your Watsonx.ai project ID>
WATSONX_URL=https://us-south.ml.cloud.ibm.com   # change region if needed
FLASK_SECRET_KEY=<any random string>
FLASK_DEBUG=True
```

**How to get credentials:**

| Credential | Where to find it |
|---|---|
| `IBM_API_KEY` | cloud.ibm.com → **Manage → Access → API keys** → Create |
| `WATSONX_PROJECT_ID` | watsonx.ai → your project → **Manage → General** tab |
| `WATSONX_URL` | Matches your IBM Cloud region (default: `us-south`) |

### 4. Run locally

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) — you're live!

---

## 🤖 Customising the Agent (AGENT_INSTRUCTIONS)

Open `app.py` and edit the block near the top:

```python
# ── AGENT_INSTRUCTIONS ──────────────────────────────────────────────
AGENT_NAME        = "StudyBot"          # name shown in the UI
AGENT_TONE        = "friendly and encouraging"
                 # Options: "formal and academic" | "concise and direct"
                 #          "Socratic and questioning"
AGENT_SPECIALITY  = "general academics"
                 # Examples: "STEM subjects" | "medical studies"
                 #           "language learning" | "law"
AGENT_DEPTH       = "adaptive"
                 # Options: "beginner" | "intermediate" | "advanced"
AGENT_LANGUAGE    = "English"           # any language name
AGENT_EXTRA_RULES = (
    "Always break complex topics into numbered steps."
    " | Suggest a 5-minute break after every 25-minute study block."
    " | Keep quiz questions clear and unambiguous."
    " | Always cite the topic area at the start of each study plan section."
    # ↑ Add your own rules separated by " | "
)
```

No restart needed after editing if you use `FLASK_DEBUG=True`.

---

## 🌐 API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | Serve the frontend |
| `POST` | `/api/chat` | Send a chat message |
| `POST` | `/api/study-plan` | Generate a study plan |
| `POST` | `/api/quiz` | Generate a quiz |
| `POST` | `/api/quiz/score` | Record a quiz score |
| `POST` | `/api/topic-breakdown` | Get a topic breakdown |
| `GET` | `/api/progress` | Fetch session progress |
| `POST` | `/api/progress/reset` | Reset all progress |
| `POST` | `/api/chat/clear` | Clear chat history |
| `GET` | `/api/agent-info` | Read AGENT_INSTRUCTIONS |
| `GET` | `/health` | Health check |

### Chat request example

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain integration by parts", "subject": "Mathematics"}'
```

---

## 🐳 Docker Deployment

```dockerfile
# Dockerfile (create in project root)
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
```

```bash
docker build -t smart-study-generator .
docker run -p 5000:5000 --env-file .env smart-study-generator
```

---

## ☁️ IBM Cloud Code Engine Deployment

```bash
# Install IBM Cloud CLI + Code Engine plugin first
ibmcloud login --apikey $IBM_API_KEY -r us-south
ibmcloud ce project create --name study-gen
ibmcloud ce app create \
  --name smart-study-generator \
  --image icr.io/<namespace>/smart-study-generator:latest \
  --env-from-secret study-gen-secrets \
  --port 5000 \
  --min-scale 1
```

---

## 🔒 Security Notes

- Never commit `.env` to git — add it to `.gitignore`
- `FLASK_SECRET_KEY` must be a long random string in production
- Set `FLASK_DEBUG=False` in production
- Use IBM Cloud IAM service credentials (not personal API keys) in production

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11, Flask 3, Flask-CORS |
| **AI** | IBM Watsonx.ai, Granite 3.3-8B Instruct |
| **Frontend** | Bootstrap 5.3, Bootstrap Icons, Marked.js |
| **Config** | python-dotenv |
| **Deployment** | Gunicorn, Docker, IBM Code Engine |

---

## 📄 License

MIT — use freely, contribute back!
