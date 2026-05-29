import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

// Лёгкий кадратор без зависимостей: pan (перетаскивание) + zoom (ползунок),
// рамка нужного соотношения сторон с направляющими «как обрежется на узких окнах»,
// экспорт через canvas. Есть запасной путь «без обрезки».
//
// props:
//   show, src (objectURL/URL изображения), mode ('desktop' | 'mobile'),
//   busy, onCancel(), onConfirm(blob), onUseAsIs()

const OUTPUT = {
  desktop: { w: 1280, h: 320 }, // широкий баннер ПК (≈4:1)
  mobile: { w: 720, h: 400 } // баннер для телефона (≈1.8:1)
};

function BannerCropModal({ show, src, mode = 'desktop', busy = false, onCancel, onConfirm, onUseAsIs }) {
  const out = OUTPUT[mode] || OUTPUT.desktop;
  const aspect = out.w / out.h;

  const viewportRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Замер вьюпорта (он адаптивный по ширине модалки).
  const measure = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setVp({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    if (!show) return undefined;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [show, measure]);

  // Сброс при открытии/смене картинки.
  useEffect(() => {
    if (show) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [show, src]);

  const baseScale = (natural.w && natural.h && vp.w && vp.h)
    ? Math.max(vp.w / natural.w, vp.h / natural.h)
    : 1;
  const scale = baseScale * zoom;
  const imgW = natural.w * scale;
  const imgH = natural.h * scale;

  const clamp = useCallback((next) => {
    const minX = Math.min(0, vp.w - imgW);
    const minY = Math.min(0, vp.h - imgH);
    return {
      x: Math.max(minX, Math.min(0, next.x)),
      y: Math.max(minY, Math.min(0, next.y))
    };
  }, [vp.w, vp.h, imgW, imgH]);

  // Центрируем при изменении зума/картинки/вьюпорта.
  useEffect(() => {
    if (!imgW || !imgH || !vp.w || !vp.h) return;
    setOffset((prev) => clamp({
      x: prev.x || (vp.w - imgW) / 2,
      y: prev.y || (vp.h - imgH) / 2
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgW, imgH, vp.w, vp.h]);

  const onImgLoad = (e) => {
    const el = e.currentTarget;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    measure();
  };

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleConfirm = () => {
    const imgEl = imgRef.current;
    if (!imgEl || !vp.w || !vp.h || !scale) { onUseAsIs?.(); return; }
    try {
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sW = vp.w / scale;
      const sH = vp.h / scale;
      const canvas = document.createElement('canvas');
      canvas.width = out.w;
      canvas.height = out.h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.w, out.h);
      ctx.drawImage(imgEl, sx, sy, sW, sH, 0, 0, out.w, out.h);
      canvas.toBlob((blob) => {
        if (blob) onConfirm?.(blob);
        else onUseAsIs?.();
      }, 'image/jpeg', 0.9);
    } catch (_) {
      onUseAsIs?.(); // канвас «затаинтился» или ошибка — грузим оригинал
    }
  };

  // Направляющие: вложенные центрированные рамки «широкое → узкое окно».
  const guideWidths = mode === 'desktop' ? [1, 0.66, 0.42] : [1, 0.7];

  return (
    <Modal show={show} onHide={onCancel} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          {mode === 'desktop' ? 'Кадрирование (ПК / широкий экран)' : 'Кадрирование (мобильный)'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="small text-muted mb-2">
          Перетащите картинку и настройте масштаб. Пунктирные линии показывают, как баннер обрежется на более узких окнах — держите важное внутри центральной рамки.
        </div>
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: String(aspect),
            overflow: 'hidden',
            borderRadius: 10,
            background: '#0f172a',
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none'
          }}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt="crop"
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: imgW ? `${imgW}px` : 'auto',
                height: imgH ? `${imgH}px` : 'auto',
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                pointerEvents: 'none'
              }}
            />
          )}
          {/* направляющие окна */}
          {guideWidths.map((w, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(1 - w) * 50}%`,
                width: `${w * 100}%`,
                border: i === guideWidths.length - 1 ? '2px dashed rgba(255,255,255,0.9)' : '1px dashed rgba(255,255,255,0.45)',
                pointerEvents: 'none'
              }}
            />
          ))}
        </div>
        <Form.Group className="mt-3">
          <Form.Label className="small fw-bold text-muted text-uppercase mb-1">Масштаб</Form.Label>
          <Form.Range
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between">
        <Button variant="link" className="text-decoration-none" onClick={onUseAsIs} disabled={busy}>
          Загрузить без обрезки
        </Button>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>Отмена</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={busy || !natural.w}>
            {busy ? 'Загрузка...' : 'Сохранить'}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

export default BannerCropModal;
