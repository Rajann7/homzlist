/**
 * Inline, render-blocking script that applies the saved theme BEFORE first paint
 * — prevents a flash of the wrong mode (Doc1 §1.2 dark = token swap).
 * Theme choice is a UI preference (not business data), so localStorage is fine.
 */
export function ThemeScript() {
  const code = `(function(){try{
    var t = localStorage.getItem('hz-theme');
    var d = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = document.documentElement;
    root.classList.toggle('dark', d);
    if (t) root.setAttribute('data-theme', t);
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
