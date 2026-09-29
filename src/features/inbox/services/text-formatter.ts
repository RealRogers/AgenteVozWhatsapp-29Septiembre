/**
 * text-formatter.ts — converts standard Markdown (what LLMs emit) into WhatsApp's
 * formatting dialect, deterministically (no LLM involved).
 *
 * WhatsApp formatting:
 *   *bold*        (single asterisk)      — Markdown uses **bold** / __bold__
 *   _italic_      (single underscore)    — same as Markdown
 *   ~strike~      (single tilde)         — Markdown uses ~~strike~~
 *   ```mono```    (triple backtick)      — block monospace
 *
 * WhatsApp has no headings, no markdown links, and bullet lists render best with
 * "- ". We normalise those so messages don't show raw "**", "###" or "[text](url)".
 */

/**
 * Rewrites Markdown emphasis/structure to WhatsApp-friendly equivalents.
 * Safe to run on any outbound text; idempotent for already-WhatsApp text.
 */
export function formatWhatsAppMarkdown(text: string): string {
  if (!text) return text;

  let out = text;

  // 1. Headings (#, ##, …) → bold line. WhatsApp has no headings.
  //    "## Título" → "*Título*"
  out = out.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*$/gm, "*$1*");

  // 2. Bold: **text** / __text__ → *text*. Run before bullet normalisation so a
  //    leading "**" is collapsed before we touch "* " bullets.
  out = out.replace(/\*\*(?=\S)([\s\S]+?)\*\*/g, "*$1*");
  out = out.replace(/__(?=\S)([\s\S]+?)__/g, "*$1*");

  // 3. Strikethrough: ~~text~~ → ~text~
  out = out.replace(/~~(?=\S)([\s\S]+?)~~/g, "~$1~");

  // 4. Markdown links: [text](url) → "text (url)". Bare URLs already autolink.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");

  // 5. Bullet lists: leading "* " or "+ " → "- " (after bold so *bold* is safe;
  //    a bullet always has whitespace after the marker, *bold* does not).
  out = out.replace(/^([ \t]*)[*+][ \t]+/gm, "$1- ");

  return out;
}
