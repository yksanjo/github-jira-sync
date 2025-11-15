import { describe, it, expect } from 'vitest';
import { jiraDocumentToText } from './jira.js';

describe('jiraDocumentToText', () => {
  it('should handle string input', () => {
    expect(jiraDocumentToText('Simple text')).toBe('Simple text');
  });

  it('should handle null/undefined', () => {
    expect(jiraDocumentToText(null)).toBe('');
    expect(jiraDocumentToText(undefined)).toBe('');
  });

  it('should extract text from Jira document format', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello world',
            },
          ],
        },
      ],
    };

    expect(jiraDocumentToText(doc)).toBe('Hello world');
  });

  it('should handle multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'First paragraph',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Second paragraph',
            },
          ],
        },
      ],
    };

    expect(jiraDocumentToText(doc)).toBe('First paragraph\nSecond paragraph');
  });

  it('should handle nested content', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hello',
            },
            {
              type: 'text',
              text: ' ',
            },
            {
              type: 'text',
              text: 'World',
            },
          ],
        },
      ],
    };

    expect(jiraDocumentToText(doc)).toBe('Hello World');
  });
});

