/**
 * Convert Jira's document format to plain text
 */
export function jiraDocumentToText(doc: unknown): string {
  if (typeof doc === 'string') {
    return doc;
  }

  if (!doc || typeof doc !== 'object') {
    return '';
  }

  const docObj = doc as {
    content?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; content?: Array<{ text?: string }> }>;
      text?: string;
    }>;
  };

  if (!docObj.content || !Array.isArray(docObj.content)) {
    return '';
  }

  const extractText = (node: {
    type?: string;
    content?: Array<{ type?: string; text?: string; content?: Array<{ text?: string }> }>;
    text?: string;
  }): string => {
    if (node.text) {
      return node.text;
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content
        .map((child) => {
          if (child.text) {
            return child.text;
          }
          if (child.content && Array.isArray(child.content)) {
            return child.content.map((c) => c.text || '').join('');
          }
          return '';
        })
        .join('');
    }

    return '';
  };

  return docObj.content.map(extractText).join('\n').trim();
}




