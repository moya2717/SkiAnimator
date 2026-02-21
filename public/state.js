export const initialState = {
  difficultyFilter: 'all',
  sportFilter: 'all',
  searchTerm: '',
  selectedRunId: null,
  runs: [],
  activities: []
};

function includesSearch(runOrActivity, term) {
  if (!term) {
    return true;
  }

  const haystack = `${runOrActivity.name} ${runOrActivity.sportType ?? ''}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export function selectVisibleRuns(state) {
  return state.runs.filter((run) => {
    const passesDifficulty = state.difficultyFilter === 'all' || run.difficulty === state.difficultyFilter;
    const passesSearch = includesSearch(run, state.searchTerm);
    return passesDifficulty && passesSearch;
  });
}

export function selectVisibleActivities(state) {
  return state.activities.filter((activity) => {
    const passesSport = state.sportFilter === 'all' || activity.sportType === state.sportFilter;
    const passesSearch = includesSearch(activity, state.searchTerm);
    return passesSport && passesSearch;
  });
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'dashboard/set': {
      const runs = action.payload.runs ?? [];
      const activities = action.payload.activities ?? [];
      const hasSelectedRun = runs.some((run) => run.id === state.selectedRunId);

      return {
        ...state,
        runs,
        activities,
        selectedRunId: hasSelectedRun ? state.selectedRunId : null
      };
    }
    case 'difficulty/set': {
      const next = { ...state, difficultyFilter: action.payload };
      const selectedVisible = selectVisibleRuns(next).some((run) => run.id === state.selectedRunId);
      return { ...next, selectedRunId: selectedVisible ? state.selectedRunId : null };
    }
    case 'sport/set':
      return { ...state, sportFilter: action.payload };
    case 'search/set': {
      const next = { ...state, searchTerm: action.payload };
      const selectedVisible = selectVisibleRuns(next).some((run) => run.id === state.selectedRunId);
      return { ...next, selectedRunId: selectedVisible ? state.selectedRunId : null };
    }
    case 'run/select':
      return { ...state, selectedRunId: action.payload };
    default:
      return state;
  }
}
