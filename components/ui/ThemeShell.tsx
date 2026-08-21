"use client";

import type { ReactNode } from "react";
import type { Theme } from "@/types/quiz";
import { getPreset, themeVars } from "@/lib/themes";
import { AnimatedBackground } from "@/components/bg/AnimatedBackground";

interface Props {
  theme: Theme;
  children: ReactNode;
  className?: string;
  /** Tones the background down behind dense UI such as the builder. */
  subtle?: boolean;
}

/**
 * Applies a quiz's theme as CSS variables and paints its animated background.
 * Every surface that shows quiz content wraps in this, so the builder preview
 * and the live stage can't drift apart.
 */
export function ThemeShell({ theme, children, className = "", subtle = false }: Props) {
  const preset = getPreset(theme.preset);

  return (
    // The surface colour is painted by this in-flow element, not only by the
    // fixed background layer, so scrolled content always sits on the theme
    // rather than the app's near-black default.
    <div className={`relative min-h-dvh ${className}`} style={{ ...themeVars(theme), background: theme.surface }}>
      <AnimatedBackground
        kind={theme.bgAnimation}
        accent={theme.accent}
        glow={preset.glow}
        surface={theme.surface}
        subtle={subtle}
      />
      {children}
    </div>
  );
}
