// Enrutador con el historial del navegador (#/ruta). El botón "atrás" de la barra superior
// vuelve a la pantalla anterior, o al inicio si se abrió directamente.
export class Router {
  constructor(onRoute) {
    this.onRoute = onRoute;
    if (!history.state) history.replaceState({ depth: 0 }, '', location.href);
    window.addEventListener('popstate', () => this.render());
  }

  get current() {
    const raw = location.hash.slice(1) || '/';
    const [path, query] = raw.split('?');
    return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query ?? '')) };
  }

  go(path) {
    history.pushState({ depth: (history.state?.depth ?? 0) + 1 }, '', `#${path}`);
    this.render();
  }

  replace(path) {
    history.replaceState({ depth: history.state?.depth ?? 0 }, '', `#${path}`);
    this.render();
  }

  back(fallback = '/') {
    if ((history.state?.depth ?? 0) > 0) history.back();
    else this.replace(fallback);
  }

  render() {
    this.onRoute(this.current);
  }
}
