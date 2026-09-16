/**
 * Client-side entry point for AI features.
 *
 * All generation goes through the server's /api/ai/generate proxy so that the
 * Gemini API key never reaches the browser. Previously each page constructed
 * `new GoogleGenAI({ apiKey: process.env.API_KEY })`, and vite's `define`
 * inlined the real key into the production bundle as a plain string.
 */

export interface GenerateOptions {
  /** Must be one of the models the server allowlists; otherwise it falls back. */
  model?: string;
  contents: string;
  config?: Record<string, unknown>;
}

/**
 * Generates text and returns it. Throws on failure so callers can surface the
 * error the same way they did with the direct SDK call.
 */
export async function generateContent({ model, contents, config }: GenerateOptions): Promise<string> {
  const token = localStorage.getItem('niyagama_token');

  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}`, 'X-Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model, contents, config }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`AI service returned an unreadable response (HTTP ${response.status}).`);
  }

  if (!response.ok || payload?.status !== 'success') {
    throw new Error(payload?.message || `AI request failed (HTTP ${response.status}).`);
  }

  return payload.data?.text ?? '';
}
