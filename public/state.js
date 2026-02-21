export const initialState = {
  difficultyFilter: 'all',
  yearFilter: 'all',
  dayFilter: 'all',
  searchTerm: '',
  selectedRunId: null,
  runs: [],
  activities: []
};

function activityDay(activity) {
  if (!activity?.startDateLocal) {
    return null;
  }

  return String(activity.startDateLocal).slice(0, 10);
}

function activityYear(activity) {
  const day = activityDay(activity);
  return day ? day.slice(0, 4) : null;
}

function includesSearch(runOrActivity, term) {
  if (!term) {
    return true;
  }

  const haystack = `${runOrActivity.name} ${runOrActivity.sportType ?? ''}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export function selectVisibleRuns(state) {
  const visibleActivityIds = new Set(selectVisibleActivities(state).map((activity) => activity.id));
  return state.runs.filter((run) => {
    const passesDifficulty = state.difficultyFilter === 'all' || run.difficulty === state.difficultyFilter;
    const passesSearch = includesSearch(run, state.searchTerm);
    const passesDayScope = visibleActivityIds.size === 0 || visibleActivityIds.has(run.id);
    return passesDifficulty && passesSearch && passesDayScope;
  });
}

export function selectVisibleActivities(state) {
  return state.activities.filter((activity) => {
    const year = activityYear(activity);
    const day = activityDay(activity);
    const passesYear = state.yearFilter === 'all' || year === state.yearFilter;
    const passesDay = state.dayFilter === 'all' || day === state.dayFilter;
    const passesSearch = includesSearch(activity, state.searchTerm);
    return passesYear && passesDay && passesSearch;
  });
}

export function selectAvailableYears(state) {
  return [...new Set(state.activities.map(activityYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

export function selectAvailableDays(state) {
  return [...new Set(
    state.activities
      .filter((activity) => state.yearFilter === 'all' || activityYear(activity) === state.yearFilter)
      .map(activityDay)
      .filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));
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
    case 'year/set': {
      const next = { ...state, yearFilter: action.payload, dayFilter: 'all' };
      const selectedVisible = selectVisibleRuns(next).some((run) => run.id === state.selectedRunId);
      return { ...next, selectedRunId: selectedVisible ? state.selectedRunId : null };
    }
    case 'day/set': {
      const next = { ...state, dayFilter: action.payload };
      const selectedVisible = selectVisibleRuns(next).some((run) => run.id === state.selectedRunId);
      return { ...next, selectedRunId: selectedVisible ? state.selectedRunId : null };
    }
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
