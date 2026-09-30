import { useEffect, useState, type CSSProperties } from 'react';

/** Bounded, decorative DOM particles; never capture input or start an animation loop. */
export function VictoryCelebration() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let expired = false;
    const update = () => setActive(!expired && !preference?.matches);
    update();
    preference?.addEventListener('change', update);
    const timer = setTimeout(() => { expired = true; setActive(false); }, 4200);
    return () => { clearTimeout(timer); preference?.removeEventListener('change', update); };
  }, []);
  return <div className="victory-celebration" aria-hidden="true" data-active={active}>
    {active && Array.from({ length: 36 }, (_, i) => <i key={i} style={{
      '--x': `${(i * 37 % 100)}%`, '--delay': `${i % 9 * .08}s`,
      '--drift': `${(i % 7 - 3) * 22}px`, '--turn': `${(i % 2 ? 1 : -1) * (180 + i * 21)}deg`,
      '--paper': ['#ffe18a', '#76dfce', '#fff8df', '#eaa28c'][i % 4],
    } as CSSProperties} />)}
  </div>;
}
