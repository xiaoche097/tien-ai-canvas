import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

export function CreationTypewriter({ messages, loop = true, className = "" }: { messages: readonly string[]; loop?: boolean; className?: string }) {
    const reducedMotion = useReducedMotion();
    const [text, setText] = useState("");
    useEffect(() => {
        if (reducedMotion || !messages.length) return;
        let message = 0;
        let length = 0;
        let deleting = false;
        let timer: ReturnType<typeof setTimeout>;
        setText("");
        const tick = () => {
            const letters = Array.from(messages[message]);
            length += deleting ? -1 : 1;
            setText(letters.slice(0, length).join(""));
            let delay = deleting ? 32 : 85;
            if (length === letters.length) {
                if (!loop) return;
                deleting = true;
                delay = 2400;
            } else if (length === 0) {
                deleting = false;
                message = (message + 1) % messages.length;
                delay = 450;
            }
            timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, 250);
        return () => clearTimeout(timer);
    }, [messages, loop, reducedMotion]);
    return <span className={`creation-typewriter ${className}`} data-typewriter aria-hidden="true">{reducedMotion ? messages[0] : text}</span>;
}

export const creationPromptHints = {
    image: ["描述一个画面，让想象成为作品", "添加一张参考图，延续你喜欢的风格", "从人物、场景和光线开始创作"],
    video: ["描述一个镜头，让故事动起来", "添加参考图，设计下一段电影画面", "告诉我镜头的运动、光线与节奏"],
    text: ["从一个想法开始，和境彻一起创作", "写下一个角色，展开一段新的故事", "让 Agent 帮你梳理分镜与创作方向"],
} as const;

export const creationAgentHeading = ["不止回答，把想法落到画布上"] as const;
