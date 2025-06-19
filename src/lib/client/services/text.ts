export function checkScrollNeed(
  container: HTMLDivElement | null,
  content: HTMLSpanElement | null
): boolean {
  if (!container || !content) return false;

  const containerWidth = container.getBoundingClientRect().width;
  const contentWidth = content.getBoundingClientRect().width;

  // Check if content is wider than container. Using getBoundingClientRect for float precision.
  return contentWidth > containerWidth;
}

export function resetAnimation(container: HTMLDivElement | null) {
  if (!container) return;

  const wrapper = container.querySelector('.scroll-wrapper') as HTMLDivElement;
  if (!wrapper) return;

  // Force animation restart by removing and re-adding the animate class
  wrapper.classList.remove('animate');
  wrapper.style.animation = 'none';
  wrapper.style.transform = 'translateX(0)'; // Reset position to start

  // Force reflow
  wrapper.offsetHeight;

  // Re-add animation
  requestAnimationFrame(() => {
    wrapper.style.animation = '';
    wrapper.style.transform = ''; // Clear inline transform
    if (wrapper.classList.contains('needs-scroll')) {
      wrapper.classList.add('animate');
    }
  });
}
