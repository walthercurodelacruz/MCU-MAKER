/* Monaco themes wired to the app's workbench ramp.
 *
 * Monaco paints into a canvas-backed DOM of its own and cannot read CSS
 * custom properties, so the two themes below restate the ramp as literals.
 * They are the ONLY place in the app allowed to do that; if
 * tokens/colors.css moves a --wb-* value, move it here too or the editor
 * will sit a shade off the panel around it.
 *
 * `mcu-maker-dark` is built on vs-dark and keeps its token colors — the dark
 * editor is unchanged from before the theme switch existed. `mcu-maker-light`
 * is built on vs (Light+) for the same reason: readers know those syntax
 * colors from VS Code and the Arduino IDE.
 */
import type { Monaco } from '@monaco-editor/react';

export const MONACO_DARK = 'mcu-maker-dark';
export const MONACO_LIGHT = 'mcu-maker-light';

/** Editor chrome per theme. Mirrors --wb-* in tokens/colors.css. */
const DARK = {
  bg: '#0c111c', // --wb-2
  gutter: '#0c111c',
  lineNumber: '#5e7a9e', // --wb-9
  lineNumberActive: '#dbe5f1', // --wb-12
  indentGuide: '#22314d', // --wb-6
  currentLine: '#121826',
  selection: '#1e304f',
  widgetBg: '#101725', // --wb-3
  widgetBorder: '#2d4063',
  scrollShadow: '#000000',
};

const LIGHT = {
  bg: '#ffffff', // --wb-2 (light)
  gutter: '#ffffff',
  lineNumber: '#8c949e', // --wb-9 (light)
  lineNumberActive: '#24292f', // --wb-12 (light)
  indentGuide: '#d0d0d6', // --wb-7 (light)
  currentLine: '#f3f6fa',
  selection: '#add6ff',
  widgetBg: '#f3f3f4', // --wb-3 (light)
  widgetBorder: '#d0d0d6',
  scrollShadow: '#dddddd',
};

function colors(c: typeof DARK): Record<string, string> {
  return {
    'editor.background': c.bg,
    'editorGutter.background': c.gutter,
    'editorLineNumber.foreground': c.lineNumber,
    'editorLineNumber.activeForeground': c.lineNumberActive,
    'editorIndentGuide.background1': c.indentGuide,
    'editor.lineHighlightBackground': c.currentLine,
    'editor.selectionBackground': c.selection,
    // The hover / suggest / signature popups. They escape the editor box as
    // fixed overlays (fixedOverflowWidgets), so they land on top of the
    // canvas and have to read as app chrome, not as a stray dark rectangle.
    'editorWidget.background': c.widgetBg,
    'editorWidget.border': c.widgetBorder,
    'editorSuggestWidget.background': c.widgetBg,
    'editorSuggestWidget.border': c.widgetBorder,
    'editorHoverWidget.background': c.widgetBg,
    'editorHoverWidget.border': c.widgetBorder,
    'input.background': c.bg,
    'dropdown.background': c.widgetBg,
    'scrollbar.shadow': c.scrollShadow,
    'minimap.background': c.bg,
  };
}

/** Register both themes on a monaco instance. Idempotent per instance —
 *  CodeEditor remounts per file (the `key` prop) and would otherwise
 *  redefine these on every tab switch. */
export function defineMcuMakerThemes(monaco: Monaco): void {
  const g = monaco as unknown as { __mcu_makerThemes?: boolean };
  if (g.__mcu_makerThemes) return;
  g.__mcu_makerThemes = true;

  monaco.editor.defineTheme(MONACO_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: colors(DARK),
  });

  monaco.editor.defineTheme(MONACO_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: colors(LIGHT),
  });
}

export function monacoThemeFor(resolved: 'dark' | 'light'): string {
  return resolved === 'light' ? MONACO_LIGHT : MONACO_DARK;
}
