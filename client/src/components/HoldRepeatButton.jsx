import { useRef, useEffect, useCallback } from 'react';

// Кнопка с авто-повтором по удержанию и ускорением.
// Один тап — одно срабатывание; зажатие — повтор с нарастающей скоростью.
// Pointer-события покрывают и десктопную мышь, и тач (мобайл / Telegram WebApp).
//
// onTrigger вызывается без аргументов. Замыкание onTrigger пересоздаётся на
// каждом рендере родителя (новое значение qty) — мы держим его в ref и на каждом
// тике вызываем САМУЮ свежую версию, поэтому счётчик меняется относительно
// актуального состояния, а не «застрявшего» значения с момента нажатия.
export default function HoldRepeatButton({
  onTrigger,
  disabled = false,
  stopPropagation = false,
  className,
  style,
  children,
  title,
  ariaLabel,
  initialDelay = 380,
  startInterval = 170,
  minInterval = 45,
  accel = 0.82,
  ...rest
}) {
  const triggerRef = useRef(onTrigger);
  triggerRef.current = onTrigger;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const timerRef = useRef(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // на размонтировании гасим таймер (например, степпер исчез при qty=0)
  useEffect(() => stop, [stop]);

  const fire = () => {
    if (disabledRef.current) return;
    const fn = triggerRef.current;
    if (typeof fn === 'function') fn();
  };

  const begin = (event) => {
    if (disabledRef.current) return;
    if (stopPropagation) event.stopPropagation();
    // гасим long-press контекстное меню/выделение на мобайле
    if (event.pointerType === 'touch') event.preventDefault();
    stop();
    fire(); // одиночное срабатывание (тап)
    let interval = startInterval;
    const tick = () => {
      if (disabledRef.current) { stop(); return; }
      fire();
      interval = Math.max(minInterval, interval * accel);
      timerRef.current = setTimeout(tick, interval);
    };
    timerRef.current = setTimeout(tick, initialDelay);
  };

  return (
    <button
      type="button"
      className={className}
      style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none', ...style }}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        // Действие уже сработало на pointerdown — здесь только гасим всплытие,
        // чтобы клик не «дошёл» до родителя (например, не открыл карточку товара).
        if (stopPropagation) e.stopPropagation();
        e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire();
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
