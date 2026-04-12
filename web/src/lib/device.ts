const MOBILE_MAX_WIDTH = 768;
const COARSE_POINTER_QUERY = '(pointer: coarse)';

export function isMobileTouchViewport(targetWindow: Window): boolean {
  return (
    targetWindow.innerWidth <= MOBILE_MAX_WIDTH &&
    targetWindow.matchMedia(COARSE_POINTER_QUERY).matches
  );
}

export function observeMobileTouchViewport(
  targetWindow: Window,
  onChange: (isMobile: boolean) => void,
): () => void {
  const mediaQueryList = targetWindow.matchMedia(COARSE_POINTER_QUERY);
  const emit = () => onChange(isMobileTouchViewport(targetWindow));

  emit();
  targetWindow.addEventListener('resize', emit);

  mediaQueryList.addEventListener('change', emit);
  return () => {
    targetWindow.removeEventListener('resize', emit);
    mediaQueryList.removeEventListener('change', emit);
  };
}
