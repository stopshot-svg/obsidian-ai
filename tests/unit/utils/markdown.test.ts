import { appendMarkdownSnippet, normalizeCliAnswerMarkdown } from '@/utils/markdown';

describe('appendMarkdownSnippet', () => {
  it('returns existing prompt when snippet is empty', () => {
    expect(appendMarkdownSnippet('Hello', '')).toBe('Hello');
  });

  it('returns existing prompt when snippet is whitespace only', () => {
    expect(appendMarkdownSnippet('Hello', '   \n  ')).toBe('Hello');
  });

  it('returns trimmed snippet when existing prompt is empty', () => {
    expect(appendMarkdownSnippet('', '  Hello  ')).toBe('Hello');
  });

  it('returns trimmed snippet when existing prompt is whitespace only', () => {
    expect(appendMarkdownSnippet('   ', '  Hello  ')).toBe('Hello');
  });

  it('adds double newline separator when prompt does not end with newline', () => {
    expect(appendMarkdownSnippet('First', 'Second')).toBe('First\n\nSecond');
  });

  it('adds single newline when prompt ends with one newline', () => {
    expect(appendMarkdownSnippet('First\n', 'Second')).toBe('First\n\nSecond');
  });

  it('adds no separator when prompt ends with double newline', () => {
    expect(appendMarkdownSnippet('First\n\n', 'Second')).toBe('First\n\nSecond');
  });

  it('trims the snippet before appending', () => {
    expect(appendMarkdownSnippet('First', '  Second  ')).toBe('First\n\nSecond');
  });
});

describe('normalizeCliAnswerMarkdown', () => {
  it('adds blank lines before numbered items and headings', () => {
    expect(normalizeCliAnswerMarkdown('结论如下\n1. 第一项\n2. 第二项\n## 后续'))
      .toBe('结论如下\n\n1. 第一项\n\n2. 第二项\n\n## 后续');
  });

  it('preserves fenced code blocks', () => {
    const input = '说明\n```md\n1. keep\n## keep\n```\n1. 列表';
    const output = normalizeCliAnswerMarkdown(input);
    expect(output).toContain('```md\n1. keep\n## keep\n```');
    expect(output).toContain('```\n1. 列表');
  });
});
