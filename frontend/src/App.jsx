
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import DragonScene from "./components/DragonScene.jsx";
import "./App.css";

const initialForm = {
  subject: "",
  academic_level: "Undergraduate",
  question: "",
  answer: "",
};

const sampleForm = {
  subject: "Introduction to Artificial Intelligence",
  academic_level: "Undergraduate",
  question:
    "Explain what Artificial Intelligence is. Discuss its major applications and the difference between narrow AI and general AI.",
  answer:
    "Artificial Intelligence is a branch of computer science that focuses on making machines intelligent so they can perform tasks that normally require human intelligence. These tasks include learning, reasoning, problem solving and understanding language. AI is used in healthcare for disease detection, in education for personalized learning, in banking for fraud detection and in transportation for self-driving cars. Narrow AI is designed to perform a specific task, such as voice recognition or recommendations. General AI would be capable of performing many different intellectual tasks like a human being.",
};

function renderInlineMarkdown(text) {
  return String(text ?? "").split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part.replace(/`([^`]+)`/g, "$1");
  });
}

function renderImprovedAnswer(content) {
  return (
    <div className="markdown-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {String(content ?? "")}
      </ReactMarkdown>
    </div>
  );
}


function ImageFilePreview({ file, onRemove }) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const imageUrl = URL.createObjectURL(file);
    setPreview(imageUrl);

    return () => URL.revokeObjectURL(imageUrl);
  }, [file]);

  return (
    <div className="image-preview-card">
      {preview && (
        <img src={preview} alt={file.name} className="image-preview" />
      )}
      <div className="image-preview-info">
        <span>{file.name}</span>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}


function App() {
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [reportSubmission, setReportSubmission] = useState(null);

    // Evaluation engine
  const [evaluationEngine, setEvaluationEngine] = useState("groq");

  // Kaizenly V1 inputs and results
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [markScheme, setMarkScheme] = useState("");
  const [finetunedFeedback, setFinetunedFeedback] = useState(null);

  const [backendStatus, setBackendStatus] = useState("checking");
  const [handwritingNotice, setHandwritingNotice] = useState(false);
  // Image-based assignment submission
  const [submissionMode, setSubmissionMode] = useState("text");
  const [questionImage, setQuestionImage] = useState(null);
  const [answerImages, setAnswerImages] = useState([]);
  const [uploadError, setUploadError] = useState("");
  const [ocrReady, setOcrReady] = useState(false);

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_ANSWER_IMAGES = 5;
  const questionImageInputRef = useRef(null);

  const wordCount = useMemo(() => {
    return formData.answer.trim()
      ? formData.answer.trim().split(/\s+/).length
      : 0;
  }, [formData.answer]);

  useEffect(() => {
    let mounted = true;
    const apiUrl = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

    async function checkBackend() {
      try {
        const response = await fetch(`${apiUrl}/health`, { method: "GET" });
        if (mounted) setBackendStatus(response.ok ? "online" : "offline");
      } catch {
        if (mounted) setBackendStatus("offline");
      }
    }

    checkBackend();
    const intervalId = window.setInterval(checkBackend, 20000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
    setError("");
  }
  function validateImage(file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      return "Only JPG, PNG and WEBP images are supported.";
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return "Each image must be smaller than 10 MB.";
    }

    return "";
  }

  function handleQuestionImage(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const validationError = validateImage(file);

    if (validationError) {
      setUploadError(validationError);
      event.target.value = "";
      return;
    }

    setQuestionImage(file);
    setOcrReady(false);
    setUploadError("");
    setError("");
  }

  function handleAnswerImages(event) {
    const selectedFiles = Array.from(event.target.files || []);

    if (!selectedFiles.length) return;

    const validationError = selectedFiles
      .map(validateImage)
      .find(Boolean);

    if (validationError) {
      setUploadError(validationError);
      event.target.value = "";
      return;
    }

    if (answerImages.length + selectedFiles.length > MAX_ANSWER_IMAGES) {
      setUploadError("You can upload a maximum of 5 answer pages.");
      event.target.value = "";
      return;
    }

    setAnswerImages((previous) => [...previous, ...selectedFiles]);
    setOcrReady(false);
    setUploadError("");
    setError("");
    event.target.value = "";
  }

  function removeQuestionImage() {
    setQuestionImage(null);
    setOcrReady(false);

    if (questionImageInputRef.current) {
      questionImageInputRef.current.value = "";
    }
  }

  function removeAnswerImage(index) {
    setAnswerImages((previous) =>
      previous.filter((_, i) => i !== index)
    );
    setOcrReady(false);
  }

  function loadSample() {
    setSubmissionMode("text");
    setQuestionImage(null);
    setAnswerImages([]);
    setUploadError("");
    setFormData(sampleForm);
    setFeedback(null);

    setFinetunedFeedback(null);
    setReferenceAnswer("");
    setMarkScheme("");

    setReportSubmission(null);
    setError("");
    setOcrReady(false);
  }

  function clearForm() {
    setSubmissionMode("text");
    setQuestionImage(null);
    setAnswerImages([]);
    setUploadError("");
    setFormData(initialForm);
    setError("");
    setHandwritingNotice(false);
    setOcrReady(false);

    setFeedback(null);

    setFinetunedFeedback(null);
    setReferenceAnswer("");
    setMarkScheme("");

    setReportSubmission(null);
  }

  function handleDownloadPDF() {
    if (!feedback) return;
    const submitted = reportSubmission || formData;

    const doc = new jsPDF({ compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - 18;
    let y = 20;

    function normalizeText(value) {
      return String(value ?? "")
        .replace(/[–—−]/g, "-")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/•/g, "-")
        .replace(/\u00a0/g, " ")
        .replace(/\u2011/g, "-")
        .replace(/\u2026/g, "...")
        .replace(/\u2192/g, "->")
        .replace(/[^\x20-\x7E\n\r\t]/g, "");
    }

    function cleanText(value) {
      return normalizeText(value).replace(/\s+$/g, "");
    }

    function ensureSpace(requiredHeight = 12) {
      if (y + requiredHeight > bottomLimit) {
        doc.addPage();
        y = 20;
      }
    }

    function addText(text, options = {}) {
      const {
        fontSize = 10,
        bold = false,
        indent = 0,
        color = [70, 73, 95],
        gap = 5,
        keepWithNext = false,
      } = options;

      const cleaned = cleanText(text);
      if (!cleaned.trim()) return;

      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);

      const availableWidth = pageWidth - 2 * margin - indent;
      const lines = doc.splitTextToSize(cleaned, availableWidth);
      const lineHeight = fontSize * 0.52;
      const required = lines.length * lineHeight + gap + (keepWithNext ? 7 : 0);
      ensureSpace(Math.min(required, pageHeight - 38));

      lines.forEach((line) => {
        if (y + lineHeight > bottomLimit) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin + indent, y);
        y += lineHeight;
      });
      y += gap;
    }

    function estimateTextHeight(text, options = {}) {
      const { fontSize = 10, indent = 0, gap = 5, bold = false } = options;
      const cleaned = cleanText(text);
      if (!cleaned.trim()) return 0;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin - indent);
      return lines.length * fontSize * 0.52 + gap;
    }

    function parseInlineMarkdown(value) {
      const source = String(value ?? "");
      const tokenPattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g;
      const runs = [];
      let cursor = 0;
      let match;

      while ((match = tokenPattern.exec(source)) !== null) {
        if (match.index > cursor) {
          runs.push({ text: normalizeText(source.slice(cursor, match.index)), bold: false, italic: false });
        }

        const token = match[0];
        let text = token;
        let bold = false;
        let italic = false;

        if (token.startsWith("***") && token.endsWith("***")) {
          text = token.slice(3, -3);
          bold = true;
          italic = true;
        } else if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
          text = token.slice(2, -2);
          bold = true;
        } else if (token.startsWith("*") || token.startsWith("_")) {
          text = token.slice(1, -1);
          italic = true;
        } else if (token.startsWith("`")) {
          text = token.slice(1, -1);
          bold = true;
        }

        runs.push({ text: normalizeText(text), bold, italic });
        cursor = match.index + token.length;
      }

      if (cursor < source.length) {
        runs.push({ text: normalizeText(source.slice(cursor)), bold: false, italic: false });
      }

      return runs.filter((run) => run.text.length > 0);
    }

    function fontStyle(run = {}) {
      if (run.bold && run.italic) return "bolditalic";
      if (run.bold) return "bold";
      if (run.italic) return "italic";
      return "normal";
    }

    function runWidth(text, run, fontSize) {
      doc.setFont("helvetica", fontStyle(run));
      doc.setFontSize(fontSize);
      return doc.getTextWidth(text);
    }

    function wrapRuns(runs, maxWidth, fontSize) {
      const lines = [[]];
      let lineWidth = 0;

      runs.forEach((run) => {
        const pieces = run.text.match(/\s+|[^\s]+/g) || [];
        pieces.forEach((piece) => {
          const isWhitespace = /^\s+$/.test(piece);
          if (isWhitespace && lines[lines.length - 1].length === 0) return;

          const width = runWidth(piece, run, fontSize);
          if (!isWhitespace && lineWidth > 0 && lineWidth + width > maxWidth) {
            lines.push([]);
            lineWidth = 0;
          }

          if (!isWhitespace && width > maxWidth) {
            const chunks = doc.splitTextToSize(piece, maxWidth);
            chunks.forEach((chunk, chunkIndex) => {
              if (chunkIndex > 0) {
                lines.push([]);
                lineWidth = 0;
              }
              lines[lines.length - 1].push({ ...run, text: chunk });
              lineWidth += runWidth(chunk, run, fontSize);
            });
          } else {
            lines[lines.length - 1].push({ ...run, text: piece });
            lineWidth += width;
          }
        });
      });

      while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
      return lines;
    }

    function estimateRichTextHeight(runs, options = {}) {
      const { fontSize = 9.5, indent = 0, gap = 4 } = options;
      if (!runs.length) return 0;
      const lines = wrapRuns(runs, contentWidth - indent, fontSize);
      return lines.length * fontSize * 0.56 + gap;
    }

    function drawRichLine(parts, x, baseline, fontSize, color) {
      let currentX = x;
      parts.forEach((part) => {
        if (!part.text) return;
        doc.setFont("helvetica", fontStyle(part));
        doc.setFontSize(fontSize);
        doc.setTextColor(...color);
        doc.text(part.text, currentX, baseline);
        currentX += doc.getTextWidth(part.text);
      });
    }

    function addRichText(runs, options = {}) {
      const {
        fontSize = 9.5,
        indent = 0,
        color = [70, 73, 95],
        gap = 4,
        keepWithNext = false,
      } = options;
      if (!runs.length) return;

      const lineHeight = fontSize * 0.56;
      const lines = wrapRuns(runs, contentWidth - indent, fontSize);
      const estimatedHeight = lines.length * lineHeight + gap + (keepWithNext ? 5 : 0);
      ensureSpace(Math.min(estimatedHeight, pageHeight - 38));

      lines.forEach((line) => {
        if (y + lineHeight > bottomLimit) {
          doc.addPage();
          y = 20;
        }
        drawRichLine(line, margin + indent, y, fontSize, color);
        y += lineHeight;
      });
      y += gap;
    }

    function addSection(title, content) {
      if (!content) return;
      const titleHeight = estimateTextHeight(title, {
        fontSize: 12,
        bold: true,
        gap: 3,
      });
      const contentHeight = estimateTextHeight(content, {
        fontSize: 10,
        gap: 7,
      });
      ensureSpace(titleHeight + Math.min(contentHeight, 30) + 2);
      addText(title, {
        fontSize: 12,
        bold: true,
        color: [91, 76, 190],
        gap: 3,
        keepWithNext: true,
      });
      addText(content, { fontSize: 10, gap: 7 });
    }

    function addListSection(title, items) {
      if (!Array.isArray(items) || items.length === 0) return;
      const titleHeight = estimateTextHeight(title, {
        fontSize: 12,
        bold: true,
        gap: 3,
      });
      const firstItemHeight = estimateTextHeight("- " + items[0], {
        fontSize: 10,
        indent: 3,
        gap: 3,
      });
      ensureSpace(titleHeight + firstItemHeight + 2);
      addText(title, {
        fontSize: 12,
        bold: true,
        color: [91, 76, 190],
        gap: 3,
        keepWithNext: true,
      });
      items.forEach((item) => {
        addText("- " + item, {
          fontSize: 10,
          indent: 3,
          gap: 3,
        });
      });
      y += 4;
    }

    function addRubricSection(scores) {
      if (!Array.isArray(scores) || scores.length === 0) return;
      ensureSpace(36);
      addText("DETAILED RUBRIC EVALUATION", {
        fontSize: 12,
        bold: true,
        color: [91, 76, 190],
        gap: 4,
        keepWithNext: true,
      });

      scores.forEach((item) => {
        const score = Number(item.score ?? 0);
        const weight = Number(item.weight ?? 0);
        const contribution = Number(
          item.weighted_contribution ?? (score * weight) / 100
        );
        const scoreLabel = Number.isFinite(score) ? score.toFixed(1).replace(/\.0$/, "") : "-";
        const contributionLabel = Number.isFinite(contribution)
          ? contribution.toFixed(3)
          : "-";

        ensureSpace(30);
        addText(
          `${item.name || item.criterion || "Criterion"} - ${weight}% weight | ${scoreLabel}/10 | Contribution: ${contributionLabel}`,
          { fontSize: 10, bold: true, color: [48, 49, 75], gap: 2 }
        );
        if (item.feedback) {
          addText(item.feedback, { fontSize: 9, indent: 3, color: [85, 87, 105], gap: 5 });
        }
      });
      y += 3;
    }

    function parseTableRow(line) {
      let value = line.trim();
      if (value.startsWith("|")) value = value.slice(1);
      if (value.endsWith("|")) value = value.slice(0, -1);
      return value.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
    }

    function isTableSeparator(line) {
      const cells = parseTableRow(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }

    function parseMarkdownBlocks(content) {
      const lines = String(content ?? "").replace(/\r/g, "").split("\n");
      const blocks = [];
      let index = 0;

      while (index < lines.length) {
        const line = lines[index].trim();
        if (!line) {
          index += 1;
          continue;
        }

        if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
          const rows = [parseTableRow(line)];
          index += 2;
          while (index < lines.length && lines[index].trim().includes("|")) {
            const tableLine = lines[index].trim();
            if (!isTableSeparator(tableLine)) rows.push(parseTableRow(tableLine));
            index += 1;
          }
          blocks.push({ type: "table", rows });
          continue;
        }

        const hashHeading = line.match(/^(#{1,3})\s+(.+)$/);
        const boldHeading = line.match(/^\*\*(.+)\*\*$/);
        if (hashHeading || boldHeading) {
          blocks.push({
            type: "heading",
            text: hashHeading ? hashHeading[2] : boldHeading[1],
            level: hashHeading ? hashHeading[1].length : 2,
          });
          index += 1;
          continue;
        }

        const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
        const unordered = line.match(/^[-*+]\s+(.+)$/);
        if (ordered || unordered) {
          blocks.push({
            type: "list",
            prefix: ordered ? `${ordered[1]}. ` : "- ",
            text: ordered ? ordered[2] : unordered[1],
          });
          index += 1;
          continue;
        }

        const paragraphLines = [line];
        index += 1;
        while (index < lines.length) {
          const next = lines[index].trim();
          if (!next) break;
          const isNextTable = next.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]);
          const isNextHeading = /^(#{1,3})\s+/.test(next) || /^\*\*(.+)\*\*$/.test(next);
          const isNextList = /^(\d+)[.)]\s+/.test(next) || /^[-*+]\s+/.test(next);
          if (isNextTable || isNextHeading || isNextList) break;
          paragraphLines.push(next);
          index += 1;
        }
        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
      }

      return blocks;
    }

    function prepareTable(rows) {
      const columnCount = Math.max(1, ...rows.map((row) => row.length));
      const normalizedRows = rows.map((row) =>
        Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] ?? "")
      );
      const naturalWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
        const longest = Math.max(
          6,
          ...normalizedRows.map((row) => cleanText(row[columnIndex]).length)
        );
        return Math.min(longest, 34);
      });
      const totalNaturalWidth = naturalWidths.reduce((sum, value) => sum + value, 0);
      const columnWidths = naturalWidths.map((value) => contentWidth * value / totalNaturalWidth);
      const padding = 2.2;
      const fontSize = 8.2;
      const lineHeight = fontSize * 0.58;

      const preparedRows = normalizedRows.map((row, rowIndex) => {
        const cells = row.map((cell, columnIndex) => {
          let runs = parseInlineMarkdown(cell);
          if (rowIndex === 0) runs = runs.map((run) => ({ ...run, bold: true }));
          const wrapped = wrapRuns(runs, Math.max(12, columnWidths[columnIndex] - padding * 2), fontSize);
          return { lines: wrapped };
        });
        const maxLines = Math.max(1, ...cells.map((cell) => cell.lines.length));
        return {
          cells,
          height: maxLines * lineHeight + padding * 2,
          isHeader: rowIndex === 0,
        };
      });

      return { columnWidths, preparedRows, padding, fontSize, lineHeight };
    }

    function drawTableRow(row, table, rowIndex) {
      let x = margin;
      const top = y;
      const fill = row.isHeader
        ? [239, 236, 252]
        : rowIndex % 2 === 0
          ? [250, 249, 253]
          : [255, 255, 255];

      row.cells.forEach((cell, columnIndex) => {
        const cellWidth = table.columnWidths[columnIndex];
        doc.setFillColor(...fill);
        doc.setDrawColor(213, 211, 226);
        doc.setLineWidth(0.25);
        doc.rect(x, top, cellWidth, row.height, "FD");

        cell.lines.forEach((line, lineIndex) => {
          const baseline = top + table.padding + table.fontSize * 0.82 + lineIndex * table.lineHeight;
          drawRichLine(
            line,
            x + table.padding,
            baseline,
            table.fontSize,
            row.isHeader ? [55, 49, 91] : [65, 67, 83]
          );
        });
        x += cellWidth;
      });
      y += row.height;
    }

    function addMarkdownTable(rows) {
      if (!rows.length) return;
      const table = prepareTable(rows);
      const [header, ...bodyRows] = table.preparedRows;
      const firstBodyHeight = bodyRows[0]?.height ?? 0;
      ensureSpace(header.height + firstBodyHeight + 5);
      drawTableRow(header, table, 0);

      bodyRows.forEach((row, rowIndex) => {
        if (y + row.height > bottomLimit) {
          doc.addPage();
          y = 20;
          drawTableRow(header, table, 0);
        }
        drawTableRow(row, table, rowIndex + 1);
      });
      y += 6;
    }

    function estimateMarkdownBlockHeight(block) {
      if (block.type === "heading") {
        const size = block.level === 1 ? 11.5 : 10.5;
        return estimateRichTextHeight(parseInlineMarkdown(block.text), { fontSize: size, gap: 3 });
      }
      if (block.type === "paragraph") {
        return estimateRichTextHeight(parseInlineMarkdown(block.text), { fontSize: 9.5, gap: 4 });
      }
      if (block.type === "list") {
        return estimateRichTextHeight(parseInlineMarkdown(block.prefix + block.text), { fontSize: 9.3, indent: 4, gap: 2.5 });
      }
      if (block.type === "table") {
        const table = prepareTable(block.rows);
        return table.preparedRows.reduce((sum, row) => sum + row.height, 0) + 6;
      }
      return 0;
    }

    function addImprovedAnswer(content) {
      if (!content) return;
      const blocks = parseMarkdownBlocks(content);
      const titleHeight = estimateTextHeight("Improved sample answer", {
        fontSize: 12,
        bold: true,
        gap: 4,
      });
      const totalBlockHeight = blocks.reduce(
        (sum, block) => sum + estimateMarkdownBlockHeight(block),
        0
      );
      const totalHeight = titleHeight + totalBlockHeight;
      const usablePageHeight = bottomLimit - 20;

      if (totalHeight <= usablePageHeight && y + totalHeight > bottomLimit) {
        doc.addPage();
        y = 20;
      } else {
        ensureSpace(titleHeight + Math.min(totalBlockHeight, 28));
      }

      addText("Improved sample answer", {
        fontSize: 12,
        bold: true,
        color: [91, 76, 190],
        gap: 4,
        keepWithNext: true,
      });

      blocks.forEach((block, blockIndex) => {
        if (block.type === "heading") {
          const nextBlock = blocks[blockIndex + 1];
          let nextKeepHeight = 0;
          if (nextBlock?.type === "table") {
            const nextTable = prepareTable(nextBlock.rows);
            nextKeepHeight = nextTable.preparedRows[0].height + (nextTable.preparedRows[1]?.height ?? 0) + 5;
          } else if (nextBlock) {
            nextKeepHeight = Math.min(estimateMarkdownBlockHeight(nextBlock), 22);
          }
          const fontSize = block.level === 1 ? 11.5 : 10.5;
          ensureSpace(estimateRichTextHeight(parseInlineMarkdown(block.text), { fontSize, gap: 3 }) + nextKeepHeight);
          addRichText(parseInlineMarkdown(block.text), {
            fontSize,
            color: [64, 59, 120],
            gap: 3,
            keepWithNext: true,
          });
        } else if (block.type === "paragraph") {
          addRichText(parseInlineMarkdown(block.text), {
            fontSize: 9.5,
            color: [70, 73, 95],
            gap: 4,
          });
        } else if (block.type === "list") {
          addRichText(parseInlineMarkdown(block.prefix + block.text), {
            fontSize: 9.3,
            indent: 4,
            color: [70, 73, 95],
            gap: 2.5,
          });
        } else if (block.type === "table") {
          addMarkdownTable(block.rows);
        }
      });
    }

    addText("KAIZENLY", {
      fontSize: 23,
      bold: true,
      color: [91, 76, 190],
      gap: 2,
    });
    addText("AI ASSIGNMENT FEEDBACK REPORT", {
      fontSize: 11,
      bold: true,
      gap: 2,
    });
    addText("Generated on: " + new Date().toLocaleString(), {
      fontSize: 9,
      color: [130, 130, 145],
      gap: 9,
    });

    doc.setDrawColor(220, 220, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    addText("ASSIGNMENT DETAILS", {
      fontSize: 12,
      bold: true,
      color: [91, 76, 190],
    });
    addText("Subject: " + submitted.subject, { bold: true });
    addText("Academic level: " + submitted.academic_level);

    addText("OVERALL SCORE", {
      fontSize: 11,
      bold: true,
      color: [91, 76, 190],
      gap: 2,
    });
    addText(`${feedback.overall_score} / ${feedback.score_out_of ?? 10}`, {
      fontSize: 21,
      bold: true,
      color: [91, 76, 190],
      gap: 8,
    });

    addRubricSection(feedback.rubric_scores);
    addSection("Assignment question", submitted.question);
    addSection("Student's original answer", submitted.answer);
    addSection("Overall evaluation", feedback.summary);
    addListSection("Strengths", feedback.strengths);
    addListSection("Areas for improvement", feedback.areas_for_improvement);
    addListSection("Actionable suggestions", feedback.suggestions);
    addImprovedAnswer(feedback.improved_answer);

    const totalPages = doc.internal.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 150);
      doc.text(
        `Kaizenly | Page ${page} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" }
      );
    }

    const safeSubject =
      (submitted.subject || "assignment")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "assignment";

    doc.save(`Kaizenly-${safeSubject}-feedback.pdf`);
  }

async function handleSubmit(event) {
  event.preventDefault();

  setError("");
  setUploadError("");

  const apiUrl = (
    import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");

  setLoading(true);

  try {
    // STAGE 1: Extract handwritten text
    if (submissionMode === "image" && !ocrReady) {
      if (!questionImage) {
        throw new Error("Please upload the assignment question image.");
      }

      if (answerImages.length === 0) {
        throw new Error("Please upload at least one answer page.");
      }

      const imageForm = new FormData();

      imageForm.append("subject", formData.subject);
      imageForm.append("academic_level", formData.academic_level);
      imageForm.append("question_image", questionImage);

      answerImages.forEach((file) => {
        imageForm.append("answer_images", file);
      });

      const response = await fetch(
        `${apiUrl}/api/extract-handwriting`,
        {
          method: "POST",
          body: imageForm,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Unable to extract handwritten text."
        );
      }

      setFormData((previous) => ({
        ...previous,
        question: data.question,
        answer: data.answer,
      }));

      setOcrReady(true);
      setFeedback(null);

      return;
    }

    // STAGE 2: Generate assignment feedback

    let endpoint;
    let requestBody;

    if (evaluationEngine === "finetuned") {
      if (!referenceAnswer.trim()) {
        throw new Error("Please enter the reference answer.");
      }

      if (!markScheme.trim()) {
        throw new Error("Please enter the marking scheme.");
      }

      endpoint = `${apiUrl}/api/feedback/finetuned`;

      requestBody = {
        ...formData,
        reference_answer: referenceAnswer,
        mark_scheme: markScheme,
      };
    } else {
      endpoint = `${apiUrl}/api/feedback`;
      requestBody = formData;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Unable to generate feedback."
      );
    }

    if (evaluationEngine === "finetuned") {
      setFinetunedFeedback(data);
      setFeedback(null);
      setReportSubmission(null);
    } else {
      setFeedback(data);
      setFinetunedFeedback(null);
      setReportSubmission({ ...formData });
    }


  } catch (err) {
    if (err instanceof TypeError) {
      setError(
        "Unable to connect to the backend. Check whether the API is running."
      );
    } else {
      setError(err.message || "Something went wrong.");
    }
  } finally {
    setLoading(false);
  }
}


  return (
    <div className="app-shell kaizenly-fullbleed">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <img src="/kaizenly-ryu.png" alt="Kaizenly Ryu emblem" />
          </div>
          <div>
            <h2>Kaizen <span className="brand-name-accent">ly</span></h2>
            <span>Learn. Reflect. Improve.</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <div className="nav-item active"><span className="nav-icon">⌂</span>New Assessment</div>
        <div className="nav-item muted"><span className="nav-icon">◷</span>Feedback History<span className="soon-label">Soon</span></div>
        <div className="nav-item muted"><span className="nav-icon">▤</span>My Assignments<span className="soon-label">Soon</span></div>

        <div className="sidebar-label sidebar-label-spaced">EXPLORE</div>
        <div className="nav-item muted"><span className="nav-icon">✧</span>AI Model Lab<span className="soon-label roadmap-label">In progress</span></div>
        <div className="nav-item muted"><span className="nav-icon">▥</span>Handwriting Review<span className="soon-label">Planned</span></div>
        <div className="nav-item muted"><span className="nav-icon">▧</span>Insights & Analytics<span className="soon-label">Soon</span></div>

        <div className="sidebar-bottom">
          <div className="sidebar-tip-icon">✦</div>
          <h3>Learn as you improve.</h3>
          <p>Get meaningful feedback, understand your mistakes, and make every submission stronger.</p>
          <div className="sidebar-roadmap">
            <span>ON THE ROADMAP</span>
            <b>Handwritten work · Colab model training</b>
          </div>
          <div className="sidebar-version">KAIZENLY · BUILD 01</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span className="breadcrumb-home">⌂</span> Workspace <span>/</span> <strong>New Assessment</strong></div>
          <div className={`topbar-status status-${backendStatus}`}>
            <span className="status-dot"></span>
            {backendStatus === "online" ? "AI ENGINE ONLINE" : backendStatus === "checking" ? "CHECKING AI ENGINE" : "BACKEND OFFLINE"}
          </div>
        </header>

        <div className="page-content fullbleed-page-content">
          <section className="hero-stage" aria-label="Kaizenly assignment workspace">
            <div className="stage-atmosphere" aria-hidden="true"></div>
            <div className="stage-moon-glow" aria-hidden="true"></div>
            <div className="hero-visual stage-dragon dragon-visual">
              <div className="dragon-haze dragon-haze-one" aria-hidden="true"></div>
              <div className="dragon-haze dragon-haze-two" aria-hidden="true"></div>
              <DragonScene />
              <div className="dragon-caption"><span>RYU · 01</span><small>HOVER TO AWAKEN · MOVE TO GUIDE THE LIGHT</small></div>
            </div>

            <div className="stage-content">
              <div className="stage-intro">
                <div className="eyebrow"><span>✦</span> AI ASSIGNMENT FEEDBACK ASSISTANT</div>
                <h1 className="brand-display">
                <span className="brand-display-main">Kaizen</span><span className="brand-display-accent">ly</span>
                </h1>
                <div className="stage-mantra">Learn. Reflect. Improve.</div>
                <p>Get AI-powered, rubric-based feedback on your assignments and turn them into stronger, more complete answers.</p>
                <div className="hero-points stage-feature-points">
                  <span><b>◎</b> Rubric scoring</span>
                  <span><b>ϟ</b> Constructive feedback</span>
                  <span><b>◇</b> Improved answers</span>
                </div>
              </div>

              <section className="form-card assignment-panel">

                <div className="submission-tabs" role="tablist" aria-label="Submission method">
                  <button
                    type="button"
                    className={`submission-tab ${submissionMode === "text" ? "active" : ""}`}
                    role="tab"
                    aria-selected={submissionMode === "text"}
                    onClick={() => {
                      setSubmissionMode("text");
                      setUploadError("");
                    }}
                  >
                    <span>▦</span> Type Answer
                  </button>

                  <button
                    type="button"
                    className={`submission-tab ${submissionMode === "image" ? "active" : ""}`}
                    role="tab"
                    aria-selected={submissionMode === "image"}
                    onClick={() => {
                      setSubmissionMode("image");
                      setUploadError("");
                    }}
                  >
                    <span>▧</span> Upload Handwritten Work
                  </button>
                </div>

                {handwritingNotice && (
                  <div className="feature-notice" role="status">
                    Handwritten image submissions are in development. For now, submit a typed answer; image recognition will be added in a later phase.
                    <button type="button" onClick={() => setHandwritingNotice(false)} aria-label="Dismiss notice">×</button>
                  </div>
                )}

                <div className="assignment-rubric-line" aria-label="Assessment weights">
                  <span>ASSESSMENT RUBRIC</span>
                  <b>Concept 40%</b><b>Completeness 25%</b><b>Clarity 20%</b><b>Structure 15%</b>
                </div>



                  <form onSubmit={handleSubmit}>
                    <div className="form-field">
                      <label htmlFor="evaluationEngine">EVALUATION ENGINE</label>
                      <select
                        id="evaluationEngine"
                        value={evaluationEngine}
                        onChange={(event) => {
                          setEvaluationEngine(event.target.value);
                          setFeedback(null);
                          setFinetunedFeedback(null);
                          setError("");
                        }}
                        disabled={loading}
                      >
                        <option value="groq">Groq AI — Detailed Feedback</option>
                        <option value="finetuned">Kaizenly V1 — Fine-tuned Model</option>
                      </select>
                    </div>

                    {evaluationEngine === "finetuned" && (
                      <div className="field-grid">
                        <div className="form-field">
                          <label htmlFor="referenceAnswer">REFERENCE ANSWER</label>
                          <textarea
                            id="referenceAnswer"
                            value={referenceAnswer}
                            onChange={(event) => setReferenceAnswer(event.target.value)}
                            placeholder="Enter the expected/reference answer..."
                            required
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor="markScheme">MARKING SCHEME</label>
                          <textarea
                            id="markScheme"
                            value={markScheme}
                            onChange={(event) => setMarkScheme(event.target.value)}
                            placeholder="Enter marking criteria and marks..."
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div className="field-grid">
                    <div className="form-field">
                      <label htmlFor="subject">SUBJECT / COURSE</label>
                      <input
                        id="subject"
                        name="subject"
                        list="kaizenly-subjects"
                        value={formData.subject}
                        onChange={handleChange}
                        placeholder="Select or enter subject"
                        required
                      />
                      <datalist id="kaizenly-subjects">
                        <option value="Introduction to Artificial Intelligence" />
                        <option value="Database Management Systems" />
                        <option value="Computer Networks" />
                        <option value="Data Structures and Algorithms" />
                      </datalist>
                    </div>
                    <div className="form-field">
                      <label htmlFor="academic_level">ACADEMIC LEVEL</label>
                      <select id="academic_level" name="academic_level" value={formData.academic_level} onChange={handleChange}>
                        <option value="High School">High School</option>
                        <option value="Undergraduate">Undergraduate</option>
                        <option value="Postgraduate">Postgraduate</option>
                      </select>
                    </div>
                  </div>


{submissionMode === "text" ? (
  <>
    <div className="form-field stage-question-field">
      <label htmlFor="question">ASSIGNMENT QUESTION</label>
      <textarea
        id="question"
        name="question"
        value={formData.question}
        onChange={handleChange}
        placeholder="Enter the assignment question here..."
        rows="2"
        required
      />
      <span className="field-hint">
        Include the complete question for more relevant feedback.
      </span>
    </div>

    <div className="form-field stage-answer-field">
      <div className="label-row">
        <label htmlFor="answer">YOUR ANSWER</label>
        <span className="word-count">{wordCount} words</span>
      </div>
      <textarea
        id="answer"
        name="answer"
        value={formData.answer}
        onChange={handleChange}
        placeholder="Type or paste your answer here..."
        rows="4"
        required
      />
      <span className="field-hint">
        Your answer will be evaluated against the assignment question and assessment criteria.
      </span>
    </div>
  </>
) : (
  <div className="image-upload-section">
    <div className="form-field">
      <label htmlFor="question-image">ASSIGNMENT QUESTION IMAGE</label>
      <input
        ref={questionImageInputRef}
        id="question-image"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleQuestionImage}
      />
      <span className="field-hint">
        Upload one clear image of your assignment question.
      </span>
      {questionImage && (
        <ImageFilePreview
          file={questionImage}
          onRemove={removeQuestionImage}
        />
      )}
    </div>

    <div className="form-field">
      <label htmlFor="answer-images">HANDWRITTEN ANSWER PAGES</label>
      <input
        id="answer-images"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleAnswerImages}
      />
      <span className="field-hint">
        Upload up to 5 pages. Select pages in the correct order.
      </span>

      {answerImages.map((file, index) => (
        <ImageFilePreview
          key={`${file.name}-${file.lastModified}-${index}`}
          file={file}
          onRemove={() => removeAnswerImage(index)}
        />
      ))}
    </div>

    {uploadError && (
      <div className="error-message" role="alert">
        {uploadError}
      </div>
    )}

    {ocrReady && (
      <div className="ocr-review-section">
        <div className="ocr-review-heading">
          <h3>Review Extracted Text</h3>
          <p>
            Please check the extracted handwriting carefully.
            Correct any mistakes before generating feedback.
          </p>
        </div>

        <div className="form-field">
          <label htmlFor="ocr-question">
            EXTRACTED ASSIGNMENT QUESTION
          </label>
          <textarea
            id="ocr-question"
            name="question"
            value={formData.question}
            onChange={handleChange}
            rows={4}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="ocr-answer">
            EXTRACTED HANDWRITTEN ANSWER
          </label>
          <textarea
            id="ocr-answer"
            name="answer"
            value={formData.answer}
            onChange={handleChange}
            rows={8}
            required
          />
          <span className="field-hint">
            Edit any incorrectly recognised words or sentences.
          </span>
        </div>
      </div>
    )}

    {!ocrReady && (
      <p className="field-hint">
        Upload your question image and handwritten answer pages.
        Kaizenly will extract the text for you to review.
      </p>
    )}

  </div>
)}


                  {error && <div className="error-message" role="alert">{error}</div>}

                  <div className="form-actions stage-form-actions">
                    <div className="secondary-actions">
                      <button type="button" className="sample-button" onClick={loadSample}><span>▤</span> Load Sample</button>
                      <button type="button" className="sample-button clear-button" onClick={clearForm}><span>↻</span> Clear</button>
                    </div>
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading
                          ? submissionMode === "image" && !ocrReady
                            ? "Extracting Text..."
                            : "Generating Feedback..."
                          : submissionMode === "image" && !ocrReady
                            ? "Extract Handwriting"
                            : "Generate Feedback"}
                      <span>↗</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>

            <div className="stage-bottom-features" aria-label="Kaizenly capabilities and roadmap">
              <div className="stage-bottom-heading"><span>✦</span> BUILT TO HELP YOU IMPROVE</div>
              <div className="stage-feature-card"><b>◎</b><span><strong>AI feedback</strong><small>Detailed, subject-aware insights</small></span></div>
              <div className="stage-feature-card"><b>◇</b><span><strong>Weighted rubric</strong><small>Four clear assessment criteria</small></span></div>
              <div className="stage-feature-card"><b>⇩</b><span><strong>PDF reports</strong><small>Downloadable evaluation results</small></span></div>
              <div className="stage-feature-card roadmap-card"><b>✧</b><span><strong>AI Model Lab</strong><small>Colab fine-tuning · In development</small></span></div>
              <div className="stage-feature-card roadmap-card"><b>▧</b><span><strong>Handwriting</strong><small>Image recognition · In development</small></span></div>
            </div>
          </section>

          <div className="below-stage-content">
                    {finetunedFeedback && (
            <section className="results-card">
              <div className="results-heading">
                <div>
                  <span className="section-kicker">YOUR ASSESSMENT</span>
                  <h2>Kaizenly V1 Feedback</h2>
                </div>

                <div className="score-display">
                  <strong>{finetunedFeedback.score}</strong>
                  <span>/ 2</span>
                </div>
              </div>

              <div className="result-section">
                <span className="section-kicker">MODEL PERFORMANCE</span>
                <h3>{finetunedFeedback.performance}</h3>
                <p>{finetunedFeedback.feedback}</p>
              </div>

              <p className="field-hint">
                Evaluated using Kaizenly's fine-tuned V1 model.
                This is an experimental evaluation, not a final academic grade.
              </p>
            </section>
          )}
          {feedback && (
            <section className="results-card">
              <div className="results-heading">
                <div>
                  <span className="section-kicker">YOUR ASSESSMENT</span>
                  <h2>Feedback report</h2>
                </div>
                <div className="results-actions">
                  <div className="score-display">
                    <strong>{feedback.overall_score ?? "—"}</strong>
                    <span>/ {feedback.score_out_of ?? 10}</span>
                  </div>

                  <button
                    type="button"
                    className="download-button"
                    onClick={handleDownloadPDF}
                  >
                    <span>↓</span> Download PDF
                  </button>
                </div>
              </div>

              {feedback.summary && <p>{feedback.summary}</p>}

              {Array.isArray(feedback.rubric_scores) && feedback.rubric_scores.length > 0 && (
                <section className="result-section rubric-results-section">
                  <div className="rubric-results-heading">
                    <div>
                      <span className="section-kicker">WEIGHTED EVALUATION</span>
                      <h3>Detailed rubric scoring</h3>
                    </div>
                    <span className="rubric-results-total">
                      {feedback.overall_score} / {feedback.score_out_of ?? 10}
                    </span>
                  </div>

                  <div className="rubric-results-grid">
                    {feedback.rubric_scores.map((item) => {
                      const score = Number(item.score ?? 0);
                      const weight = Number(item.weight ?? 0);
                      const contribution = Number(
                        item.weighted_contribution ?? (score * weight) / 100
                      );
                      const safeScore = Number.isFinite(score)
                        ? Math.max(0, Math.min(10, score))
                        : 0;

                      return (
                        <article className="rubric-result-item" key={item.criterion || item.name}>
                          <div className="rubric-result-topline">
                            <strong>{item.name || item.criterion}</strong>
                            <span>{score.toFixed(1).replace(/\.0$/, "")}/10</span>
                          </div>
                          <div className="rubric-result-track">
                            <div
                              className="rubric-result-fill"
                              style={{ width: `${safeScore * 10}%` }}
                            />
                          </div>
                          <div className="rubric-result-meta">
                            <span>Weight: {weight}%</span>
                            <span>Weighted contribution: {contribution.toFixed(3)}</span>
                          </div>
                          {item.feedback && <p>{item.feedback}</p>}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              <div className="results-grid">
                <div>
                  <h3>Strengths</h3>
                  <ul>
                    {(feedback.strengths || []).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>Areas for improvement</h3>
                  <ul>
                    {(feedback.areas_for_improvement || []).map(
                      (item, index) => <li key={index}>{item}</li>
                    )}
                  </ul>
                </div>
              </div>

              {feedback.suggestions?.length > 0 && (
                <div className="result-section">
                  <h3>Actionable suggestions</h3>
                  <ul>
                    {feedback.suggestions.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.improved_answer && (
                <div className="result-section">
                  <h3>Improved sample answer</h3>
                  <div className="improved-answer improved-answer-content">
                    {renderImprovedAnswer(feedback.improved_answer)}
                  </div>
                </div>
              )}
            </section>
          )}


            <footer className="page-footer">
              <span>KAIZENLY · AI ASSIGNMENT FEEDBACK ASSISTANT</span>
              <span>Built to make learning better.</span>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
