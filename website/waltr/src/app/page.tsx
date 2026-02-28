"use client";

import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";
import { useEffect, useRef, useState } from "react";
import OpenAI from "openai";
import React from "react";
import { BlockMath } from "react-katex";
import "katex/dist/katex.min.css";
import "./globals.css";

export default function Home() {
	const [latex, setLatex] = useState<string | null>(null);
	const [context, setContext] = useState<string>("Solve this derivative problem. d/dx (2x^3 + cos(x) - 3)");
	const [llmResponse, setLlmResponse] = useState<string | null>(null);
	const [llmLoading, setLlmLoading] = useState(false);
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

	async function handleHelp() {
		if (!latex) return;
		setLlmLoading(true);
		setLlmResponse(null);
		// Unlock iOS speech synthesis synchronously within the user gesture
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
		const userMessage = [
			context ? `Problem context: ${context}` : null,
			`LaTeX expression: ${latex}`,
		].filter(Boolean).join("\n");
		const client = new OpenAI({
			apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
			dangerouslyAllowBrowser: true,
		});
		const completion = await client.chat.completions.create({
			model: "gpt-5-mini",
			messages: [
				{ role: "system", content: "You are Waltr, a friendly math tutor helping a student work through a handwritten math problem. The student's work has been scanned via OCR and converted to LaTeX, so minor misreads may exist (e.g., x vs X, 1 vs l, missing exponents) — use surrounding context to infer intent and never mention this process to the user. Your goal is to guide the student to the answer themselves — never solve the problem for them or reveal the next step outright. Give only the smallest possible hint that moves them forward: a gentle nudge, a question to consider, or a reminder of a relevant concept — never a full step or solution. If their work so far is correct, affirm it briefly and give only a tiny hint toward what comes next. If there's a mistake, vaguely nudge them toward re-examining their work without pointing directly at the error. If the input is ambiguous, pick the most reasonable mathematical interpretation and run with it. Do not ask follow-up questions, as the student cannot respond. End your response when you've given them something actionable — do not add filler. Keep responses to 2 to 4 sentences unless the problem genuinely requires more. Use plain conversational text with no bullet points or formatting." },
				{ role: "user", content: userMessage },
			],
		});
		const text = completion.choices[0]?.message?.content ?? "No response.";
		setLlmResponse(text);
		setLlmLoading(false);
		const utterance = new SpeechSynthesisUtterance(text);
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(utterance);
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
		<div className="grid h-screen w-screen grid-cols-[1fr_auto] grid-rows-[auto_auto_auto_1fr_auto] bg-white">
			{/* Site name */}
			<div className="col-span-2 row-start-1 px-6 pt-4 pb-1 bg-zinc-100 dark:bg-zinc-900">
				<h1 className="text-2xl font-bold tracking-tight">Waltr</h1>
			</div>

			{/* Context box */}
			<div className="col-span-2 row-start-2 px-6 pt-2 pb-2 bg-zinc-100 dark:bg-zinc-900">
				<textarea
					placeholder="Add context..."
					value={context}
					onChange={(e) => setContext(e.target.value)}
					rows={4}
					className="w-full px-3 py-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm resize-none"
				/>
			</div>

			{/* Toolbar */}
			<header className="col-span-2 row-start-3 bg-zinc-100 dark:bg-zinc-900 flex items-center gap-6 px-6 pb-2">
				<button onClick={toggleEraser}>{erasing ? "Pen" : "Eraser"}</button>
				<button onClick={handleHelp} disabled={!latex || llmLoading}>
					{llmLoading ? "Thinking..." : "Help"}
				</button>
				<button onClick={async () => {
					if (!canvasRef.current) return;
					const dataUrl = await canvasRef.current.exportImage("png");
					const a = document.createElement("a");
					a.href = dataUrl;
					a.download = "canvas.png";
					a.click();
				}}>Save Image</button>
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
			</header>

			<main className="col-start-1 row-start-4 relative">
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
						canvasColor="#000000"
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
			<aside className="col-start-2 row-start-4 w-64 bg-zinc-200 dark:bg-zinc-800">
				{latex && <BlockMath math={latex} />}
			</aside>

			{/* LLM Response */}
			<footer className="col-span-2 row-start-5 h-48 bg-zinc-100 dark:bg-zinc-900 overflow-y-auto px-6 py-4 text-md">
				{llmResponse ?? <span className="text-zinc-400">Response will appear here.</span>}
			</footer>
		</div>
	);
}
