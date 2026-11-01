import OpenAI from "openai";

const g = globalThis as unknown as { __aicOpenAI?: OpenAI };

// Built on first use, so the desktop and the shipped template apps work without a key;
// only generating an app, "Improve" and aic.ask need OPENAI_API_KEY.
function client(): OpenAI {
  return g.__aicOpenAI ?? (g.__aicOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

export const openai = new Proxy({} as OpenAI, { get: (_t, prop) => Reflect.get(client(), prop) });

export const CODE_MODEL = process.env.AIC_CODE_MODEL || "gpt-5.5";
export const CHAT_MODEL = process.env.AIC_CHAT_MODEL || "gpt-5.4-mini";
export const IMAGE_MODEL = process.env.AIC_IMAGE_MODEL || "gpt-image-2";
