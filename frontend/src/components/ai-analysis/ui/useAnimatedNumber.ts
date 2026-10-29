"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

export function useAnimatedNumber(target: number, duration = 700): number {
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    const controls = animate(from, target, {
      duration: duration / 1000,
      ease: "easeOut",
      onUpdate: (v) => {
        currentRef.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [target, duration]);

  return display;
}
