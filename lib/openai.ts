import OpenAI from "openai";

const g = globalThis as unknown as { __aicOpenAI?: OpenAI };
export const openai = g.__aicOpenAI ?? (g.__aicOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export const CODE_MODEL = process.env.AIC_CODE_MODEL || "gpt-5.5";
export const CHAT_MODEL = process.env.AIC_CHAT_MODEL || "gpt-5.4-mini";
export const IMAGE_MODEL = process.env.AIC_IMAGE_MODEL || "gpt-image-2";
