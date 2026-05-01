"use client";

import { useEffect } from "react";

export function MouseTracker() {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.body.style.setProperty('--mouse-x', `${x}%`);
      document.body.style.setProperty('--mouse-y', `${y}%`);
    };
    
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return null;
}
