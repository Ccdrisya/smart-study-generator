"""
Smart Study Generator — Flask + IBM Watsonx.ai (Granite)
==========================================================
Author  : Smart Study Generator
Version : 1.0.0

AGENT_INSTRUCTIONS
──────────────────
Customise the agent's personality, tone, and specialisation here.
These strings are injected directly into every system prompt sent to
the Granite model, so plain-English edits take effect immediately
without touching any other code.

  AGENT_NAME         : Display name shown in the UI
  AGENT_TONE         : Tone of all responses
                       Options: "friendly and encouraging" | "formal and academic"
                                "concise and direct" | "Socratic and questioning"
  AGENT_SPECIALITY   : Subject domain the agent focuses on by default
                       Examples: "general academics" | "STEM subjects"
                                 "medical studies" | "language learning"
  AGENT_DEPTH        : Default depth of topic explanations
                       Options: "beginner" | "intermediate" | "advanced" | "adaptive"
  AGENT_LANGUAGE     : Language for all generated content
                       Default: "English"
  AGENT_EXTRA_RULES  : Any extra hard rules you want the agent to always follow
                       (one rule per line, use | as separator)
"""

# ── AGENT_INSTRUCTIONS ────────────────────────────────────────────────────────
AGENT_NAME        = "StudyBot"
AGENT_TONE        = "friendly and encouraging"
AGENT_SPECIALITY  = "general academics"
AGENT_DEPTH       = "adaptive"          # beginner | intermediate | advanced | adaptive
AGENT_LANGUAGE    = "English"
AGENT_EXTRA_RULES = (
    "Always break complex topics into numbered steps."
    " | Suggest a 5-minute break after every 25-minute study block (Pomodoro)."
    " | Keep quiz questions clear and unambiguous."
    " | Always cite the topic area at the start of each study plan section."
)
# ─────────────────────────────────────────────────────────────────────────────

import os
import json
import logging
from datetime import datetime

from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from dotenv import load_dotenv
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

load_dotenv()

# ── Flask setup ───────────────────────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Watsonx.ai setup ──────────────────────────────────────────────────────────
IBM_API_KEY        = os.getenv("IBM_API_KEY")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID")
WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")

GRANITE_MODEL_ID = "ibm/granite-4-h-small"
GRANITE_FAST_ID  = "ibm/granite-4-h-small"

_watsonx_client: APIClient | None = None
_model: ModelInference | None = None


def _get_client() -> APIClient:
    global _watsonx_client
    if _watsonx_client is None:
        creds = Credentials(url=WATSONX_URL, api_key=IBM_API_KEY)
        _watsonx_client = APIClient(credentials=creds, project_id=WATSONX_PROJECT_ID)
    return _watsonx_client


def _get_model(model_id: str = GRANITE_MODEL_ID) -> ModelInference:
    client = _get_client()
    return ModelInference(
        model_id=model_id,
        api_client=client,
        params={
            GenParams.MAX_NEW_TOKENS: 1024,
            GenParams.TEMPERATURE: 0.7,
            GenParams.TOP_P: 0.9,
            GenParams.REPETITION_PENALTY: 1.1,
        },
    )


# ── Prompt builders ───────────────────────────────────────────────────────────

def _base_system() -> str:
    """Build the base system prompt from AGENT_INSTRUCTIONS."""
    rules = [r.strip() for r in AGENT_EXTRA_RULES.split("|") if r.strip()]
    rules_text = "\n".join(f"- {r}" for r in rules)
    return (
        f"You are {AGENT_NAME}, an AI-powered study assistant specialised in "
        f"{AGENT_SPECIALITY}. "
        f"Your tone is {AGENT_TONE}. "
        f"Adapt explanations to a {AGENT_DEPTH} level unless the user specifies otherwise. "
        f"Always respond in {AGENT_LANGUAGE}.\n\n"
        f"Hard rules you must always follow:\n{rules_text}"
    )


def _build_chat_prompt(history: list[dict], user_message: str, subject: str) -> str:
    system = _base_system()
    if subject:
        system += f"\n\nThe student's current focus subject is: {subject}."

    prompt = f"<|system|>\n{system}\n"
    for msg in history[-10:]:           # keep last 10 turns for context
        role = "user" if msg["role"] == "user" else "assistant"
        prompt += f"<|{role}|>\n{msg['content']}\n"
    prompt += f"<|user|>\n{user_message}\n<|assistant|>\n"
    return prompt


def _build_studyplan_prompt(subject: str, goal: str, hours: int, level: str) -> str:
    system = _base_system()
    return (
        f"<|system|>\n{system}\n"
        f"<|user|>\n"
        f"Create a detailed, personalised study plan for the following:\n"
        f"- Subject: {subject}\n"
        f"- Learning Goal: {goal}\n"
        f"- Available study hours per week: {hours}\n"
        f"- Current level: {level}\n\n"
        f"Structure the plan with:\n"
        f"1. Weekly overview\n"
        f"2. Day-by-day schedule\n"
        f"3. Topic breakdown with estimated time\n"
        f"4. Recommended resources\n"
        f"5. Milestones and checkpoints\n"
        f"6. Healthy study-break schedule\n"
        f"<|assistant|>\n"
    )


def _build_quiz_prompt(subject: str, topic: str, num_questions: int, difficulty: str) -> str:
    system = _base_system()
    return (
        f"<|system|>\n{system}\n"
        f"<|user|>\n"
        f"Generate a {difficulty}-difficulty quiz on '{topic}' (subject: {subject}).\n"
        f"Produce exactly {num_questions} multiple-choice questions.\n\n"
        f"Return ONLY valid JSON in this exact schema (no markdown fences):\n"
        f'{{"quiz": [{{"question": "...", "options": ["A)...", "B)...", "C)...", "D)..."], '
        f'"answer": "A", "explanation": "..."}}]}}\n'
        f"<|assistant|>\n"
    )


def _build_topic_breakdown_prompt(subject: str, topic: str) -> str:
    system = _base_system()
    return (
        f"<|system|>\n{system}\n"
        f"<|user|>\n"
        f"Provide a comprehensive breakdown of the topic '{topic}' in {subject}.\n"
        f"Include:\n"
        f"1. Core concepts\n"
        f"2. Key formulas or principles\n"
        f"3. Common misconceptions\n"
        f"4. Practical applications\n"
        f"5. Suggested practice problems\n"
        f"6. Links to related topics\n"
        f"<|assistant|>\n"
    )


# ── Watsonx inference helper ──────────────────────────────────────────────────

def _generate(prompt: str, model_id: str = GRANITE_MODEL_ID) -> str:
    try:
        model = _get_model(model_id)
        result = model.generate_text(prompt=prompt)
        return result.strip()
    except Exception as exc:
        logger.error("Watsonx generation error: %s", exc)
        raise


# ── Session helpers ───────────────────────────────────────────────────────────

def _get_chat_history() -> list[dict]:
    return session.get("chat_history", [])


def _save_chat_history(history: list[dict]) -> None:
    session["chat_history"] = history[-50:]     # keep last 50 messages


def _get_progress() -> dict:
    return session.get("progress", {
        "sessions": 0,
        "topics_covered": [],
        "quizzes_taken": 0,
        "avg_quiz_score": 0,
        "total_quiz_score": 0,
        "study_plans_created": 0,
        "last_active": None,
    })


def _save_progress(prog: dict) -> None:
    prog["last_active"] = datetime.now().isoformat()
    session["progress"] = prog


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html", agent_name=AGENT_NAME)


@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.get_json(force=True)
    user_message: str = data.get("message", "").strip()
    subject: str      = data.get("subject", "")

    if not user_message:
        return jsonify({"error": "message is required"}), 400

    history = _get_chat_history()
    prompt  = _build_chat_prompt(history, user_message, subject)

    try:
        reply = _generate(prompt)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    history.append({"role": "user",      "content": user_message})
    history.append({"role": "assistant", "content": reply})
    _save_chat_history(history)

    prog = _get_progress()
    prog["sessions"] += 1
    _save_progress(prog)

    return jsonify({"reply": reply, "history_length": len(history)})


@app.route("/api/study-plan", methods=["POST"])
def api_study_plan():
    data = request.get_json(force=True)
    subject = data.get("subject", "General Studies")
    goal    = data.get("goal",    "Improve overall understanding")
    hours   = int(data.get("hours", 10))
    level   = data.get("level",   "intermediate")

    prompt = _build_studyplan_prompt(subject, goal, hours, level)
    try:
        plan = _generate(prompt)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    prog = _get_progress()
    prog["study_plans_created"] += 1
    _save_progress(prog)

    return jsonify({"plan": plan})


@app.route("/api/quiz", methods=["POST"])
def api_quiz():
    data       = request.get_json(force=True)
    subject    = data.get("subject",    "General Knowledge")
    topic      = data.get("topic",      "Fundamentals")
    num_q      = int(data.get("questions", 5))
    difficulty = data.get("difficulty", "medium")

    num_q = max(1, min(num_q, 10))      # clamp to 1-10

    prompt = _build_quiz_prompt(subject, topic, num_q, difficulty)
    try:
        raw = _generate(prompt, model_id=GRANITE_FAST_ID)
        # Attempt to extract JSON even if the model adds preamble text
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        quiz_data = json.loads(raw[start:end])
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("JSON parse error: %s — raw: %s", exc, raw[:300])
        return jsonify({"error": "Could not parse quiz JSON. Please try again."}), 500
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    prog = _get_progress()
    prog["quizzes_taken"] += 1
    _save_progress(prog)

    return jsonify(quiz_data)


@app.route("/api/quiz/score", methods=["POST"])
def api_quiz_score():
    """Record a completed quiz score."""
    data  = request.get_json(force=True)
    score = int(data.get("score", 0))
    total = int(data.get("total", 1))

    prog = _get_progress()
    prev_total = prog.get("avg_quiz_score", 0) * max(prog.get("quizzes_taken", 1) - 1, 0)
    pct        = round((score / total) * 100, 1)
    quizzes    = max(prog.get("quizzes_taken", 1), 1)
    prog["avg_quiz_score"] = round((prev_total + pct) / quizzes, 1)
    _save_progress(prog)

    return jsonify({"recorded": True, "percentage": pct})


@app.route("/api/topic-breakdown", methods=["POST"])
def api_topic_breakdown():
    data    = request.get_json(force=True)
    subject = data.get("subject", "General Studies")
    topic   = data.get("topic",   "Introduction")

    prompt = _build_topic_breakdown_prompt(subject, topic)
    try:
        breakdown = _generate(prompt)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    prog = _get_progress()
    if topic not in prog["topics_covered"]:
        prog["topics_covered"].append(topic)
    _save_progress(prog)

    return jsonify({"breakdown": breakdown})


@app.route("/api/progress", methods=["GET"])
def api_progress():
    return jsonify(_get_progress())


@app.route("/api/progress/reset", methods=["POST"])
def api_progress_reset():
    session.pop("progress", None)
    session.pop("chat_history", None)
    return jsonify({"reset": True})


@app.route("/api/chat/clear", methods=["POST"])
def api_chat_clear():
    session.pop("chat_history", None)
    return jsonify({"cleared": True})


@app.route("/api/agent-info", methods=["GET"])
def api_agent_info():
    return jsonify({
        "name":       AGENT_NAME,
        "tone":       AGENT_TONE,
        "speciality": AGENT_SPECIALITY,
        "depth":      AGENT_DEPTH,
        "language":   AGENT_LANGUAGE,
    })


# ── Health check ──────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "model": GRANITE_MODEL_ID,
        "agent": AGENT_NAME,
    })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
