const demoStatus = document.querySelector("#demo-status");
const pipelineStatus = document.querySelector("#pipeline-status");
const reportStatus = document.querySelector("#report-status");
const scenarioCount = document.querySelector("#scenario-count");
const runLog = document.querySelector("#run-log");
const runButton = document.querySelector("#run-button");
const refreshButton = document.querySelector("#refresh-button");
const reportFrame = document.querySelector("#report-frame");

let pollTimer = null;

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
