"use client";

import { ReactSketchCanvas, ReactSketchCanvasRef } from "react-sketch-canvas";
import { useRef, useState } from "react";
import React from "react";
import { BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

export default function Home() {
	const [latex, setLatex] = useState<string | null>(null);
	const canvasRef = useRef<ReactSketchCanvasRef>(null);

	async function sendCanvas() {
		if (!canvasRef.current) return;
		console.log("Exporting canvas and sending to /api/ocr...");
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
	}

	return (
		<div className="grid h-screen w-screen grid-cols-[1fr_auto] grid-rows-[1fr_auto] bg-white dark:bg-black">
			<main className="col-start-1 row-start-1 relative">
				<ReactSketchCanvas
					ref={canvasRef}
					allowOnlyPointerType="all"
					width="100%"
					height="100%"
					canvasColor="transparent"
					strokeColor="#000000"
					style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, touchAction: "none" }}
				/>
			</main>

			{/* Preview area*/}
			<aside className="col-start-2 row-start-1 w-64 bg-zinc-200 dark:bg-zinc-800">
				{latex && <BlockMath math={latex} />}
			</aside>

			{/* LLM Response */}
			<footer className="col-span-2 row-start-2 h-48 bg-zinc-100 dark:bg-zinc-900">
				<button onClick={sendCanvas}>Send</button>
			</footer>
		</div>
	);
}
