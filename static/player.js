(() => {
  const config = window.BEAMER_SCORM;
  const image = document.getElementById('slideImage');
  const canvas = document.getElementById('ink');
  const ctx = canvas.getContext('2d');
  const slideFrame = document.getElementById('slideFrame');
  const slideLabel = document.getElementById('slideLabel');
  const slideNumber = document.getElementById('slideNumber');
  const prevButton = document.getElementById('prev');
  const nextButton = document.getElementById('next');

  const storageKey = `beamer_scorm_ink_${location.pathname}`;
  let tool = 'pointer';
  let drawing = false;
  let currentStroke = null;
  let currentSlide = 0;
  let annotations = {};

  function slideStrokes() {
    const key = String(currentSlide);
    if (!Array.isArray(annotations[key])) annotations[key] = [];
    return annotations[key];
  }

  function loadState() {
    let raw = '';
    try {
      raw = SCORM.get('cmi.suspend_data') || '';
    } catch (_) {}

    if (!raw) raw = localStorage.getItem(storageKey) || '';

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.annotations) annotations = parsed.annotations;
        if (Number.isInteger(parsed.slide)) currentSlide = parsed.slide;
      } catch (_) {
        annotations = {};
      }
    }

    try {
      const lmsLocation = parseInt(SCORM.get('cmi.location'), 10);
      if (Number.isFinite(lmsLocation) && lmsLocation >= 1) currentSlide = lmsLocation - 1;
    } catch (_) {}

    currentSlide = Math.max(0, Math.min(config.slideCount - 1, currentSlide));
  }

  function saveState() {
    const payload = JSON.stringify({ slide: currentSlide, annotations });
    localStorage.setItem(storageKey, payload);

    try {
      // SCORM 2004 allows substantially more suspend_data than SCORM 1.2,
      // but LMS implementations can differ. Keep localStorage as full fallback.
      if (payload.length <= 60000) SCORM.set('cmi.suspend_data', payload);
      SCORM.set('cmi.location', String(currentSlide + 1));
      const progress = config.slideCount <= 1 ? 1 : currentSlide / (config.slideCount - 1);
      SCORM.set('cmi.progress_measure', String(Math.max(0, Math.min(1, progress))));
      SCORM.set('cmi.completion_status', currentSlide === config.slideCount - 1 ? 'completed' : 'incomplete');
    } catch (_) {}
  }

  function fitCanvas() {
    const stage = document.getElementById('stage');
    const naturalWidth = image.naturalWidth || 1;
    const naturalHeight = image.naturalHeight || 1;
    const availableWidth = Math.max(1, stage.clientWidth);
    const availableHeight = Math.max(1, stage.clientHeight);

    // Scale the actual <img> element to the largest size that fits the viewport
    // while preserving the Beamer slide aspect ratio.
    const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
    const displayWidth = Math.max(1, Math.floor(naturalWidth * scale));
    const displayHeight = Math.max(1, Math.floor(naturalHeight * scale));

    slideFrame.style.width = `${displayWidth}px`;
    slideFrame.style.height = `${displayHeight}px`;
    image.style.width = `${displayWidth}px`;
    image.style.height = `${displayHeight}px`;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.width = Math.round(displayWidth * dpr);
    canvas.height = Math.round(displayHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
  }

  function drawStroke(stroke) {
    if (!stroke.pts || stroke.pts.length < 2) return;
    const rect = canvas.getBoundingClientRect();

    ctx.save();
    ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.28 : 1;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();

    stroke.pts.forEach((p, index) => {
      const x = p.x * rect.width;
      const y = p.y * rect.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    slideStrokes().forEach(drawStroke);
  }

  function renderSlide() {
    image.onload = () => requestAnimationFrame(fitCanvas);
    image.src = config.slides[currentSlide];
    slideLabel.textContent = `Slide ${currentSlide + 1} / ${config.slideCount}`;
    slideNumber.value = currentSlide + 1;
    prevButton.disabled = currentSlide === 0;
    nextButton.disabled = currentSlide === config.slideCount - 1;
    saveState();
  }

  function goTo(index) {
    const target = Math.max(0, Math.min(config.slideCount - 1, index));
    if (target === currentSlide) return;
    currentSlide = target;
    renderSlide();
  }

  document.querySelectorAll('[data-tool]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tool]').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      tool = button.dataset.tool;
      canvas.style.pointerEvents = tool === 'pointer' ? 'none' : 'auto';
      canvas.style.cursor = tool === 'pointer' ? 'default' : 'crosshair';
    });
  });

  document.querySelector('[data-tool="pointer"]').classList.add('active');

  canvas.addEventListener('pointerdown', event => {
    if (tool === 'pointer') return;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    currentStroke = {
      tool,
      color: document.getElementById('color').value,
      size: Number(document.getElementById('size').value),
      pts: [pointFromEvent(event)]
    };
    slideStrokes().push(currentStroke);
  });

  canvas.addEventListener('pointermove', event => {
    if (!drawing || !currentStroke) return;
    currentStroke.pts.push(pointFromEvent(event));
    redraw();
  });

  function finishDrawing(event) {
    if (!drawing) return;
    drawing = false;
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    currentStroke = null;
    saveState();
  }

  canvas.addEventListener('pointerup', finishDrawing);
  canvas.addEventListener('pointercancel', finishDrawing);

  document.getElementById('undo').addEventListener('click', () => {
    slideStrokes().pop();
    redraw();
    saveState();
  });

  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm(`Hapus semua coretan pada slide ${currentSlide + 1}?`)) return;
    annotations[String(currentSlide)] = [];
    redraw();
    saveState();
  });

  prevButton.addEventListener('click', () => goTo(currentSlide - 1));
  nextButton.addEventListener('click', () => goTo(currentSlide + 1));

  slideNumber.addEventListener('change', () => {
    const value = parseInt(slideNumber.value, 10);
    if (Number.isFinite(value)) goTo(value - 1);
    else slideNumber.value = currentSlide + 1;
  });

  document.getElementById('fullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  });

  document.addEventListener('keydown', event => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT') return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(currentSlide - 1);
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') goTo(currentSlide + 1);
  });

  window.addEventListener('resize', () => requestAnimationFrame(fitCanvas));
  window.addEventListener('beforeunload', saveState);

  loadState();
  renderSlide();
})();
