(() => {
  const canvas = document.querySelector("[data-home-network]");
  const context = canvas?.getContext("2d");
  if (!context) return;

  const background = document.createElement("canvas");
  const backgroundContext = background.getContext("2d");
  if (!backgroundContext) return;

  const panel = canvas.closest("[data-home-network-panel]");
  const toggle = panel?.querySelector("[data-network-toggle]");
  const toggleLabel = toggle?.querySelector("[data-network-toggle-label]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fullCircle = Math.PI * 2;
  const hubSpecs = [
    { x: 0.19, y: 0.60, radius: 0.086, color: "103, 237, 211", sides: 4 },
    { x: 0.50, y: 0.43, radius: 0.109, color: "87, 226, 239", sides: 6 },
    { x: 0.81, y: 0.31, radius: 0.095, color: "116, 191, 252", sides: 5 }
  ];

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let hubs = [];
  let routes = [];
  let frame = null;
  let lastFrameTime = null;
  let elapsed = 0;
  let manuallyPaused = false;
  let inView = !("IntersectionObserver" in window);

  function tint(color, opacity) {
    return `rgba(${color}, ${opacity})`;
  }

  function circle(ctx, x, y, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, fullCircle);
  }

  function createRoute(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) / distance;
    const dy = (to.y - from.y) / distance;
    const start = { x: from.x + dx * from.r, y: from.y + dy * from.r };
    const end = { x: to.x - dx * to.r, y: to.y - dy * to.r };
    const control = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - distance * 0.21 };
    return { start, end, control, color: from.color };
  }

  function pointAt({ start, end, control }, progress) {
    const remaining = 1 - progress;
    return {
      x: remaining ** 2 * start.x + 2 * remaining * progress * control.x + progress ** 2 * end.x,
      y: remaining ** 2 * start.y + 2 * remaining * progress * control.y + progress ** 2 * end.y
    };
  }

  function drawGrid(ctx) {
    const spacing = 20;
    ctx.strokeStyle = "rgba(119, 200, 217, 0.10)";
    ctx.fillStyle = "rgba(141, 217, 227, 0.26)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = width % spacing / 2; x < width; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      for (let y = height % spacing / 2; y < height; y += spacing) {
        ctx.fillRect(x - 0.65, y - 0.65, 1.3, 1.3);
      }
    }
    for (let y = height % spacing / 2; y < height; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  function drawRoute(ctx, route) {
    const { start, control, end, color } = route;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
    ctx.strokeStyle = tint(color, 0.10);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = tint(color, 0.62);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = tint(color, 0.42);
    for (const progress of [0.20, 0.40, 0.60, 0.80]) {
      const point = pointAt(route, progress);
      circle(ctx, point.x, point.y, 1.6);
      ctx.fill();
    }
  }

  function drawHub(ctx, { x, y, r, color, sides }) {
    const glow = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * 2.25);
    glow.addColorStop(0, tint(color, 0.25));
    glow.addColorStop(0.55, tint(color, 0.09));
    glow.addColorStop(1, tint(color, 0));
    ctx.fillStyle = glow;
    circle(ctx, x, y, r * 2.25);
    ctx.fill();

    circle(ctx, x, y, r);
    ctx.fillStyle = "rgba(7, 24, 36, 0.82)";
    ctx.fill();
    ctx.strokeStyle = tint(color, 0.78);
    ctx.lineWidth = 1;
    ctx.stroke();

    circle(ctx, x, y, r * 1.26);
    ctx.strokeStyle = tint(color, 0.40);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const nodes = Array.from({ length: sides }, (_, index) => {
      const angle = fullCircle * index / sides + Math.PI / 4;
      return { x: x + Math.cos(angle) * r * 0.56, y: y + Math.sin(angle) * r * 0.56 };
    });
    ctx.beginPath();
    ctx.moveTo(nodes.at(-1).x, nodes.at(-1).y);
    for (const node of nodes) ctx.lineTo(node.x, node.y);
    for (const node of nodes) {
      ctx.moveTo(x, y);
      ctx.lineTo(node.x, node.y);
    }
    ctx.strokeStyle = tint(color, 0.51);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = tint(color, 0.93);
    for (const node of nodes) {
      circle(ctx, node.x, node.y, 1.6);
      ctx.fill();
    }
    circle(ctx, x, y, 3);
    ctx.fill();
  }

  function drawPacket(ctx, route, progress) {
    const head = pointAt(route, progress);
    const tailProgress = Math.max(0, progress - 0.22);
    const tail = pointAt(route, tailProgress);
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gradient.addColorStop(0, tint(route.color, 0));
    gradient.addColorStop(1, tint(route.color, 0.92));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    for (let step = 1; step <= 6; step++) {
      const point = pointAt(route, tailProgress + (progress - tailProgress) * step / 6);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();

    circle(ctx, head.x, head.y, 2.6);
    ctx.fillStyle = "rgba(223, 255, 253, 0.96)";
    ctx.fill();
  }

  function render() {
    context.clearRect(0, 0, width, height);
    context.drawImage(background, 0, 0, width, height);
    if (reducedMotion.matches) return;

    routes.forEach((route, index) => drawPacket(context, route, (elapsed * 0.32 + 0.25 + index * 0.46) % 1));
    hubs.forEach((hub, index) => {
      const expansion = (elapsed * 0.46 + index * 0.25) % 1;
      circle(context, hub.x, hub.y, hub.r * (1.1 + expansion * 0.55));
      context.lineWidth = 1;
      context.strokeStyle = tint(hub.color, (1 - expansion) * 0.45);
      context.stroke();
    });
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const measuredWidth = Math.round(bounds.width);
    const measuredHeight = Math.round(bounds.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!measuredWidth || !measuredHeight) return;
    if (measuredWidth === width && measuredHeight === height && dpr === pixelRatio) return;

    width = measuredWidth;
    height = measuredHeight;
    pixelRatio = dpr;
    canvas.width = background.width = Math.round(width * pixelRatio);
    canvas.height = background.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    backgroundContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const scale = Math.min(width, height);
    hubs = hubSpecs.map((hub) => ({ ...hub, x: hub.x * width, y: hub.y * height, r: hub.radius * scale }));
    routes = [createRoute(hubs[0], hubs[1]), createRoute(hubs[1], hubs[2])];
    drawGrid(backgroundContext);
    routes.forEach((route) => drawRoute(backgroundContext, route));
    hubs.forEach((hub) => drawHub(backgroundContext, hub));
    render();
    panel?.toggleAttribute("data-network-ready", true);
    updatePlayback();
  }

  function canAnimate() {
    return width > 0 && inView && !document.hidden && !manuallyPaused && !reducedMotion.matches;
  }

  function animate(timestamp) {
    frame = null;
    if (!canAnimate()) return;
    if (lastFrameTime === null) lastFrameTime = timestamp;

    const delta = timestamp - lastFrameTime;
    if (delta >= 30) {
      elapsed += Math.min(delta, 50) / 1000;
      render();
      lastFrameTime = timestamp;
    }
    frame = window.requestAnimationFrame(animate);
  }

  function updatePlayback() {
    if (toggle) {
      toggle.hidden = !width || reducedMotion.matches;
      toggle.setAttribute("aria-label", manuallyPaused ? "Play animation" : "Pause animation");
    }
    if (toggleLabel) toggleLabel.textContent = manuallyPaused ? "Play" : "Pause";

    if (canAnimate()) {
      if (frame === null) frame = window.requestAnimationFrame(animate);
    } else {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      lastFrameTime = null;
    }
  }

  toggle?.addEventListener("click", () => {
    manuallyPaused = !manuallyPaused;
    updatePlayback();
  });
  reducedMotion.addEventListener("change", () => {
    if (width) render();
    updatePlayback();
  });
  document.addEventListener("visibilitychange", updatePlayback);
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      updatePlayback();
    }).observe(canvas);
  }
  resize();
})();
