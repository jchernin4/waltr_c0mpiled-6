"use client";

import { ReactSketchCanvas } from "react-sketch-canvas";
import { useEffect } from "react";
import React from "react";

export default function Home() {
	useEffect(() => {
		fetch("/api/ocr", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				text: "2x + 3y = 5"
			})
		});
	}, []);

	return (
		<div className="grid h-screen w-screen grid-cols-[1fr_auto] grid-rows-[1fr_auto] bg-white dark:bg-black">
			<main className="col-start-1 row-start-1">
				<ReactSketchCanvas
					allowOnlyPointerType="all"
					width="100%"
					height="100%"
					canvasColor="transparent"
					strokeColor="#023423"
					style={{ touchAction: "none" }}
				/>
			</main>

			{/* Preview area*/}
			<aside className="col-start-2 row-start-1 w-64 bg-zinc-200 dark:bg-zinc-800">
				<p>Right</p>
			</aside>

			{/* LLM Response */}
			<footer className="col-span-2 row-start-2 h-48 bg-zinc-100 dark:bg-zinc-900">
				<p>Bottom</p>
			</footer>
		</div>
	);
}
