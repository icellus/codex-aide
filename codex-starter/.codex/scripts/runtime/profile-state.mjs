import fs from "node:fs";
import path from "node:path";

import { createEmptyTaskContext, createEmptyTaskWorkflowState, normalizeTaskWorkflowState } from "./store-shapes.mjs";

function normalizeProfileValue(value) {
  return String(value || "").replace(/`/g, "").trim();
}

export function normalizeDeliveryModeValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();

  if (legacy === "direct") {
    return "lightweight";
  }

  if (legacy === "plan-driven") {
    return "standard";
  }

  if (legacy === "orchestrated") {
    return "long-running";
  }

  return normalized;
}

function normalizeEnabledModuleValue(value) {
  const normalized = normalizeProfileValue(value);
  const legacy = normalized.toLowerCase();
  if (legacy === "startup scan or cached repo context") {
    return "intake triage and cached repo context";
  }
  if (legacy === "lightweight execution") {
    return "direct answer or routed delivery";
  }
  if (legacy === "direct implementation" || legacy === "lightweight implementation") {
    return "direct answer or routed delivery";
  }
  return normalized;
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeProfileValue(item)).filter(Boolean);
  }

  const normalized = normalizeProfileValue(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readProfileField(text, label) {
  const prefix = `- ${label}:`;
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }
  return line.slice(prefix.length).trim();
}

function parseProfileList(value) {
  return normalizeProfileValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapTaskContextToProfile(parsed = {}) {
  const empty = createEmptyTaskContext();
  const collaboration = {
    ...empty.collaboration,
    ...(parsed.collaboration || {})
  };
  const task = {
    ...empty.task,
    ...(parsed.task || {})
  };
  const workflow = normalizeTaskWorkflowState(task.workflow);

  return {
    task: normalizeProfileValue(task.current_task) || null,
    taskStatus: normalizeProfileValue(task.status) || "idle",
    taskClass: normalizeProfileValue(task.class) || null,
    riskLevel: normalizeProfileValue(task.risk) || null,
    deliveryMode: normalizeDeliveryModeValue(task.delivery_mode) || null,
    routeRationale: normalizeProfileValue(task.route_rationale) || null,
    routingOverrides: normalizeListValue(task.routing_overrides),
    enabledRoles: normalizeListValue(task.enabled_roles),
    enabledModules: normalizeListValue(task.enabled_modules).map((item) => normalizeEnabledModuleValue(item)),
    qcPolicy: normalizeProfileValue(task.qc_policy) || null,
    submitPolicy: normalizeProfileValue(task.submit_policy) || null,
    validationProfileStatus: normalizeProfileValue(task.validation_profile_status) || null,
    openQuestions: normalizeListValue(task.open_questions),
    workflow,
    workflowPhase: workflow.phase,
    workflowChainId: workflow.chain_id,
    workflowCurrentChain: workflow.current_chain,
    workflowExpectedNextStep: workflow.expected_next_step,
    workflowRequiredHandoff: workflow.required_handoff,
    workflowRequiredHandoffTaskId: workflow.required_handoff_task_id,
    workflowSettlementGuard: workflow.settlement_guard,
    workflowSettlementGuardReason: workflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(collaboration.preferred_address) || "Boss",
    greetingStyle: normalizeProfileValue(collaboration.greeting_style) || "warm",
    firstStartupGreetingCompleted: Boolean(collaboration.first_startup_greeting_completed)
  };
}

export function loadProjectProfileState(projectDir, loadTaskContext) {
  const emptyWorkflow = createEmptyTaskWorkflowState();
  const taskContextPath = path.join(projectDir, ".codex", "state", "task-context.json");
  if (fs.existsSync(taskContextPath)) {
    return mapTaskContextToProfile(loadTaskContext(projectDir));
  }

  const profilePath = path.join(projectDir, ".codex", "context", "project-profile.md");
  if (!fs.existsSync(profilePath)) {
    return {
      task: null,
      taskStatus: "idle",
      taskClass: null,
      riskLevel: null,
      deliveryMode: null,
      enabledRoles: [],
      enabledModules: [],
      qcPolicy: null,
      submitPolicy: null,
      validationProfileStatus: null,
      workflow: emptyWorkflow,
      workflowPhase: emptyWorkflow.phase,
      workflowChainId: emptyWorkflow.chain_id,
      workflowCurrentChain: emptyWorkflow.current_chain,
      workflowExpectedNextStep: emptyWorkflow.expected_next_step,
      workflowRequiredHandoff: emptyWorkflow.required_handoff,
      workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
      workflowSettlementGuard: emptyWorkflow.settlement_guard,
      workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
      preferredAddress: "Boss",
      greetingStyle: "warm",
      firstStartupGreetingCompleted: false,
      openQuestions: []
    };
  }

  const text = fs.readFileSync(profilePath, "utf8");
  return {
    task: normalizeProfileValue(readProfileField(text, "Current task")) || null,
    taskStatus: normalizeProfileValue(readProfileField(text, "Task status")) || "idle",
    taskClass: normalizeProfileValue(readProfileField(text, "Task class")) || null,
    riskLevel: normalizeProfileValue(readProfileField(text, "Risk level")) || null,
    deliveryMode: normalizeDeliveryModeValue(readProfileField(text, "Selected delivery mode")) || null,
    routeRationale: normalizeProfileValue(readProfileField(text, "Route rationale")) || null,
    enabledRoles: parseProfileList(readProfileField(text, "Enabled roles")),
    enabledModules: parseProfileList(readProfileField(text, "Enabled modules")),
    qcPolicy: normalizeProfileValue(readProfileField(text, "QC policy")) || null,
    submitPolicy: normalizeProfileValue(readProfileField(text, "Submit policy")) || null,
    validationProfileStatus: normalizeProfileValue(readProfileField(text, "Validation profile status")) || null,
    workflow: emptyWorkflow,
    workflowPhase: emptyWorkflow.phase,
    workflowChainId: emptyWorkflow.chain_id,
    workflowCurrentChain: emptyWorkflow.current_chain,
    workflowExpectedNextStep: emptyWorkflow.expected_next_step,
    workflowRequiredHandoff: emptyWorkflow.required_handoff,
    workflowRequiredHandoffTaskId: emptyWorkflow.required_handoff_task_id,
    workflowSettlementGuard: emptyWorkflow.settlement_guard,
    workflowSettlementGuardReason: emptyWorkflow.settlement_guard_reason,
    preferredAddress: normalizeProfileValue(readProfileField(text, "Preferred address")) || "Boss",
    greetingStyle: normalizeProfileValue(readProfileField(text, "Greeting style")) || "warm",
    firstStartupGreetingCompleted:
      normalizeProfileValue(readProfileField(text, "First startup greeting completed")).toLowerCase() === "yes",
    openQuestions: parseProfileList(readProfileField(text, "Open questions"))
  };
}

export function isQcEnabled(profile = {}) {
  const qcPolicy = String(profile.qcPolicy || "").toLowerCase();
  if (qcPolicy === "enabled" || qcPolicy === "required") {
    return true;
  }

  return Array.isArray(profile.enabledModules)
    ? profile.enabledModules.some((item) => /(^|\/)qc\b|quality gate/i.test(String(item)))
    : false;
}

export function isSubmitEnabled(profile = {}, deliveryPolicy = null) {
  const submitPolicy = String(profile.submitPolicy || "").toLowerCase();
  if (submitPolicy === "enabled" || submitPolicy === "required") {
    return true;
  }

  if (submitPolicy === "disabled") {
    return false;
  }

  if (
    Array.isArray(profile.enabledModules) &&
    profile.enabledModules.some((item) => /(^|\/)submit\b|governed submit|delivery/i.test(String(item)))
  ) {
    return true;
  }

  return deliveryPolicy?.submit?.enabled !== false;
}

export function isTaskSettled(profile = {}) {
  const taskStatus = String(profile.taskStatus || "").toLowerCase();
  return taskStatus === "done" || taskStatus === "idle";
}

export function isLongRunningProfile(profile = {}) {
  return normalizeDeliveryModeValue(profile.deliveryMode).toLowerCase() === "long-running";
}
