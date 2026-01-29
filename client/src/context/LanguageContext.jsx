import React, { createContext, useContext, useState, useEffect } from 'react';

// Translations
const translations = {
  ru: {
    // Common
    loading: 'Загрузка...',
    save: 'Сохранить',
    cancel: 'Отмена',
    delete: 'Удалить',
    edit: 'Редактировать',
    add: 'Добавить',
    search: 'Поиск',
    all: 'Все',
    back: 'Назад',
    next: 'Далее',
    sum: 'сум',
    
    // Navigation
    menu: 'Меню',
    cart: 'Корзина',
    orders: 'Заказы',
    feedback: 'Жалобы',
    
    // Catalog
    catalog: 'Каталог',
    addToCart: 'В корзину',
    outOfStock: 'Нет в наличии',
    
    // Cart
    cartEmpty: 'Корзина пуста',
    cartEmptyDesc: 'Добавьте товары из каталога',
    goToCatalog: 'Перейти в каталог',
    yourOrder: 'Ваш заказ',
    delivery: 'Доставка',
    comment: 'Комментарий к заказу',
    commentPlaceholder: 'Пожелания к заказу...',
    deliveryPoint: 'Точка доставки',
    changePoint: 'Изменить точку',
    specifyLocation: 'Указать местоположение',
    phone: 'Телефон',
    deliveryTime: 'Время доставки',
    asap: 'Быстрее',
    scheduled: 'Ко времени',
    paymentMethod: 'Способ оплаты',
    cash: 'Наличные',
    card: 'Карта',
    total: 'Итого',
    checkout: 'Оформить',
    location: 'Местоположение',
    detectLocation: 'Определить',
    
    // Orders
    myOrders: 'Мои заказы',
    noOrders: 'У вас пока нет заказов',
    makeFirstOrder: 'Сделайте ваш первый заказ!',
    orderComposition: 'Состав заказа',
    payment: 'Оплата',
    cancelOrder: 'Отменить заказ',
    cancelling: 'Отмена...',
    expand: 'Подробнее',
    collapse: 'Свернуть',
    
    // Statuses
    statusNew: 'Новый',
    statusPreparing: 'Готовится',
    statusDelivering: 'Доставляется',
    statusDelivered: 'Доставлен',
    statusCancelled: 'Отменен',
    
    // Admin
    dashboard: 'Аналитика',
    products: 'Товары',
    categories: 'Категории',
    containers: 'Посуда',
    clients: 'Клиенты',
    users: 'Пользователи',
    restaurants: 'Рестораны',
    settings: 'Настройки',
    broadcast: 'Рассылка',
    logout: 'Выйти',
    
    // Dashboard
    revenue: 'Выручка',
    averageCheck: 'Средний чек',
    ordersCount: 'Количество заказов',
    topProducts: 'Топ популярных блюд',
    orderGeography: 'География заказов',
    
    // Products
    productName: 'Название',
    category: 'Категория',
    price: 'Цена',
    status: 'Статус',
    actions: 'Действия',
    active: 'Активен',
    hidden: 'Скрыт',
    addProduct: 'Добавить товар',
    importExcel: 'Импорт Excel',
    downloadExcel: 'Скачать Excel',
    duplicate: 'Дублировать',
    photo: 'Фото',
    allCategories: 'Все категории',
    allStatuses: 'Все статусы',
    activeProducts: 'Активные',
    hiddenProducts: 'Скрытые',
    found: 'Найдено',
    of: 'из',
    
    // Orders Admin
    orderNumber: 'Номер',
    client: 'Клиент',
    amount: 'Сумма',
    date: 'Дата',
    details: 'Детали',
    
    // Blocked user
    accountBlocked: 'Ваш аккаунт заблокирован',
    contactSupport: 'Связаться с поддержкой',
  },
  uz: {
    // Common
    loading: 'Yuklanmoqda...',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    delete: "O'chirish",
    edit: 'Tahrirlash',
    add: "Qo'shish",
    search: 'Qidirish',
    all: 'Hammasi',
    back: 'Orqaga',
    next: 'Keyingi',
    sum: "so'm",
    
    // Navigation
    menu: 'Menyu',
    cart: 'Savat',
    orders: 'Buyurtmalar',
    feedback: 'Shikoyat',
    
    // Catalog
    catalog: 'Katalog',
    addToCart: 'Savatga',
    outOfStock: 'Mavjud emas',
    
    // Cart
    cartEmpty: 'Savat bo\'sh',
    cartEmptyDesc: 'Katalogdan mahsulot qo\'shing',
    goToCatalog: 'Katalogga o\'tish',
    yourOrder: 'Sizning buyurtmangiz',
    delivery: 'Yetkazib berish',
    comment: 'Buyurtmaga izoh',
    commentPlaceholder: 'Buyurtma uchun istaklar...',
    deliveryPoint: 'Yetkazib berish nuqtasi',
    changePoint: 'Nuqtani o\'zgartirish',
    specifyLocation: 'Joylashuvni ko\'rsatish',
    phone: 'Telefon',
    deliveryTime: 'Yetkazib berish vaqti',
    asap: 'Tezroq',
    scheduled: 'Vaqtga',
    paymentMethod: 'To\'lov usuli',
    cash: 'Naqd pul',
    card: 'Karta',
    total: 'Jami',
    checkout: 'Buyurtma berish',
    location: 'Joylashuv',
    detectLocation: 'Aniqlash',
    
    // Orders
    myOrders: 'Mening buyurtmalarim',
    noOrders: 'Sizda hali buyurtmalar yo\'q',
    makeFirstOrder: 'Birinchi buyurtmangizni bering!',
    orderComposition: 'Buyurtma tarkibi',
    payment: 'To\'lov',
    cancelOrder: 'Buyurtmani bekor qilish',
    cancelling: 'Bekor qilinmoqda...',
    expand: 'Batafsil',
    collapse: 'Yig\'ish',
    
    // Statuses
    statusNew: 'Yangi',
    statusPreparing: 'Tayyorlanmoqda',
    statusDelivering: 'Yetkazilmoqda',
    statusDelivered: 'Yetkazildi',
    statusCancelled: 'Bekor qilindi',
    
    // Admin
    dashboard: 'Analitika',
    products: 'Mahsulotlar',
    categories: 'Kategoriyalar',
    containers: 'Idishlar',
    clients: 'Mijozlar',
    users: 'Foydalanuvchilar',
    restaurants: 'Restoranlar',
    settings: 'Sozlamalar',
    broadcast: 'Xabarnoma',
    logout: 'Chiqish',
    
    // Dashboard
    revenue: 'Daromad',
    averageCheck: 'O\'rtacha chek',
    ordersCount: 'Buyurtmalar soni',
    topProducts: 'Mashhur taomlar',
    orderGeography: 'Buyurtmalar geografiyasi',
    
    // Products
    productName: 'Nomi',
    category: 'Kategoriya',
    price: 'Narx',
    status: 'Holat',
    actions: 'Amallar',
    active: 'Faol',
    hidden: 'Yashirin',
    addProduct: 'Mahsulot qo\'shish',
    importExcel: 'Excel import',
    downloadExcel: 'Excel yuklab olish',
    duplicate: 'Nusxa olish',
    photo: 'Rasm',
    allCategories: 'Barcha kategoriyalar',
    allStatuses: 'Barcha holatlar',
    activeProducts: 'Faol',
    hiddenProducts: 'Yashirin',
    found: 'Topildi',
    of: 'dan',
    
    // Orders Admin
    orderNumber: 'Raqam',
    client: 'Mijoz',
    amount: 'Summa',
    date: 'Sana',
    details: 'Tafsilotlar',
    
    // Blocked user
    accountBlocked: 'Sizning akkauntingiz bloklangan',
    contactSupport: 'Qo\'llab-quvvatlash bilan bog\'lanish',
  }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'ru';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const t = (key) => {
    return translations[language]?.[key] || translations.ru[key] || key;
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'ru' ? 'uz' : 'ru');
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export default LanguageContext;
