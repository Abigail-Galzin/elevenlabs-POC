// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

type LogLevel = "INFO" | "WARNING" | "ERROR";

/**
 * Log a message with a timestamp and level prefix.
 * @param level - Severity level.
 * @param message - The message to log.
 */
export function log(level: LogLevel, message: string): void {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Format a Date as "Month D, YYYY" (e.g., "August 12, 2026").
 */
export function formatDate(date: Date): string {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Create a shuffled copy of an array using the Fisher-Yates algorithm.
 * @param array - The array to shuffle.
 * @returns A new array with elements in random order.
 */
export function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}