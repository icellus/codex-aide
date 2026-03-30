export function upsertPendingAction(state, action) {
  const index = state.pendingActions.findIndex((item) => item.id === action.id);
  if (index >= 0) {
    state.pendingActions[index] = {
      ...state.pendingActions[index],
      ...action,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.pendingActions.push({
    ...action,
    createdAt: action.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function removePendingActions(state, predicate) {
  state.pendingActions = state.pendingActions.filter((item) => !predicate(item));
}

export function upsertGovernanceQueueItem(state, entry) {
  const index = state.governanceQueue.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    state.governanceQueue[index] = {
      ...state.governanceQueue[index],
      ...entry,
      updatedAt: new Date().toISOString()
    };
    return;
  }

  state.governanceQueue.push({
    ...entry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function trimRuntimeState(state) {
  const failurePatternEntries = Object.entries(state.failurePatterns || {}).sort((left, right) => {
    const leftSeen = new Date(left[1]?.lastSeenAt || left[1]?.firstSeenAt || 0).getTime();
    const rightSeen = new Date(right[1]?.lastSeenAt || right[1]?.firstSeenAt || 0).getTime();
    return rightSeen - leftSeen;
  });

  state.recentSubagentEvents = state.recentSubagentEvents.slice(-15);
  state.pendingActions = state.pendingActions.slice(-12);
  state.governanceQueue = state.governanceQueue.slice(-12);
  state.completedTasks = state.completedTasks.slice(-12);
  state.qualityMetrics.recentQcRuns = state.qualityMetrics.recentQcRuns.slice(-15);
  state.failurePatterns = Object.fromEntries(failurePatternEntries.slice(0, 24));
  state.updatedAt = new Date().toISOString();
}
