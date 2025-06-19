// INTERACTIONS
export function focusFirstChildOfResourceIndex(
  event: KeyboardEvent,
  listContainer: HTMLElement | null
) {
  event.preventDefault();

  // Use setTimeout to ensure virtual list has rendered
  setTimeout(() => {
    // Look specifically for the first row button in the virtual list
    let firstItem = listContainer?.querySelector(
      '.virtual-list-items > div:first-child [role="button"][tabindex="0"]'
    ) as HTMLElement;

    if (!firstItem) {
      // Fallback: any focusable row element with tabindex="0"
      firstItem = listContainer?.querySelector(
        '[role="button"][tabindex="0"]'
      ) as HTMLElement;
    }

    if (!firstItem) {
      // Another fallback: any element with tabindex="0"
      firstItem = listContainer?.querySelector('[tabindex="0"]') as HTMLElement;
    }

    if (firstItem) {
      firstItem.focus();
    } else {
      console.warn('Could not find first item to focus');
    }
  }, 0);
}
