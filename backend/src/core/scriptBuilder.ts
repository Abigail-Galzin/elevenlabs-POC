import {
  type ScriptBlock,
  type ScriptBlockType,
  type NewsItem,
  type PodcastScript,
  MAX_BLOCK_CHARS,
  CREDITS_PER_CHAR
} from "../types/index.js";
import { log, formatDate } from "../utils/functions.js";
/**
 * Builds a radio-style podcast script from news items.
 *
 * The script follows the structure:
 *   Intro → News Items (1–3) → Outro
 *
 * Each block is validated to be strictly under MAX_BLOCK_CHARS (249 characters).
 */
export class ScriptBuilder {
  /**
   * Ensure a text block is within the character limit.
   * If the text exceeds MAX_BLOCK_CHARS, it is truncated to MAX_BLOCK_CHARS - 3
   * characters with an ellipsis ("...") appended.
   *
   * @param text - The text to validate/truncate.
   * @param type - The semantic type of the block.
   * @param index - Zero-based index (for news blocks).
   * @returns A validated ScriptBlock.
   */
  static truncateBlock(text: string, type: ScriptBlockType, index?: number): ScriptBlock {
    let result = text;
    if (text.length > MAX_BLOCK_CHARS) {
      result = text.substring(0, MAX_BLOCK_CHARS - 3) + "...";
      log(
        "WARNING",
        `Truncated ${type} block from ${text.length} to ${result.length} characters.`
      );
    }
    return { text: result, type, index };
  }

  /**
   * Build a complete podcast script from news items.
   *
   * @param newsItems - Array of news items (1–3 items expected).
   * @param topic - Optional topic string for the intro message.
   * @returns A PodcastScript with intro, news blocks, and outro.
   */
  static buildScript(newsItems: NewsItem[], topic: string = ""): PodcastScript {
    const now = new Date();
    const dateStr = formatDate(now);
    const today = now.toISOString().split("T")[0];

    // --- Intro Block ---
    const introText = topic
      ? `Welcome to the Daily News Podcast for ${dateStr}. Here are today's top ${topic} stories.`
      : `Welcome to the Daily News Podcast for ${dateStr}. Here are today's top stories.`;
    const intro = ScriptBuilder.truncateBlock(introText, "intro");

    // --- News Item Blocks ---
    const newsBlocks: ScriptBlock[] = newsItems.map((item, i) => {
      const text = `Story ${i + 1}: ${item.headline}. ${item.summary}`;
      return ScriptBuilder.truncateBlock(text, "news", i);
    });

    // --- Outro Block ---
    const outroText =
      "That's all for today's news. This podcast was generated with " +
      "ElevenLabs eleven_flash_v2_5. Stay informed.";
    const outro = ScriptBuilder.truncateBlock(outroText, "outro");

    // --- Calculate Totals ---
    const allBlocks: ScriptBlock[] = [intro, ...newsBlocks, outro];
    const totalChars = allBlocks.reduce(
      (sum: number, block: ScriptBlock) => sum + block.text.length,
      0
    );
    const estimatedCredits = totalChars * CREDITS_PER_CHAR;

    return {
      date: today,
      intro,
      newsItems: newsBlocks,
      outro,
      totalChars,
      estimatedCredits,
    };
  }
}