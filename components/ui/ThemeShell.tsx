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
    // Two things at once:
    // - the surface colour is painted here, not only on the fixed background
    //   layer, so scrolled content always sits on the theme;
    // - `isolate` establishes a stacking context, which keeps the background's
    //   negative z-index *inside* this element. Without it the layer escapes to
    //   the root and paints behind the surface colour above, hiding the
    //   animation and any background image entirely.
    <div
      className={`isolate relative min-h-dvh ${className}`}
      style={{ ...themeVars(theme), background: theme.surface }}
    >
      <AnimatedBackground
        kind={theme.bgAnimation}
        accent={theme.accent}
        glow={preset.glow}
        surface={theme.surface}
        subtle={subtle}
        image={theme.bgImage}
        imageFit={theme.bgImageFit}
        imageDim={theme.bgImageDim}
      />
      {children}
    </div>
  );
}
