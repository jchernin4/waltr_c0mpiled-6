"use client";

import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import "./globals.css";

export default function Home() {
	const [latex, setLatex] = useState<string | null>(null);
	const [erasing, setErasing] = useState(false);
	const [strokeWidth, setStrokeWidth] = useState(4);
	const [eraserWidth, setEraserWidth] = useState(16);
	const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
	const canvasRef = useRef<ReactSketchCanvasRef>(null);
	const isDirty = useRef(false);

	function toggleEraser() {
		const next = !erasing;
		setErasing(next);
		canvasRef.current?.eraseMode(next);
	}

	useEffect(() => {
		const interval = setInterval(async () => {
			if (!isDirty.current || !canvasRef.current) return;
			isDirty.current = false;
			const dataUrl = await canvasRef.current.exportImage("png");
			const res = await fetch(dataUrl);
			const blob = await res.blob();
			const formData = new FormData();
			formData.append("file", blob, "canvas.png");
			const response = await fetch("http://192.168.137.129:8000/ocr", {
				method: "POST",
				body: formData,
			});
			const data = await response.json();
			setLatex(data.latex);
		}, 2000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="grid h-screen w-screen grid-cols-[1fr_auto] grid-rows-[1fr_auto] bg-white dark:bg-black">
			<main className="col-start-1 row-start-1 relative">
				<div
					className="sketchWrap absolute inset-0"
					style={{ cursor: erasing ? "none" : "default" }}
					onContextMenu={(e) => e.preventDefault()}
					onPointerMove={(e) => {
						const rect = e.currentTarget.getBoundingClientRect();
						setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
					}}
					onPointerLeave={() => setCursorPos(null)}
				>
					<ReactSketchCanvas
						ref={canvasRef}
						allowOnlyPointerType="pen"
						width="100%"
						height="100%"
						canvasColor="transparent"
						strokeColor="#ffffff"
						strokeWidth={strokeWidth}
						eraserWidth={eraserWidth}
						style={{ touchAction: "none" }}
						onChange={() => { isDirty.current = true; }}
					/>
					{erasing && cursorPos && (
						<div style={{
							position: "absolute",
							left: cursorPos.x,
							top: cursorPos.y,
							width: eraserWidth,
							height: eraserWidth,
							transform: "translate(-50%, -50%)",
							border: "2px solid white",
							borderRadius: "50%",
							pointerEvents: "none",
						}} />
					)}
				</div>
			</main>

			{/* Preview area*/}
			<aside className="col-start-2 row-start-1 w-64 bg-zinc-200 dark:bg-zinc-800">
				{latex && <BlockMath math={latex} />}
			</aside>

			{/* LLM Response */}
			<footer className="col-span-2 row-start-2 h-48 bg-zinc-100 dark:bg-zinc-900 flex items-center gap-6 px-6">
				<button onClick={toggleEraser}>{erasing ? "Pen" : "Eraser"}</button>
				<label className="flex items-center gap-2">
					Pen size
					<input type="range" min={1} max={32} value={strokeWidth}
						onChange={(e) => setStrokeWidth(Number(e.target.value))} />
					{strokeWidth}px
				</label>
				<label className="flex items-center gap-2">
					Eraser size
					<input type="range" min={1} max={64} value={eraserWidth}
						onChange={(e) => setEraserWidth(Number(e.target.value))} />
					{eraserWidth}px
				</label>
			</footer>
		</div>
	);
}
