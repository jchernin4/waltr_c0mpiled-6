import io
import os
import time
import multiprocessing as mp
from dataclasses import dataclass
from typing import Optional, List, Tuple

import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://192.168.137.1:3000")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

OCR_TIMEOUT_S = float(os.getenv("OCR_TIMEOUT_S", "2.0"))

MAX_LINES = int(os.getenv("MAX_LINES", "8"))          # cap work per request
MIN_LINE_H = int(os.getenv("MIN_LINE_H", "18"))       # ignore tiny strips
PAD = int(os.getenv("CROP_PAD", "18"))                # padding around ink bbox


def pick_device() -> str:
    forced = os.getenv("OCR_DEVICE")  # set OCR_DEVICE=cpu for stability if needed
    if forced:
        return forced
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def aligned_from_lines(lines: List[str]) -> str:
    clean = [ln.strip() for ln in lines if ln and ln.strip()]
    if not clean:
        return ""
    if len(clean) == 1:
        return clean[0]
    return "\\begin{aligned}\n" + " \\\\\n".join(clean) + "\n\\end{aligned}"


def ocr_worker_loop(conn):
    """
    Child process: loads Pix2Text once, handles requests.
    Parent sends: (req_id:int, image_bytes:bytes)
    Child replies: (req_id:int, latex:str)
    """
    import numpy as np
    import cv2
    from pix2text import Pix2Text

    device = pick_device()
    print("[worker] device:", device, flush=True)

    p2t = Pix2Text.from_config({"device": device, "model_type": "mfr"})

    def pil_from_bytes(b: bytes) -> Image.Image:
        return Image.open(io.BytesIO(b)).convert("RGB")

    def pil_to_gray_np(img: Image.Image) -> np.ndarray:
        rgb = np.array(img)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        return gray

    def ink_bbox(gray: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """
        Find tight bbox around ink. Works for both:
        - white background + dark ink
        - black background + white ink
        """
        mean = float(gray.mean())
        if mean > 127:
            # light background -> dark ink
            mask = (gray < 200).astype(np.uint8)  # ink-ish
        else:
            # dark background -> light ink
            mask = (gray > 55).astype(np.uint8)

        # Clean noise and connect strokes
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

        ys, xs = np.where(mask > 0)
        if len(xs) == 0 or len(ys) == 0:
            return None

        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        return x0, y0, x1 + 1, y1 + 1

    def crop_with_pad(img: Image.Image, box: Tuple[int, int, int, int]) -> Image.Image:
        w, h = img.size
        x0, y0, x1, y1 = box
        x0 = max(0, x0 - PAD)
        y0 = max(0, y0 - PAD)
        x1 = min(w, x1 + PAD)
        y1 = min(h, y1 + PAD)
        return img.crop((x0, y0, x1, y1))

    def split_lines(gray: np.ndarray) -> List[Tuple[int, int]]:
        """
        Fast line segmentation using horizontal projection of an ink mask.
        Returns list of (y0, y1) ranges.
        """
        mean = float(gray.mean())
        if mean > 127:
            ink = (gray < 200).astype(np.uint8)
        else:
            ink = (gray > 55).astype(np.uint8)

        # strengthen strokes for projection
        ink = cv2.dilate(ink, np.ones((5, 25), np.uint8), iterations=1)

        proj = ink.sum(axis=1)  # per-row ink amount
        thresh = max(10, int(0.01 * ink.shape[1]))  # adaptive-ish

        in_run = False
        runs = []
        start = 0
        for y, v in enumerate(proj):
            if v > thresh and not in_run:
                in_run = True
                start = y
            elif v <= thresh and in_run:
                in_run = False
                end = y
                if end - start >= MIN_LINE_H:
                    runs.append((start, end))
        if in_run:
            end = len(proj)
            if end - start >= MIN_LINE_H:
                runs.append((start, end))

        # cap number of lines (top-to-bottom)
        return runs[:MAX_LINES]

    def ocr_multiline(img: Image.Image) -> str:
        """
        Crop to ink bbox, split into lines, OCR each line, join.
        """
        gray = pil_to_gray_np(img)
        box = ink_bbox(gray)
        if box is None:
            return ""

        img2 = crop_with_pad(img, box)
        gray2 = pil_to_gray_np(img2)

        line_ranges = split_lines(gray2)
        if not line_ranges:
            # fallback single crop
            return p2t.recognize_formula(img2).strip()

        lines = []
        rgb2 = np.array(img2)
        for (y0, y1) in line_ranges:
            crop = Image.fromarray(rgb2[y0:y1, :, :])
            latex = p2t.recognize_formula(crop).strip()
            lines.append(latex)

        return aligned_from_lines(lines)

    while True:
        msg = conn.recv()
        if msg is None:
            break

        req_id, img_bytes = msg
        latex = ""
        try:
            img = pil_from_bytes(img_bytes)
            latex = ocr_multiline(img)
        except Exception:
            latex = ""

        conn.send((req_id, latex))


@dataclass
class OCRWorker:
    proc: Optional[mp.Process] = None
    parent_conn: Optional[mp.connection.Connection] = None
    next_id: int = 1

    def start(self):
        if self.proc and self.proc.is_alive():
            return
        parent_conn, child_conn = mp.Pipe()
        proc = mp.Process(target=ocr_worker_loop, args=(child_conn,), daemon=True)
        proc.start()
        self.proc = proc
        self.parent_conn = parent_conn

    def stop(self):
        try:
            if self.parent_conn:
                self.parent_conn.send(None)
        except Exception:
            pass
        if self.proc and self.proc.is_alive():
            self.proc.terminate()
            self.proc.join(timeout=1)
        self.proc = None
        self.parent_conn = None

    def restart(self):
        self.stop()
        self.start()

    def ocr_bytes(self, img_bytes: bytes, timeout_s: float) -> str:
        if not self.proc or not self.proc.is_alive() or not self.parent_conn:
            self.start()

        req_id = self.next_id
        self.next_id += 1

        try:
            self.parent_conn.send((req_id, img_bytes))
        except Exception:
            self.restart()
            return ""

        deadline = time.time() + timeout_s
        while time.time() < deadline:
            if self.parent_conn.poll(0.01):
                try:
                    rid, latex = self.parent_conn.recv()
                    if rid == req_id:
                        return latex or ""
                except Exception:
                    self.restart()
                    return ""

        # HARD timeout: kill & restart
        print("⚠️ OCR timed out -> restarting worker", flush=True)
        self.restart()
        return ""


# ---------------- FastAPI ----------------
try:
    mp.set_start_method("spawn", force=True)
except RuntimeError:
    pass

app = FastAPI(title="Local Math OCR (Pix2Text MFR)")

allow_origins = ["*"] if FRONTEND_ORIGIN == "*" else [FRONTEND_ORIGIN]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    app.state.worker = OCRWorker()
    app.state.worker.start()

@app.on_event("shutdown")
def _shutdown():
    w = getattr(app.state, "worker", None)
    if w:
        w.stop()

@app.get("/health")
def health():
    w = getattr(app.state, "worker", None)
    alive = bool(w and w.proc and w.proc.is_alive())
    return {"ok": True, "worker_alive": alive, "timeout_s": OCR_TIMEOUT_S}

@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    if file.content_type not in ("image/png", "image/jpeg", "image/jpg", "image/webp"):
        raise HTTPException(status_code=415, detail=f"Unsupported content-type: {file.content_type}")

    img_bytes = await file.read()
    if not img_bytes:
        raise HTTPException(status_code=400, detail="Empty upload")

    latex = app.state.worker.ocr_bytes(img_bytes, timeout_s=OCR_TIMEOUT_S)
    return {"latex": latex}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=HOST, port=PORT, reload=False)