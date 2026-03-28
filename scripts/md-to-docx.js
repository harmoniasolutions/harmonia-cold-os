const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} = require('docx');

// Read the markdown file
const mdPath = process.argv[2] || path.join(__dirname, '..', 'website-copy.md');
const outputPath = process.argv[3] || mdPath.replace('.md', '.docx');

const markdown = fs.readFileSync(mdPath, 'utf8');

// Parse markdown into document elements
function parseMarkdown(md) {
  const lines = md.split('\n');
  const children = [];
  let inTable = false;
  let tableRows = [];
  let inCodeBlock = false;
  let codeLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeLines.join('\n'),
                font: 'Courier New',
                size: 20,
              }),
            ],
            spacing: { before: 200, after: 200 },
          })
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator rows
      if (line.match(/^\|[\s\-:|]+\|$/)) continue;

      const cells = line.split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells.map(c => c.trim()));
      continue;
    } else if (inTable) {
      // End of table
      if (tableRows.length > 0) {
        const table = new Table({
          rows: tableRows.map((row, rowIdx) =>
            new TableRow({
              children: row.map(cell =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: cell,
                          bold: rowIdx === 0,
                          size: 22,
                        }),
                      ],
                    }),
                  ],
                  width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
                })
              ),
            })
          ),
          width: { size: 100, type: WidthType.PERCENTAGE },
        });
        children.push(table);
        children.push(new Paragraph({ text: '' }));
      }
      inTable = false;
      tableRows = [];
    }

    // Skip empty lines but add spacing
    if (line.trim() === '') {
      continue;
    }

    // Horizontal rules
    if (line.match(/^-{3,}$/)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '─'.repeat(50) })],
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    // Headings
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^# /, ''),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }
    if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^## /, ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }
    if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^### /, ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 250, after: 100 },
        })
      );
      continue;
    }

    // Blockquotes
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s*/, '');
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: quoteText,
              italics: true,
              size: 24,
            }),
          ],
          indent: { left: 720 },
          spacing: { before: 100, after: 100 },
        })
      );
      continue;
    }

    // List items
    if (line.match(/^[-*✅❌🔷⚡📋📅⭐🎁🛡️⚠️]\s/) || line.match(/^\d+\.\s/)) {
      const text = line.replace(/^[-*✅❌🔷⚡📋📅⭐🎁🛡️⚠️]\s/, '').replace(/^\d+\.\s/, '');
      children.push(
        new Paragraph({
          children: parseInlineFormatting(text),
          bullet: { level: 0 },
          spacing: { before: 50, after: 50 },
        })
      );
      continue;
    }

    // Regular paragraphs with inline formatting
    children.push(
      new Paragraph({
        children: parseInlineFormatting(line),
        spacing: { before: 100, after: 100 },
      })
    );
  }

  return children;
}

// Parse bold, italic, inline code
function parseInlineFormatting(text) {
  const runs = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold + Italic
    let match = remaining.match(/^\*\*\*(.*?)\*\*\*/);
    if (match) {
      runs.push(new TextRun({ text: match[1], bold: true, italics: true, size: 24 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Bold
    match = remaining.match(/^\*\*(.*?)\*\*/);
    if (match) {
      runs.push(new TextRun({ text: match[1], bold: true, size: 24 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Italic
    match = remaining.match(/^\*(.*?)\*/);
    if (match) {
      runs.push(new TextRun({ text: match[1], italics: true, size: 24 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Inline code
    match = remaining.match(/^`(.*?)`/);
    if (match) {
      runs.push(new TextRun({ text: match[1], font: 'Courier New', size: 22 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Links [text](url) - just show text
    match = remaining.match(/^\[(.*?)\]\(.*?\)/);
    if (match) {
      runs.push(new TextRun({ text: match[1], color: '0066CC', underline: {}, size: 24 }));
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Regular text - find next special character
    const nextSpecial = remaining.search(/[\*`\[]/);
    if (nextSpecial === -1) {
      runs.push(new TextRun({ text: remaining, size: 24 }));
      break;
    } else if (nextSpecial === 0) {
      // Special char but no match - treat as regular
      runs.push(new TextRun({ text: remaining[0], size: 24 }));
      remaining = remaining.slice(1);
    } else {
      runs.push(new TextRun({ text: remaining.slice(0, nextSpecial), size: 24 }));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: text, size: 24 })];
}

// Create document
const doc = new Document({
  sections: [
    {
      properties: {},
      children: parseMarkdown(markdown),
    },
  ],
});

// Write file
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
});
