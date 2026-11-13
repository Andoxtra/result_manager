import PDFDocument from "pdfkit";
import type { Evaluation } from "./evaluation.js";
import { formatTime, type DisciplineInfo, type RankingRow } from "./ranking.js";

interface Column<T> {
  title: string;
  width: number;
  align?: "left" | "right";
  value: (row: T) => string;
}

const MARGIN = 50;
const ROW_HEIGHT = 20;
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" });

function drawTable<T>(
  doc: PDFKit.PDFDocument,
  columns: Column<T>[],
  rows: T[],
  onNewPage: () => void,
) {
  const bottom = doc.page.height - MARGIN - 20;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  const drawRow = (cells: string[], y: number, header: boolean) => {
    doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor("black");
    let x = MARGIN;
    columns.forEach((c, i) => {
      doc.text(cells[i], x + 4, y + 5, {
        width: c.width - 8,
        align: c.align ?? "left",
        lineBreak: false,
        ellipsis: true,
      });
      x += c.width;
    });
    doc
      .moveTo(MARGIN, y + ROW_HEIGHT)
      .lineTo(MARGIN + totalWidth, y + ROW_HEIGHT)
      .lineWidth(header ? 1 : 0.5)
      .strokeColor(header ? "black" : "#bbbbbb")
      .stroke();
  };

  const header = () => {
    const y = doc.y; // drawing text moves doc.y, so remember where the row starts
    drawRow(columns.map((c) => c.title), y, true);
    doc.y = y + ROW_HEIGHT;
  };

  header();
  for (const row of rows) {
    if (doc.y + ROW_HEIGHT > bottom) {
      doc.addPage();
      onNewPage();
      header();
    }
    const y = doc.y;
    drawRow(columns.map((c) => c.value(row)), y, false);
    doc.y = y + ROW_HEIGHT;
  }
  doc.x = MARGIN;
}

function heading(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc.font("Helvetica-Bold").fontSize(18).fillColor("black").text(title, MARGIN, MARGIN);
  doc.font("Helvetica").fontSize(11).fillColor("#444444").text(subtitle);
  doc.moveDown(1.2);
}

function rankingColumns(discipline: DisciplineInfo): Column<RankingRow>[] {
  const lead: Column<RankingRow>[] = [
    { title: "Platz", width: 45, align: "right", value: (r) => `${r.place}.` },
    { title: "Nr.", width: 45, align: "right", value: (r) => String(r.shooterNumber) },
  ];
  if (discipline.scoringType === "TIME") {
    return [
      ...lead,
      { title: "Name", width: 165, value: (r) => r.shooterName },
      { title: "Zeit", width: 75, align: "right", value: (r) => formatTime(r.rawTimeCs!) },
      { title: "Fehler", width: 50, align: "right", value: (r) => String(r.penalties) },
      { title: "Endzeit", width: 75, align: "right", value: (r) => formatTime(r.finalTimeCs!) },
      { title: "Karten", width: 40, align: "right", value: (r) => String(r.cardCount) },
    ];
  }
  return [
    ...lead,
    { title: "Name", width: 285, value: (r) => r.shooterName },
    { title: "Punkte", width: 70, align: "right", value: (r) => String(r.score) },
    { title: "Karten", width: 50, align: "right", value: (r) => String(r.cardCount) },
  ];
}

/** Page 1: statistics of the event. Then one page (or more) per discipline with its ranking. */
export function renderEventPdf(evaluation: Evaluation): Promise<Buffer> {
  const { event, statistics, rankings } = evaluation;
  const eventLine = `${event.name} · ${dateFormat.format(event.date)}`;

  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: event.name },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  heading(doc, event.name, dateFormat.format(event.date));
  doc.font("Helvetica-Bold").fontSize(13).fillColor("black").text("Statistik");
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(11);
  doc.text(`Schützen insgesamt: ${statistics.shooters}`);
  doc.text(`Ausgegebene Schießkarten: ${statistics.cardsIssued}`);
  doc.text(`Davon nachgelöst: ${statistics.cardsRebought}`);
  if (statistics.cardsOpen > 0) doc.text(`Davon ohne Ergebnis: ${statistics.cardsOpen}`);
  doc.moveDown(1.2);
  doc.font("Helvetica-Bold").fontSize(13).text("Teilnahme je Disziplin");
  doc.moveDown(0.5);
  drawTable(
    doc,
    [
      { title: "Disziplin", width: 195, value: (d) => d.name },
      { title: "Schützen", width: 70, align: "right", value: (d) => String(d.shooters) },
      { title: "Karten", width: 70, align: "right", value: (d) => String(d.cards) },
      { title: "Nachgelöst", width: 80, align: "right", value: (d) => String(d.rebuys) },
      { title: "Ohne Ergebnis", width: 80, align: "right", value: (d) => String(d.openCards) },
    ],
    statistics.disciplines,
    () => heading(doc, "Statistik (Fortsetzung)", eventLine),
  );

  for (const { discipline, rows } of rankings) {
    doc.addPage();
    heading(doc, discipline.name, eventLine);
    if (rows.length === 0) {
      doc.font("Helvetica").fontSize(11).fillColor("black").text("Keine Ergebnisse vorhanden.");
      continue;
    }
    drawTable(doc, rankingColumns(discipline), rows, () =>
      heading(doc, `${discipline.name} (Fortsetzung)`, eventLine),
    );
    if (discipline.scoringType === "TIME") {
      doc.moveDown(0.8);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#444444")
        .text(`Endzeit = Zeit + Fehler × ${discipline.penaltySeconds} s`, MARGIN);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // otherwise writing the footer would add a page
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#666666")
      .text(`Seite ${i + 1} von ${range.count}`, MARGIN, doc.page.height - 40, {
        width: doc.page.width - 2 * MARGIN,
        align: "center",
        lineBreak: false,
      });
  }

  doc.end();
  return done;
}
