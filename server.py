import os
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
import secrets
import hashlib
import base64
import json
import time
import re
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from forge import FORGE
import exporters

app = FastAPI()

# ── OAuth constants ───────────────────────────────────────────────────────────
OPENAI_CLIENT_ID   = "app_EMoamEEZ73f0CkXaXp7hrann"
OPENAI_AUTH_URL    = "https://auth.openai.com/oauth/authorize"
OPENAI_TOKEN_URL   = "https://auth.openai.com/oauth/token"
OPENAI_REDIRECT    = "http://localhost:1455/auth/callback"
OPENAI_SCOPES      = "openid profile email offline_access"
OPENAI_API_BASE    = "https://api.openai.com/v1"
CHATGPT_CODEX_BASE = "https://chatgpt.com/backend-api/codex"

# Models exposed to the UI. Matches the visibility=list entries in codex
# models-manager/models.json. `supports_priority` means the model accepts
# service_tier=priority (fast tier) — only gpt-5.4 currently does.
AVAILABLE_MODELS = [
    {"slug": "gpt-5.4",            "label": "GPT-5.4",              "reasoning": ["low","medium","high","xhigh"], "default_reasoning": "medium", "supports_priority": True,  "supports_verbosity": True},
    {"slug": "gpt-5.3-codex",      "label": "GPT-5.3 Codex",        "reasoning": ["low","medium","high","xhigh"], "default_reasoning": "medium", "supports_priority": False, "supports_verbosity": False},
    {"slug": "gpt-5.2-codex",      "label": "GPT-5.2 Codex",        "reasoning": ["low","medium","high","xhigh"], "default_reasoning": "medium", "supports_priority": False, "supports_verbosity": False},
    {"slug": "gpt-5.2",            "label": "GPT-5.2",              "reasoning": ["low","medium","high","xhigh"], "default_reasoning": "medium", "supports_priority": False, "supports_verbosity": False},
    {"slug": "gpt-5.1-codex-max",  "label": "GPT-5.1 Codex Max",    "reasoning": ["low","medium","high","xhigh"], "default_reasoning": "medium", "supports_priority": False, "supports_verbosity": False},
    {"slug": "gpt-5.1-codex-mini", "label": "GPT-5.1 Codex Mini",   "reasoning": ["medium","high"],                "default_reasoning": "medium", "supports_priority": False, "supports_verbosity": False},
]
MODELS_BY_SLUG = {m["slug"]: m for m in AVAILABLE_MODELS}
DEFAULT_MODEL = "gpt-5.4"

# Friendly presets that mirror ChatGPT's consumer UI (Auto / Instant / Thinking /
# Pro) and hide the raw (model, reasoning, priority) tuple. Pro variants require
# a ChatGPT Pro account — the server does not enforce subscription, but the UI
# greys them out based on the JWT plan claim. Each variant resolves to a
# concrete (model, effort, priority) triple that the transform endpoint uses.
PRESETS = [
    {
        "id": "auto",
        "label": "Auto",
        "description": "Välj åt mig",
        "requires_pro": False,
        "default_variant": "balanced",
        "variants": [
            {"id": "balanced", "label": "Balanserad", "model": "gpt-5.4", "effort": "medium", "priority": False},
        ],
    },
    {
        "id": "instant",
        "label": "Instant",
        "description": "Snabbt svar, minimal resonemang",
        "requires_pro": False,
        "default_variant": "fast",
        "variants": [
            {"id": "fast", "label": "Snabb", "model": "gpt-5.4", "effort": "low", "priority": False},
        ],
    },
    {
        "id": "thinking",
        "label": "Thinking",
        "description": "Resonerande — högre kvalitet, längre väntetid",
        "requires_pro": False,
        "default_variant": "standard",
        "variants": [
            {"id": "standard", "label": "Resonerande",         "model": "gpt-5.4", "effort": "medium", "priority": False},
            {"id": "extended", "label": "Utökat resonerande",  "model": "gpt-5.4", "effort": "high",   "priority": False},
        ],
    },
    {
        "id": "pro",
        "label": "Pro",
        "description": "Priority-tier + djupare resonemang (kräver ChatGPT Pro)",
        "requires_pro": True,
        "default_variant": "standard",
        "variants": [
            {"id": "standard", "label": "Standard",  "model": "gpt-5.4", "effort": "high",  "priority": True},
            {"id": "longer",   "label": "Längre",    "model": "gpt-5.4", "effort": "xhigh", "priority": True},
        ],
    },
]
PRESETS_BY_ID = {p["id"]: p for p in PRESETS}
DEFAULT_PRESET = "thinking"
DEFAULT_PRESET_VARIANT = "standard"


def resolve_preset(preset_id: str | None, variant_id: str | None) -> dict | None:
    """Return the (model, effort, priority, requires_pro) triple for a preset/variant.

    Returns None when preset_id is not recognized so the caller can fall back to
    raw model+reasoning+priority fields. Unknown variant → preset's default_variant.
    """
    preset = PRESETS_BY_ID.get(preset_id)
    if preset is None:
        return None
    variants = {v["id"]: v for v in preset["variants"]}
    variant = variants.get(variant_id) or variants[preset["default_variant"]]
    return {
        "model": variant["model"],
        "effort": variant["effort"],
        "priority": bool(variant["priority"]),
        "requires_pro": bool(preset.get("requires_pro")),
        "preset_id": preset["id"],
        "variant_id": variant["id"],
    }

# Required Codex identity prefix — OpenAI's OAuth-bound endpoint expects this
# to appear in `instructions`. Forge-generated instructions are appended after.
CODEX_SYSTEM_PROMPT = (
    "You are Codex, a coding assistant based on GPT-4o. "
    "You are running as an agent in the Codex CLI on a user's local machine."
)

# In-memory PKCE state store (keyed by state parameter)
pkce_store: dict[str, dict] = {}

# ── PKCE helpers ─────────────────────────────────────────────────────────────
def generate_pkce():
    code_verifier = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode()
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    with open(STATIC_DIR / "index.html", encoding="utf-8") as f:
        return f.read()

# Start OAuth flow
@app.get("/auth/login")
async def auth_login():
    code_verifier, code_challenge = generate_pkce()
    state = secrets.token_urlsafe(16)
    pkce_store[state] = {
        "code_verifier": code_verifier,
        "created_at": time.time()
    }

    from urllib.parse import urlencode
    params = urlencode({
        "response_type": "code",
        "client_id": OPENAI_CLIENT_ID,
        "redirect_uri": OPENAI_REDIRECT,
        "scope": OPENAI_SCOPES,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
    })
    return RedirectResponse(f"{OPENAI_AUTH_URL}?{params}")

# OAuth callback
@app.get("/auth/callback")
async def auth_callback(request: Request, code: str = None, state: str = None, error: str = None):
    if error:
        return RedirectResponse(f"/?auth_error={error}")

    if not code or not state or state not in pkce_store:
        return RedirectResponse("/?auth_error=invalid_state")

    code_verifier = pkce_store.pop(state)["code_verifier"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OPENAI_TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": OPENAI_REDIRECT,
                "client_id": OPENAI_CLIENT_ID,
                "code_verifier": code_verifier,
            }
        )

    if resp.status_code != 200:
        return RedirectResponse(f"/?auth_error=token_exchange_failed")

    tokens = resp.json()
    access_token  = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    expires_in    = tokens.get("expires_in", 3600)
    expires_at    = int((time.time() + expires_in) * 1000)

    # Redirect back with tokens in fragment (never hits server logs)
    import urllib.parse
    fragment = urllib.parse.urlencode({
        "access_token":  access_token,
        "refresh_token": refresh_token,
        "expires_at":    expires_at,
    })
    return RedirectResponse(f"/#auth={urllib.parse.quote(fragment)}")

# Token refresh
class RefreshRequest(BaseModel):
    refresh_token: str

@app.post("/auth/refresh")
async def auth_refresh(req: RefreshRequest):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            OPENAI_TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "refresh_token",
                "refresh_token": req.refresh_token,
                "client_id": OPENAI_CLIENT_ID,
            }
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token refresh failed")

    tokens = resp.json()
    return {
        "access_token":  tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token", req.refresh_token),
        "expires_at":    int((time.time() + tokens.get("expires_in", 3600)) * 1000),
    }

# URL fetch
class UrlFetchRequest(BaseModel):
    url: str

@app.post("/api/fetch-url")
async def fetch_url_endpoint(req: UrlFetchRequest):
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(req.url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            text = resp.text
            text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<style[^>]*>.*?</style>',  '', text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()[:15000]
            return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Kunde inte hämta URL: {e}")

# ── Config endpoint ──────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    return {
        "models": AVAILABLE_MODELS,
        "default_model": DEFAULT_MODEL,
        "presets": PRESETS,
        "default_preset": DEFAULT_PRESET,
        "default_preset_variant": DEFAULT_PRESET_VARIANT,
        "parameters": FORGE.parameters(),
        "format_matrix": FORGE.format_matrix(),
        "skill_version": FORGE.version,
    }

@app.get("/api/models")
async def list_models():
    """Back-compat with pre-forge clients."""
    return {"models": AVAILABLE_MODELS, "default": DEFAULT_MODEL}

# ── Transform (single + multi-chapter, format-aware) ─────────────────────────

class TransformRequest(BaseModel):
    text: str
    access_token: str
    account_id: str | None = None
    # Preset (friendly) OR raw model/reasoning/priority. If preset is set it
    # takes precedence and overrides the raw fields.
    preset: str | None = None
    preset_variant: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None
    priority: bool = False
    length: str | None = None
    detail: str | None = None
    graphics: str | None = None
    mode: str | None = None
    format: str | None = None


def _make_input_item(role: str, text: str) -> dict:
    """Build a single message item for the Responses API `input` array.

    `role="user"` uses `input_text` content parts. `role="assistant"` uses
    `output_text` to represent prior model turns in multi-turn conversations.
    """
    if role == "assistant":
        return {"type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": text}]}
    return {"type": "message", "role": "user",
            "content": [{"type": "input_text", "text": text}]}


async def _codex_call(instructions: str, input_items: list[dict] | str, model_slug: str,
                      effort: str, access_token: str, account_id: str | None,
                      priority: bool, supports_verbosity: bool) -> str:
    """Fire a single non-multiplexed Codex /responses call and return text output.

    `input_items` accepts either a pre-built list of Responses API message items
    (for multi-turn chat) or a plain string (shorthand for a single user turn).
    """
    if isinstance(input_items, str):
        input_items = [_make_input_item("user", input_items)]
    payload = {
        "model": model_slug,
        "instructions": instructions,
        "input": input_items,
        "tools": [],
        "tool_choice": "auto",
        "parallel_tool_calls": False,
        "reasoning": {"effort": effort},
        "store": False,
        "stream": True,
        "include": ["reasoning.encrypted_content"],
    }
    if supports_verbosity:
        payload["text"] = {"verbosity": "low"}
    if priority:
        payload["service_tier"] = "priority"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "originator": "codex_cli_rs",
        "User-Agent": "codex_cli_rs/0.0.0 (textowiki)",
    }
    if account_id:
        headers["ChatGPT-Account-ID"] = account_id

    out = ""
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream("POST", f"{CHATGPT_CODEX_BASE}/responses",
                                 headers=headers, json=payload) as resp:
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Token utgången — logga in igen")
            if resp.status_code != 200:
                body = await resp.aread()
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Codex-fel ({resp.status_code}): {body.decode(errors='replace')[:500]}",
                )
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str or data_str == "[DONE]":
                    continue
                try:
                    evt = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                etype = evt.get("type", "")
                if etype == "response.output_text.delta":
                    out += evt.get("delta", "")
                elif etype == "response.completed" and not out:
                    resp_data = evt.get("response", {}) or {}
                    for item in resp_data.get("output", []) or []:
                        if item.get("type") == "message":
                            for c in item.get("content", []) or []:
                                if c.get("type") == "output_text":
                                    out += c.get("text", "")
    if not out:
        raise HTTPException(status_code=502, detail="Tomt svar från Codex")
    return out


_JSON_FENCE_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_chapter_index(outline_md: str) -> list[dict]:
    m = _JSON_FENCE_RE.search(outline_md)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
        chapters = data.get("chapters", []) or []
        return [c for c in chapters if c.get("id") and c.get("title")]
    except json.JSONDecodeError:
        return []


def _strip_json_fence(raw: str) -> str:
    m = re.search(r"```json\s*(\{.*\})\s*```", raw, re.DOTALL)
    return m.group(1) if m else raw.strip()


def _package_single(raw: str, fmt: str) -> dict:
    """Package a single-mode raw LLM output into the requested format response."""
    if fmt == "markdown":
        return {"format": "markdown", "markdown": raw}

    if fmt == "json":
        try:
            payload = json.loads(_strip_json_fence(raw))
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=502, detail=f"Modellen returnerade ogiltig JSON: {e}")
        preview_md = exporters.json_to_markdown(payload)
        return {"format": "json", "json": payload, "markdown": preview_md}

    if fmt == "html":
        html = exporters.md_to_html(raw)
        return {
            "format": "html", "filename": "textowiki.html", "mime": "text/html",
            "base64": base64.b64encode(html.encode("utf-8")).decode(),
            "markdown": raw,
        }

    if fmt == "pdf":
        pdf = exporters.md_to_pdf(raw)
        return {
            "format": "pdf", "filename": "textowiki.pdf", "mime": "application/pdf",
            "base64": base64.b64encode(pdf).decode(),
            "markdown": raw,
        }

    if fmt == "docx":
        docx = exporters.md_to_docx(raw)
        return {
            "format": "docx", "filename": "textowiki.docx",
            "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "base64": base64.b64encode(docx).decode(),
            "markdown": raw,
        }

    return {"format": "markdown", "markdown": raw}


def _package_multi(outline_raw: str, chapters: list[dict],
                   bodies: list[str], fmt: str) -> dict:
    """Package multi-chapter output. Outline JSON fence is stripped from preview."""
    index_md = _JSON_FENCE_RE.sub("", outline_raw).strip()
    combined = index_md + "\n\n---\n\n" + "\n\n---\n\n".join(bodies)
    chapter_records = [
        {"id": c["id"], "title": c["title"], "body": b}
        for c, b in zip(chapters, bodies)
    ]

    if fmt == "markdown":
        return {"format": "markdown", "markdown": combined, "chapters": chapter_records}

    if fmt == "html":
        html = exporters.md_to_html(combined)
        return {
            "format": "html", "filename": "textowiki.html", "mime": "text/html",
            "base64": base64.b64encode(html.encode("utf-8")).decode(),
            "markdown": combined, "chapters": chapter_records,
        }

    if fmt == "pdf":
        pdf = exporters.md_to_pdf(combined)
        return {
            "format": "pdf", "filename": "textowiki.pdf", "mime": "application/pdf",
            "base64": base64.b64encode(pdf).decode(),
            "markdown": combined, "chapters": chapter_records,
        }

    if fmt == "docx":
        docx = exporters.md_to_docx(combined)
        return {
            "format": "docx", "filename": "textowiki.docx",
            "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "base64": base64.b64encode(docx).decode(),
            "markdown": combined, "chapters": chapter_records,
        }

    if fmt == "zip":
        files: list[tuple[str, str]] = [("index.md", index_md)]
        for c, b in zip(chapters, bodies):
            files.append((f"{c['id']}.md", b))
        files.append(("combined.md", combined))
        zip_bytes = exporters.bundle_zip(files)
        return {
            "format": "zip", "filename": "textowiki.zip", "mime": "application/zip",
            "base64": base64.b64encode(zip_bytes).decode(),
            "markdown": combined, "chapters": chapter_records,
        }

    return {"format": "markdown", "markdown": combined, "chapters": chapter_records}


@app.post("/api/transform")
async def transform(req: TransformRequest):
    if len(req.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Texten är för kort")

    cfg = FORGE.validate(
        length=req.length, detail=req.detail, graphics=req.graphics,
        mode=req.mode, format=req.format,
    )

    resolved = resolve_preset(req.preset, req.preset_variant) if req.preset else None
    if resolved:
        model_slug = resolved["model"] if resolved["model"] in MODELS_BY_SLUG else DEFAULT_MODEL
        model_meta = MODELS_BY_SLUG[model_slug]
        effort = (resolved["effort"] if resolved["effort"] in model_meta["reasoning"]
                  else model_meta["default_reasoning"])
        use_priority = resolved["priority"] and model_meta["supports_priority"]
    else:
        model_slug = req.model if req.model in MODELS_BY_SLUG else DEFAULT_MODEL
        model_meta = MODELS_BY_SLUG[model_slug]
        effort = (req.reasoning_effort if req.reasoning_effort in model_meta["reasoning"]
                  else model_meta["default_reasoning"])
        use_priority = bool(req.priority) and model_meta["supports_priority"]

    text = req.text[:40000]

    if cfg.mode == "single":
        instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg)
        user = f"Omvandla följande text till ett wiki-dokument enligt reglerna:\n\n---\n{text}\n---"
        raw = await _codex_call(
            instructions, user, model_slug, effort,
            req.access_token, req.account_id, use_priority,
            model_meta["supports_verbosity"],
        )
        return _package_single(raw, cfg.format)

    # Multi-chapter: phase 1 outline, phase 2 parallel chapter expansions.
    outline_instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg, phase="outline")
    outline_raw = await _codex_call(
        outline_instructions,
        f"Producera outline + kapitelindex för följande text:\n\n---\n{text}\n---",
        model_slug, effort, req.access_token, req.account_id, use_priority,
        model_meta["supports_verbosity"],
    )
    chapters = _extract_chapter_index(outline_raw)
    if not chapters:
        raise HTTPException(
            status_code=502,
            detail="Outline saknar giltigt kapitelindex (JSON-block med `chapters`).",
        )

    chapter_instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg, phase="chapter")
    chapter_tasks = [
        _codex_call(
            chapter_instructions,
            (f"Kapitel-id: {c['id']}\n"
             f"Kapitel-titel: {c['title']}\n"
             f"Kapitel-syfte: {c.get('purpose','')}\n\n"
             f"Originaltext:\n---\n{text}\n---"),
            model_slug, effort, req.access_token, req.account_id, use_priority,
            model_meta["supports_verbosity"],
        )
        for c in chapters
    ]
    chapter_bodies = await asyncio.gather(*chapter_tasks)
    return _package_multi(outline_raw, chapters, list(chapter_bodies), cfg.format)


# ── Chat (multi-turn) ────────────────────────────────────────────────────────
#
# The chat endpoint is the conversational successor to /api/transform. Each
# request carries the full message history (server remains stateless — the
# client owns storage). First turn = full forge transform. Follow-ups use a
# refinement directive that instructs the model to treat the prior assistant
# message as the working document and respond to the user's latest instruction.

REFINE_DIRECTIVE = """
## Konversationsläge

Det här är en pågående konversation. De tidigare meddelandena visar:
1. Användarens ursprungliga indatatext och parameterval
2. Ditt första svar (wiki-dokumentet)
3. Eventuella uppföljningsfrågor / revideringsinstruktioner

För varje nytt användarmeddelande:

- **Om användaren ber om en revidering** (t.ex. "gör avsnitt 2 längre", "lägg till ett diagram för X", "ändra tonen"): producera ett **helt nytt dokument** som uppfyller instruktionen, följer alla kvalitetsregler ovan, och ersätter det föregående.
- **Om användaren ställer en fråga om innehållet** (t.ex. "vad betyder X?", "varför valde du att inte inkludera Y?"): svara **direkt på frågan** med ett kort konversationsmeddelande (inte ett fullt dokument). Använd då INTE rubriker/executive-summary-struktur.
- **Om användaren ber om en helt ny omvandling** (t.ex. skickar ny text): behandla det som en ny transformation enligt reglerna.

När du producerar ett fullt dokument: respektera de ursprungliga parametrarna (längd, detalj, grafik, format) om användaren inte explicit ber om annat.
"""


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    access_token: str
    account_id: str | None = None
    # Preset OR raw model/reasoning/priority
    preset: str | None = None
    preset_variant: str | None = None
    model: str | None = None
    reasoning_effort: str | None = None
    priority: bool = False
    # Forge parameters — locked at conversation start but passed every turn so
    # the server doesn't need to remember them.
    length: str | None = None
    detail: str | None = None
    graphics: str | None = None
    mode: str | None = None
    format: str | None = None


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages är tom")
    if req.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Sista meddelandet måste vara från användaren")
    last_text = req.messages[-1].content.strip()
    if len(last_text) < 1:
        raise HTTPException(status_code=400, detail="Meddelandet är tomt")

    cfg = FORGE.validate(
        length=req.length, detail=req.detail, graphics=req.graphics,
        mode=req.mode, format=req.format,
    )

    resolved = resolve_preset(req.preset, req.preset_variant) if req.preset else None
    if resolved:
        model_slug = resolved["model"] if resolved["model"] in MODELS_BY_SLUG else DEFAULT_MODEL
        model_meta = MODELS_BY_SLUG[model_slug]
        effort = (resolved["effort"] if resolved["effort"] in model_meta["reasoning"]
                  else model_meta["default_reasoning"])
        use_priority = resolved["priority"] and model_meta["supports_priority"]
    else:
        model_slug = req.model if req.model in MODELS_BY_SLUG else DEFAULT_MODEL
        model_meta = MODELS_BY_SLUG[model_slug]
        effort = (req.reasoning_effort if req.reasoning_effort in model_meta["reasoning"]
                  else model_meta["default_reasoning"])
        use_priority = bool(req.priority) and model_meta["supports_priority"]

    is_first_turn = not any(m.role == "assistant" for m in req.messages)

    # First turn can use multi-chapter flow (outline + parallel chapters). Later
    # turns are always single-document refinements against the most recent
    # assistant response — server doesn't re-split into chapters.
    if is_first_turn and cfg.mode == "multi":
        text = last_text[:40000]
        outline_instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg, phase="outline")
        outline_raw = await _codex_call(
            outline_instructions,
            f"Producera outline + kapitelindex för följande text:\n\n---\n{text}\n---",
            model_slug, effort, req.access_token, req.account_id, use_priority,
            model_meta["supports_verbosity"],
        )
        chapters = _extract_chapter_index(outline_raw)
        if not chapters:
            raise HTTPException(status_code=502,
                detail="Outline saknar giltigt kapitelindex.")
        chapter_instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg, phase="chapter")
        tasks = [
            _codex_call(
                chapter_instructions,
                (f"Kapitel-id: {c['id']}\nKapitel-titel: {c['title']}\n"
                 f"Kapitel-syfte: {c.get('purpose','')}\n\n"
                 f"Originaltext:\n---\n{text}\n---"),
                model_slug, effort, req.access_token, req.account_id, use_priority,
                model_meta["supports_verbosity"],
            )
            for c in chapters
        ]
        bodies = await asyncio.gather(*tasks)
        packaged = _package_multi(outline_raw, chapters, list(bodies), cfg.format)
        packaged["config"] = _config_snapshot(cfg, model_slug, effort, use_priority)
        return packaged

    # Single mode (first turn) or any follow-up: send full history to Codex.
    instructions = CODEX_SYSTEM_PROMPT + "\n\n" + FORGE.compose_prompt(cfg)
    if not is_first_turn:
        instructions += "\n\n---\n\n" + REFINE_DIRECTIVE

    input_items = [_make_input_item(m.role, m.content) for m in req.messages]

    raw = await _codex_call(
        instructions, input_items, model_slug, effort,
        req.access_token, req.account_id, use_priority,
        model_meta["supports_verbosity"],
    )

    packaged = _package_single(raw, cfg.format)
    packaged["config"] = _config_snapshot(cfg, model_slug, effort, use_priority)
    packaged["is_first_turn"] = is_first_turn
    return packaged


def _config_snapshot(cfg, model_slug: str, effort: str, priority: bool) -> dict:
    return {
        "model": model_slug, "reasoning_effort": effort, "priority": priority,
        "length": cfg.length, "detail": cfg.detail, "graphics": cfg.graphics,
        "mode": cfg.mode, "format": cfg.format,
    }


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
