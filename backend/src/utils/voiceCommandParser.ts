import { VoiceCommand } from "../types/index.js";
/**
 * Parses transcribed text from scribe_v1 to extract a topic keyword.
 *
 * Uses prefix matching to support partial words (e.g., "tech" matches "technology").
 */
export class VoiceCommandParser {
  private static readonly TOPIC_KEYWORDS: ReadonlyArray<{
    keyword: string;
    topic: string;
  }> = [
      { keyword: "tech", topic: "technology" },
      { keyword: "technology", topic: "technology" },
      { keyword: "sport", topic: "sports" },
      { keyword: "politic", topic: "politics" },
      { keyword: "busines", topic: "business" },
      { keyword: "scienc", topic: "science" },
      { keyword: "entertain", topic: "entertainment" },
      { keyword: "health", topic: "health" },
      { keyword: "healthcare", topic: "health" },
    ];

  /**
   * Parse a transcript string into a VoiceCommand.
   * @param transcript - The raw transcribed text.
   * @returns A VoiceCommand with the extracted topic (empty string if none found).
   */
  static parse(transcript: string): VoiceCommand {
    const lowerTranscript = transcript.toLowerCase().trim();
    let topic = "";

    for (const { keyword, topic: mappedTopic } of VoiceCommandParser.TOPIC_KEYWORDS) {
      if (lowerTranscript.includes(keyword)) {
        topic = mappedTopic;
        break;
      }
    }

    return {
      transcript,
      topic,
      confidence: 0.8,
      isVoice: true,
    };
  }
}
