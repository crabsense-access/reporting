"use client";

import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface CrbLogoProps {
  className?: string;
}

// Isologo de Crabsense, con una respiración muy sutil (escala + opacidad) en
// loop infinito — reemplaza el círculo placeholder del rail de navegación.
export function CrbLogo({ className }: CrbLogoProps) {
  return (
    <motion.div
      className={cn("shrink-0", className)}
      animate={{ scale: [1, 1.06, 1], opacity: [1, 0.85, 1] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 434.38 500" fill="none" className="h-full w-full">
        <g stroke="#5f9699" strokeWidth={17} strokeLinejoin="round">
          <polygon
            strokeLinecap="round"
            points="116.89 366.38 15.09 308.07 15.09 424.72 116.89 483.03 218.73 424.72 218.73 424.69 218.69 308.07 116.89 366.38"
          />
          <polygon
            strokeLinecap="square"
            points="218.69 308.07 15.09 191.38 116.89 133.16 320.49 249.77 422.33 191.42 116.89 16.51 15.09 74.85 116.89 133.16 116.93 133.12 116.89 133.16 15.09 74.85 15.09 308.07 116.91 249.74 15.09 308.07 116.89 366.38 218.69 308.07"
          />
          <polygon points="320.53 249.77 320.49 249.77 218.69 308.07 218.73 424.69 320.53 366.38 320.53 366.38 320.53 249.77" />
          <polygon points="320.49 249.77 320.49 249.77 320.53 249.77 320.53 366.38 320.53 366.38 320.53 366.38 422.33 308.07 422.33 191.42 320.49 249.77" />
          <polygon points="15.17 191.42 116.91 249.74 218.69 308.07 320.49 249.77 320.49 249.77 320.49 249.77 116.89 133.16 15.17 191.42" />
        </g>
      </svg>
    </motion.div>
  );
}
