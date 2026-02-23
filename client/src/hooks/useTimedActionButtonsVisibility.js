export function useTimedActionButtonsVisibility() {
  // Safety timer disabled by request: action buttons should stay visible permanently.
  const noop = () => {};

  return {
    actionButtonsVisible: true,
    actionButtonsRemainingSeconds: Number.POSITIVE_INFINITY,
    actionButtonsRemainingLabel: '∞',
    enableActionButtonsForTenMinutes: noop,
    disableActionButtonsNow: noop,
    setActionButtonsVisible: noop
  };
}
