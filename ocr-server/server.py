import io
import os
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pix2text import Pix2Text

#front end ip
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://192.168.137.1:3000")

HOST = os.getenv("HOST", "0.0.0.0")  # lan
PORT = int(os.getenv("PORT", "8000"))

def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"

device = pick_device()
print("Pix2Text device:", device)

# Load model once
p2t = Pix2Text.from_config({
    "device": device,
    "model_type": "mfr",
})

app = FastAPI(title="Local Math OCR (Pix2Text MFR)")

allow_origins = ["*"] if FRONTEND_ORIGIN == "*" else [FRONTEND_ORIGIN]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True, "device": device}

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bad image: {e}")

    latex = p2t.recognize_formula(img).strip()
    return {"latex": latex}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)