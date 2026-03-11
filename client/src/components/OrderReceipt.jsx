import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import droneDeliveryVideo from '../assets/animations/drone-delivery.mp4';

const normalizeContainerNorm = (value, fallback = 1) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const resolveContainerUnits = (quantityValue, normValue) => {
  const quantity = Number.parseFloat(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.ceil(quantity / normalizeContainerNorm(normValue, 1));
};

function OrderReceipt({ order, items, onClose, restaurantLogo, restaurantName, cardPaymentInfo = null }) {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Trigger animation after mount
    setTimeout(() => setVisible(true), 100);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => {
      onClose?.();
      navigate('/orders');
    }, 500);
  };

  const openReceiptDestination = () => {
    const targetUrl = String(cardPaymentInfo?.receiptUrl || '').trim();
    const supportUsername = String(cardPaymentInfo?.supportUsername || '').trim().replace(/^@/, '');
    const fallbackTarget = supportUsername ? `https://t.me/${supportUsername}` : '';
    const url = targetUrl || fallbackTarget;
    if (!url) return;

    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
      return;
    }
    window.location.assign(url);
  };

  const formatPrice = (price) => parseFloat(price).toLocaleString('ru-RU');

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '20px',
        zIndex: 9999,
        overflow: 'auto'
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: visible ? 'translateY(0)' : 'translateY(-100%)',
          opacity: visible ? 1 : 0,
          transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
          maxWidth: '340px',
          width: '90%',
          margin: '0 auto'
        }}
      >
        {/* Receipt paper */}
        <div
          style={{
            background: '#fff',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
            fontFamily: "'Courier New', monospace",
            position: 'relative'
          }}
        >
          {/* Header with logo */}
          <div style={{ 
            padding: '24px 20px 16px',
            textAlign: 'center',
            borderBottom: '2px dashed var(--border-color)'
          }}>
            {/* Restaurant logo */}
            {restaurantLogo ? (
              <img 
                src={restaurantLogo} 
                alt={restaurantName || 'Restaurant'} 
                style={{ 
                  maxHeight: '80px', 
                  maxWidth: '220px',
                  objectFit: 'contain',
                  marginBottom: '12px'
                }}
              />
            ) : restaurantName ? (
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 'bold',
                marginBottom: '12px',
                color: '#333'
              }}>
                {restaurantName}
              </div>
            ) : null}

            <div style={{ 
              fontSize: '12px', 
              color: '#666',
              marginTop: '8px'
            }}>
              {new Date().toLocaleString('ru-RU')}
            </div>
          </div>

          {/* Order number */}
          <div style={{
            padding: '16px 20px',
            textAlign: 'center',
            borderBottom: '1px dashed var(--border-color)'
          }}>
            <div style={{ fontSize: '12px', color: '#666' }}>НОМЕР ЗАКАЗА</div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: 'bold',
              letterSpacing: '4px',
              marginTop: '4px'
            }}>
              #{order?.order_number}
            </div>
          </div>

          {/* Items */}
          <div style={{ padding: '16px 20px', borderBottom: '1px dashed var(--border-color)' }}>
            <div style={{ 
              fontSize: '11px', 
              color: '#666', 
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              Товары
            </div>
            {items?.map((item, idx) => {
              const containerUnits = resolveContainerUnits(item.quantity, item.container_norm);
              const containerPrice = Number.parseFloat(item.container_price) || 0;
              return (
              <div key={idx} style={{ marginBottom: '8px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px'
                }}>
                  <span style={{ flex: 1, paddingRight: '8px' }}>
                    {idx + 1}. {item.product_name}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', color: '#666' }}>
                    {item.quantity}×{formatPrice(item.price)}
                  </span>
                </div>
                {containerPrice > 0 && containerUnits > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#888',
                    marginTop: '2px',
                    paddingLeft: '16px'
                  }}>
                    <span>🍽 {item.container_name || 'Посуда'}</span>
                    <span>{containerUnits}×{formatPrice(containerPrice)}</span>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ 
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase'
            }}>
              Итого
            </span>
            <span style={{ 
              fontSize: '22px', 
              fontWeight: 'bold'
            }}>
              {formatPrice(order?.total_amount)} сум
            </span>
          </div>

          {/* Payment method */}
          <div style={{
            padding: '12px 20px',
            background: '#fff',
            borderTop: '1px dashed var(--border-color)',
            borderBottom: '1px dashed var(--border-color)',
            textAlign: 'center',
            fontSize: '12px',
            color: '#666'
          }}>
            {order?.payment_method === 'card'
              ? '💳 Оплата картой'
              : order?.payment_method === 'click'
                ? '💳 Оплата через Click'
                : order?.payment_method === 'payme'
                  ? '💳 Оплата через Payme'
                  : order?.payment_method === 'uzum'
                    ? '💳 Оплата через Uzum'
                    : order?.payment_method === 'xazna'
                      ? '💳 Оплата через Xazna'
                      : '💵 Оплата наличными'}
          </div>

          {order?.payment_method === 'card' && cardPaymentInfo && (
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px dashed var(--border-color)',
              background: '#f8fafc'
            }}>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                {cardPaymentInfo.title || 'Карта'}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', marginBottom: '2px' }}>
                {cardPaymentInfo.number || '—'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                {cardPaymentInfo.holder || '—'}
              </div>
              <button
                onClick={openReceiptDestination}
                style={{
                  width: '100%',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: '#0ea5e9',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🧾 Отправить чек
              </button>
            </div>
          )}

          {/* Thank you message */}
          <div style={{
            padding: '20px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#666'
          }}>
            <div
              style={{
                width: '100%',
                maxWidth: '170px',
                margin: '0 auto 12px',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#ffffff'
              }}
            >
              <video
                src={droneDeliveryVideo}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: '100%',
                  display: 'block',
                  maxHeight: '110px',
                  objectFit: 'cover'
                }}
              />
            </div>
            Спасибо за заказ!
          </div>

          {/* Zigzag bottom edge */}
          <svg 
            width="100%" 
            height="20" 
            viewBox="0 0 100 20" 
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <polygon 
              points="0,0 5,20 10,0 15,20 20,0 25,20 30,0 35,20 40,0 45,20 50,0 55,20 60,0 65,20 70,0 75,20 80,0 85,20 90,0 95,20 100,0 100,0 0,0" 
              fill="#fff"
            />
          </svg>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px',
            marginTop: '16px',
            background: 'var(--primary-color)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
        >
          Мои заказы →
        </button>
      </div>
    </div>
  );
}

export default OrderReceipt;
