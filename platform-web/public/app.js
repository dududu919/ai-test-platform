const demoStatus = document.querySelector("#demo-status");
const pipelineStatus = document.querySelector("#pipeline-status");
const reportStatus = document.querySelector("#report-status");
const scenarioCount = document.querySelector("#scenario-count");
const runLog = document.querySelector("#run-log");
const runButton = document.querySelector("#run-button");
const refreshButton = document.querySelector("#refresh-button");
const reportFrame = document.querySelector("#report-frame");
const targetUrlInput = document.querySelector("#target-url");
const spiderButton = document.querySelector("#spider-button");
const scenarioList = document.querySelector("#scenario-list");
const scenarioListCount = document.querySelector("#scenario-list-count");

let pollTimer = null;

spiderButton.addEventListener("click", async () => {
  const url = targetUrlInput.value.trim();
  if (!url) {
    alert("请输入目标网站 URL");
    return;
  }

  spiderButton.disabled = true;
  spiderButton.textContent = "分析中...";
  scenarioList.innerHTML = '<p class="loading-message">正在深度分析目标网站...</p>';

  try {
    const response = await fetch("/api/spider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error ?? "生成场景失败");
      return;
    }

    // Update scenario list
    updateScenarioList(data.scenarios || []);

    // Update status
    scenarioCount.textContent = String(data.scenarios?.length || 0);
  } catch (err) {
    alert("生成场景失败: " + err.message);
  } finally {
    spiderButton.disabled = false;
    spiderButton.textContent = "AI 深度分析并生成场景";
  }
});

function updateScenarioList(scenarios) {
  if (!scenarios || scenarios.length === 0) {
    scenarioList.innerHTML = '<p class="empty-message">暂无生成的场景</p>';
    scenarioListCount.textContent = "0 个";
    return;
  }

  scenarioListCount.textContent = `${scenarios.length} 个`;
  scenarioList.innerHTML = scenarios
    .map(
      (s) => `
      <div class="scenario-item">
        <span class="scenario-id">${s.id || "unnamed"}</span>
        <span class="scenario-module">${s.module || ""}</span>
        <span class="scenario-priority">${s.priority || ""}</span>
      </div>
    `
    )
    .join("");
}

runButton.addEventListener("click", async () => {
  runButton.disabled = true;

  try {
    const response = await fetch("/api/run", { method: "POST" });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error ?? "启动测试流程失败。");
    }
  } catch {
    alert("启动测试流程失败。");
  } finally {
    await refresh();
    runButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => {
  void refresh();
});

void refresh();
pollTimer = window.setInterval(refresh, 3000);

async function refresh() {
  const [statusResponse, scenariosResponse] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/scenarios")
  ]);

  const statusData = await statusResponse.json();
  const scenarios = await scenariosResponse.json();

  demoStatus.textContent = statusData.demoReachable ? "在线" : "离线";
  pipelineStatus.textContent = formatPipeline(statusData.runState);
  reportStatus.textContent = statusData.artifacts.reportExists ? "已生成" : "缺失";
  scenarioCount.textContent = String(Array.isArray(scenarios) ? scenarios.length : 0);
  runLog.textContent = statusData.runState.log || "还没有触发新的运行。";

  if (statusData.links.report) {
    reportFrame.src = `${statusData.links.report}?t=${Date.now()}`;
  }
}

function formatPipeline(runState) {
  if (!runState?.startedAt) {
    return "空闲";
  }

  if (runState.status === "running") {
    return "运行中";
  }

  if (runState.status === "passed") {
    return "成功";
  }

  if (runState.status === "failed") {
    return "失败";
  }

  return "空闲";
}
