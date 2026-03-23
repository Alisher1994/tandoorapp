import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/SkeletonUI';
import { useLanguage } from '../context/LanguageContext';

function OperatorQuickProducts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    params.set('quickAddProduct', '1');
    navigate(`/admin?${params.toString()}`, { replace: true });
  }, [navigate, location.search]);

  return (
    <PageSkeleton
      fullscreen
      cards={6}
      label={language === 'uz'
        ? "Operator paneliga o'tilmoqda..."
        : 'Переход в операторскую панель...'}
    />
  );
}

export default OperatorQuickProducts;
