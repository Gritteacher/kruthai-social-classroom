import { useLayoutEffect, useRef, useState } from 'react';

export function useChatViewport(active: boolean) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useLayoutEffect(() => {
    if (!active) return;
    const page = pageRef.current;
    if (!page) return;
    const viewport = window.visualViewport;
    const shell = page.closest('.app-shell');
    const navigation = shell?.querySelector<HTMLElement>('.bottom-nav');
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        const bottom = height + (viewport?.offsetTop ?? 0);
        const keyboard = window.innerHeight - height > 140 &&
          page.contains(document.activeElement) &&
          /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '');
        setKeyboardOpen(keyboard);
        const nav = navigation?.getBoundingClientRect();
        const reserve = !keyboard && nav?.height ? window.innerHeight - nav.top + 10 : 12;
        page.style.setProperty('--ai-viewport-height', `${Math.max(160, bottom - page.getBoundingClientRect().top - reserve)}px`);
      });
    };
    window.scrollTo({ top: 0, behavior: 'instant' });
    const observer = new ResizeObserver(measure);
    if (shell?.querySelector('.top-bar')) observer.observe(shell.querySelector('.top-bar')!);
    if (navigation) observer.observe(navigation);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    page.addEventListener('focusin', measure);
    page.addEventListener('focusout', measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      page.removeEventListener('focusin', measure);
      page.removeEventListener('focusout', measure);
    };
  }, [active]);

  return { pageRef, keyboardOpen };
}
