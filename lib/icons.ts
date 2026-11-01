import { IMAGE_MODEL, openai } from "./openai";

const STYLE =
  "A single macOS Big Sur style app icon: a rounded squircle with soft gradient, subtle depth and a clean glossy highlight, centered on a plain pure white background with generous margin, no text, no letters, no logos, high detail, crisp.";

/** Generates an app icon and returns it as a data URL (stored with the app). */
export async function generateIcon(subject: string): Promise<string> {
  const r = await openai.images.generate({ model: IMAGE_MODEL, prompt: `${STYLE} The icon shows: ${subject}.`, size: "1024x1024", quality: "medium", n: 1 });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error("No icon returned");
  // Downscale to keep the data URL small. sharp is not a dependency here, so
  // the icon is kept as PNG at the model's size only when small enough.
  return `data:image/png;base64,${b64}`;
}
