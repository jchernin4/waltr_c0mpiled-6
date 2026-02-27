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
		<div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
			<main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
				<p>Testing</p>
				<ReactSketchCanvas
					allowOnlyPointerType="all"
					width="70%"
					height="800px"
					canvasColor="transparent"
					strokeColor="#023423"
					style={{ touchAction: "none" }}     // key: apply directly here too
				/>
			</main>
		</div>
	);
}
