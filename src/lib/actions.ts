export function clickOutside(
  element: HTMLElement,
  callbackFunction: (event: MouseEvent) => void
) {
  function onClick(event: MouseEvent) {
    if (!element.contains(event.target as Node)) {
      callbackFunction(event);
    }
  }

  document.body.addEventListener('click', onClick);

  return {
    update(newCallbackFunction: () => void) {
      callbackFunction = newCallbackFunction;
    },
    destroy() {
      document.body.removeEventListener('click', onClick);
    }
  };
}

export function focusOnSlash(
  element: HTMLElement,
  callbackFunction: () => void | undefined
) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === '/') {
      element.focus();
      event.preventDefault();
      event.stopPropagation();
      callbackFunction?.();
    }
  }
  document.body.addEventListener('keydown', onKeyDown);
  return {
    update(newCallbackFunction: () => void) {
      callbackFunction = newCallbackFunction;
    },
    destroy() {
      document.body.removeEventListener('keydown', onKeyDown);
    }
  };
}

export function handleEscape(element: HTMLElement, callbackFunction: () => void) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      callbackFunction();
      event.preventDefault();
      event.stopPropagation();
    }
  }
  element.addEventListener('keydown', onKeyDown);
  return {
    update(newCallbackFunction: () => void) {
      callbackFunction = newCallbackFunction;
    },
    destroy() {
      element.removeEventListener('keydown', onKeyDown);
    }
  };
}

export function selectOnEnter(element: HTMLElement, callbackFunction: () => void) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      callbackFunction();
      event.preventDefault();
      event.stopPropagation();
    }
  }
  element.addEventListener('keydown', onKeyDown);
  return {
    update(newCallbackFunction: () => void) {
      callbackFunction = newCallbackFunction;
    },
    destroy() {
      element.removeEventListener('keydown', onKeyDown);
    }
  };
}
