export const initialState = {
  filter: 'all',
  selectedRunId: null,
  runs: []
};

function isVisible(run, filter) {
  return filter === 'all' || run.difficulty === filter;
}

export function selectVisibleRuns(runs, filter) {
  return runs.filter((run) => isVisible(run, filter));
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'runs/set': {
      const runs = action.payload;
      const hasSelectedRun = runs.some((run) => run.id === state.selectedRunId);
      return {
        ...state,
        runs,
        selectedRunId: hasSelectedRun ? state.selectedRunId : null
      };
    }
    case 'filter/set': {
      const filter = action.payload;
      const visibleRuns = selectVisibleRuns(state.runs, filter);
      const selectedRunVisible = visibleRuns.some((run) => run.id === state.selectedRunId);
      return {
        ...state,
        filter,
        selectedRunId: selectedRunVisible ? state.selectedRunId : null
      };
    }
    case 'run/select':
      return { ...state, selectedRunId: action.payload };
    case 'selection/clear':
      return { ...state, selectedRunId: null };
    default:
      return state;
  }
}
