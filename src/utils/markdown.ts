/**
 * Claudian - Markdown Utilities
 *
 * Markdown manipulation helpers.
 */

/** Appends a Markdown snippet to an existing prompt with sensible spacing. */
export function appendMarkdownSnippet(existingPrompt: string, snippet: string): string {
  const trimmedSnippet = snippet.trim();
  if (!trimmedSnippet) {
    return existingPrompt;
  }

  if (!existingPrompt.trim()) {
    return trimmedSnippet;
  }

  const separator = existingPrompt.endsWith('\n\n')
    ? ''
    : existingPrompt.endsWith('\n')
      ? '\n'
      : '\n\n';

  return existingPrompt + separator + trimmedSnippet;
}

function normalizeCliMarkdownSection(section: string): string {
  const lines = section.split('\n');
  const normalized: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimStart();
    const needsLeadingGap = /^(#{1,4}\s|[-*]\s|\d+\.\s|>\s)/.test(trimmed);
    const previousLine = normalized.length > 0 ? normalized[normalized.length - 1] : '';

    if (needsLeadingGap && previousLine.trim() !== '' && previousLine.trim() !== '---') {
      normalized.push('');
    }

    normalized.push(line);
  }

  return normalized.join('\n');
}

/** Lightly improves markdown segmentation for CLI-generated answers without touching fenced code blocks. */
export function normalizeCliAnswerMarkdown(markdown: string): string {
  if (!markdown.trim()) {
    return markdown;
  }

  return markdown
    .replace(/\r\n/g, '\n')
    .split(/(```[\s\S]*?```)/g)
    .map((section) => section.startsWith('```') ? section : normalizeCliMarkdownSection(section))
    .join('');
}
