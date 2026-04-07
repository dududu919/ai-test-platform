import type { FailureReport } from "../models/report.js";

export function renderHtmlReport(report: FailureReport): string {
  const cards = report.scenarioReports
    .map((item) => {
      const statusClass = item.classification === "passed" ? "passed" : "failed";

      return `
        <section class="card ${statusClass}">
          <div class="card-header">
            <div>
              <p class="eyebrow">${escapeHtml(item.scenario.module)}</p>
              <h2>${escapeHtml(item.scenario.id)}</h2>
            </div>
            <span class="pill ${statusClass}">${escapeHtml(displayClassification(item.classification))}</span>
          </div>
          <div class="meta">
            <span>优先级: ${escapeHtml(item.scenario.priority)}</span>
            <span>风险: ${escapeHtml(item.scenario.risk)}</span>
          </div>
          <div class="block">
            <h3>结果摘要</h3>
            <p>${escapeHtml(item.summary)}</p>
          </div>
          <div class="block">
            <h3>修复建议</h3>
            <p>${escapeHtml(item.suggestedFix)}</p>
          </div>
          <div class="block">
            <h3>前置条件</h3>
            <ul>${item.scenario.preconditions.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>
          </div>
          <div class="block">
            <h3>执行步骤</h3>
            <ol>
              ${item.scenario.steps
                .map(
                  (step) =>
                    `<li><code>${escapeHtml(step.action)}</code> ${escapeHtml(step.target)}${
                      step.value ? ` = ${escapeHtml(step.value)}` : ""
                    }</li>`
                )
                .join("")}
            </ol>
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 测试平台报告</title>
    <style>
      :root {
        --bg: #f4efe6;
        --panel: rgba(255, 253, 248, 0.92);
        --text: #1e1e1e;
        --muted: #6a6258;
        --border: #ddd2bf;
        --passed: #166534;
        --passed-bg: #e7f7ed;
        --failed: #b42318;
        --failed-bg: #fdecea;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, #f7dfab 0, transparent 24%),
          linear-gradient(180deg, #f8f4ec 0%, #eee4d4 100%);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 40px 20px 60px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: end;
        margin-bottom: 24px;
      }
      h1, h2, h3, p { margin-top: 0; }
      h1 { font-size: 42px; margin-bottom: 10px; }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 24px 0 32px;
      }
      .summary-card, .card {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 14px 40px rgba(63, 50, 18, 0.08);
      }
      .summary-card { padding: 18px; }
      .summary-card .label {
        color: var(--muted);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .summary-card .value {
        font-size: 34px;
        margin-top: 10px;
      }
      .cards { display: grid; gap: 18px; }
      .card { padding: 22px; }
      .card.passed { border-left: 8px solid var(--passed); }
      .card.failed { border-left: 8px solid var(--failed); }
      .card-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: start;
      }
      .eyebrow {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 13px;
      }
      .meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        margin: 10px 0 18px;
      }
      .pill {
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .pill.passed {
        color: var(--passed);
        background: var(--passed-bg);
      }
      .pill.failed {
        color: var(--failed);
        background: var(--failed-bg);
      }
      .block { margin-top: 18px; }
      .block h3 { margin-bottom: 8px; }
      code {
        background: #f3ece1;
        border-radius: 6px;
        padding: 1px 6px;
      }
      ul, ol {
        margin: 0;
        padding-left: 20px;
      }
      @media (max-width: 720px) {
        .hero, .card-header {
          flex-direction: column;
          align-items: start;
        }
        h1 { font-size: 34px; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <p>报告生成时间：${escapeHtml(report.generatedAt)}</p>
          <h1>测试执行报告</h1>
          <p>本地测试平台的可读结果页，包含成功与失败场景。</p>
        </div>
      </section>
      <section class="summary-grid">
        <article class="summary-card">
          <div class="label">总数</div>
          <div class="value">${report.summary.total}</div>
        </article>
        <article class="summary-card">
          <div class="label">通过</div>
          <div class="value">${report.summary.passed}</div>
        </article>
        <article class="summary-card">
          <div class="label">失败</div>
          <div class="value">${report.summary.failed}</div>
        </article>
        <article class="summary-card">
          <div class="label">跳过</div>
          <div class="value">${report.summary.skipped}</div>
        </article>
      </section>
      <section class="cards">${cards}</section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayClassification(classification: string): string {
  switch (classification) {
    case "passed":
      return "通过";
    case "assertion-failure":
      return "断言失败";
    case "element-locator-failure":
      return "元素定位失败";
    case "permission-failure":
      return "权限失败";
    case "backend-api-failure":
      return "接口异常";
    case "db-persistence-failure":
      return "落库失败";
    default:
      return "未知失败";
  }
}
