// Get the background color based on icon color class
export const getBgColor = (iconColorClass: string): string => {
  if (iconColorClass === 'text-primary') return 'bg-primary'
  if (iconColorClass === 'text-accent') return 'bg-accent'
  if (iconColorClass === 'text-secondary') return 'bg-secondary'
  return 'bg-base-content/60'
}

// Get the hover color based on icon color class
export const getHoverColor = (iconColorClass: string): string => {
  if (iconColorClass === 'text-primary') return 'bg-primary/75'
  if (iconColorClass === 'text-accent') return 'bg-accent/75'
  if (iconColorClass === 'text-secondary') return 'bg-secondary/75'
  return 'bg-base-content/60'
}

export const getHoverTextColor = (iconColorClass: string): string => {
  if (iconColorClass === 'text-primary') return 'text-primary/75'
  if (iconColorClass === 'text-accent') return 'text-accent/75'
  if (iconColorClass === 'text-secondary') return 'text-secondary/75'
  return 'text-base-content/60'
}
