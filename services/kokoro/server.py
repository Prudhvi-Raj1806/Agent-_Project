"""Local Kokoro-82M speech server.

Speaks the same wire format as OpenAI's `POST /v1/audio/speech`, so the app
(or any OpenAI-compatible client) can use it. Everything runs on this PC:
no key, no network once the model weights are downloaded.

Run from this folder:  uv run python server.py
Listens on 127.0.0.1 only (KOKORO_PORT, default 8880).
"""

import io
import os
import re
import threading
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, Response
from kokoro import KPipeline
from pydantic import BaseModel, Field

SAMPLE_RATE = 24_000
MAX_INPUT_CHARS = 4_096
DEFAULT_VOICE = "af_heart"
HOST = "127.0.0.1"
PORT = int(os.environ.get("KOKORO_PORT", "8880"))

# The 54 voices in hexgrad/Kokoro-82M. The first letter is the language code
# KPipeline needs: a American English, b British, e Spanish, f French, h Hindi,
# i Italian, j Japanese, p Brazilian Portuguese, z Mandarin.
VOICES = [
    "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova",
    "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam",
    "am_michael", "am_onyx", "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex", "em_santa", "ff_siwis",
    "hf_alpha", "hf_beta", "hm_omega", "hm_psi", "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune",
    "jf_nezumi", "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei",
    "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
]
VOICE_SET = set(VOICES)

# OpenAI's voice names (what generic clients send) all map to the default voice.
OPENAI_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse",
    "marin", "cedar", "default",
}

_pipelines: dict[str, KPipeline] = {}
_lock = threading.Lock()  # the model is not safe to run from two threads at once


def pipeline_for(lang_code: str) -> KPipeline:
    if lang_code not in _pipelines:
        _pipelines[lang_code] = KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")
    return _pipelines[lang_code]


def resolve_voice(requested: str) -> str:
    """A known Kokoro voice id, else the default for OpenAI names. Anything else is refused."""
    voice = requested.strip().lower()
    if voice in OPENAI_VOICES:
        return DEFAULT_VOICE
    if voice not in VOICE_SET:
        raise HTTPException(status_code=400, detail=f"Unknown voice '{requested[:40]}'. See GET /v1/voices.")
    return voice


def synthesize(text: str, voice: str, speed: float) -> np.ndarray:
    with _lock:
        pipeline = pipeline_for(voice[0])
        parts = []
        for result in pipeline(text, voice=voice, speed=speed, split_pattern=r"\n+"):
            audio = result.audio if hasattr(result, "audio") else result[2]
            if audio is not None:
                parts.append(audio.detach().cpu().numpy())
    if not parts:
        raise HTTPException(status_code=422, detail="Nothing to speak in that text.")
    return np.concatenate(parts)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the English pipeline (and download the weights on first run) before
    # the server answers, so a passing /health means the first line will be fast.
    with _lock:
        pipeline_for("a")
    yield


app = FastAPI(title="Veda Kokoro", lifespan=lifespan)


class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str = Field(..., min_length=1, max_length=MAX_INPUT_CHARS)
    voice: str = DEFAULT_VOICE
    response_format: str = "wav"
    speed: float = Field(1.0, ge=0.5, le=2.0)


@app.get("/health")
def health():
    return {"status": "ok", "model": "Kokoro-82M", "sample_rate": SAMPLE_RATE}


@app.get("/v1/voices")
def voices():
    return {"voices": VOICES, "default": DEFAULT_VOICE}


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest):
    fmt = req.response_format.lower()
    if fmt not in ("wav", "mp3"):
        raise HTTPException(status_code=400, detail="response_format must be wav or mp3.")
    text = req.input.strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is empty.")

    audio = synthesize(text, resolve_voice(req.voice), req.speed)
    buffer = io.BytesIO()
    if fmt == "mp3":
        sf.write(buffer, audio, SAMPLE_RATE, format="MP3")
        media_type = "audio/mpeg"
    else:
        sf.write(buffer, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        media_type = "audio/wav"
    return Response(content=buffer.getvalue(), media_type=media_type)


@app.exception_handler(Exception)
async def unexpected(_request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": {"message": f"{type(exc).__name__}: {exc}"}})


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")
