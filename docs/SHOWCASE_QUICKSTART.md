# Модуль Витрина - Краткий старт

## 🚀 Быстрый старт

### 1. Структура файлов

```
client/src/
├── context/
│   └── ShowcaseContext.jsx          ← Управление состоянием витрины
├── components/
│   ├── ShowcaseBlocks.jsx           ← Компоненты блоков
│   └── ShowcaseBlocks.css           ← Стили блоков
└── pages/
    ├── ShowcaseDisplay.jsx          ← Главная страница витрины
    ├── ShowcaseDisplay.css          ← Стили витрины
    ├── ShowcaseBuilder.jsx          ← Конструктор для операторов
    └── ShowcaseBuilder.css          ← Стили конструктора

server/
├── routes/products.js               ← API endpoints для витрины
└── database/schema.sql              ← Таблица showcase_layouts
```

### 2. Основные файлы для понимания

#### ShowcaseContext.jsx (20-30 мин)
- Полное управление состоянием витрины
- Методы: addBlock, removeBlock, updateBlock, reorderBlocks, saveShowcase
- Работает с API backend'а

#### ShowcaseBlocks.jsx (15-20 мин)
- 4 компонента: Grid3Block, Grid2Block, BannerBlock, ProductSliderBlock
- Каждый компонент полностью self-contained
- Props: categories, products, cartItems, onCategoryClick

#### ShowcaseDisplay.jsx (10-15 мин)
- Главная страница витрины для пользователей
- Читает состояние из ShowcaseContext
- Обрабатывает клики на категории

#### ShowcaseBuilder.jsx (20-30 мин)
- Конструктор для операторов
- Split layout: левая панель (категории) + правая панель (холст)
- Drag-and-drop функциональность
- Modal для выбора типа блока и его настройки

### 3. Данные структуры

#### Block Object
```javascript
{
  id: "block_1234567890",      // уникальный ID
  block_type: "grid_3",         // тип блока
  title: "Готовая еда",         // название
  content: [1, 2, 3],           // ID категорий (для grid и slider)
  category_id: null,            // для slider блока
  settings: {},                 // настройки блока
  order: 0                       // порядок отображения
}
```

#### Category Object
```javascript
{
  id: 1,
  name: "Пицца",
  image: "https://...",
  description: "Итальянская пицца"
}
```

### 4. API Методы

#### ShowcaseContext - основные методы

```javascript
// Получить текущий layout
const { showcaseLayout } = useShowcase();

// Добавить блок
const block = addBlock('grid_3', {
  title: 'Готовая еда',
  content: []
});

// Удалить блок
removeBlock(blockId);

// Обновить блок
updateBlock(blockId, { title: 'Новое название' });

// Переместить блок вверх/вниз
reorderBlocks(blockId, 'down'); // или 'up'

// Добавить категорию в grid блок
addCategoryToBlock(blockId, categoryId);

// Удалить категорию из grid блока
removeCategoryFromBlock(blockId, categoryId);

// Выбрать категорию для slider
setSliderCategory(blockId, categoryId);

// Сохранить на сервер
await saveShowcase(restaurantId, showcaseLayout);

// Загрузить с сервера
await loadShowcase(restaurantId);
```

### 5. Компоненты блоков - Props

```javascript
// Grid3Block / Grid2Block
<Grid3Block
  categories={[]}              // Array<Category>
  products={[]}                // Array<Product>
  cartItems={[]}               // Array<CartItem>
  onCategoryClick={categoryId => {}}  // Function
/>

// BannerBlock
<BannerBlock
  block={blockObject}          // Block with settings
  onBannerClick={blockId => {}} // Function
/>

// ProductSliderBlock
<ProductSliderBlock
  categoryId={1}               // number
  products={[]}                // Array<Product>
  cartItems={[]}               // Array<CartItem>
  onProductClick={product => {}} // Function
  onCategoryClick={categoryId => {}} // Function
/>
```

### 6. Основные фичи

#### Навигация между витриной и меню
```javascript
// В ShowcaseBlocks.jsx
const handleCategoryClick = (categoryId) => {
  navigate('/catalog', { state: { selectedCategoryId: categoryId } });
};

// В Catalog.jsx
useEffect(() => {
  if (location.state?.selectedCategoryId) {
    setSelectedCategory(location.state.selectedCategoryId);
  }
}, [location.state?.selectedCategoryId]);
```

#### Бейджи корзины
```javascript
// В Grid3Block / Grid2Block
const getCartBadge = (categoryId) => {
  const total = cartItems
    .filter(item => {
      const product = products.find(p => p.id === item.product_id);
      return product?.category_id === categoryId;
    })
    .reduce((sum, item) => sum + item.quantity, 0);
  return total > 0 ? total : null;
};
```

#### Drag-and-Drop в конструкторе
```javascript
const handleDragStart = (e, categoryId) => {
  draggedCategoryRef.current = categoryId;
  e.dataTransfer.effectAllowed = 'copy';
};

const handleDropOnBlock = (e, blockId) => {
  e.preventDefault();
  const categoryId = draggedCategoryRef.current;
  if (categoryId) {
    addCategoryToBlock(blockId, Number.parseInt(categoryId, 10));
  }
};
```

### 7. Маршруты приложения

```javascript
// App.jsx
<Route path="/" element={<ShowcaseDisplay />} />        // Витрина пользователя
<Route path="/catalog" element={<Catalog />} />         // Меню
<Route path="/admin/showcase" element={<ShowcaseBuilder />} /> // Конструктор
```

### 8. API Endpoints

```bash
# Получить витрину
GET /api/products/restaurant/:restaurantId/showcase

# Сохранить витрину
POST /api/products/restaurant/:restaurantId/showcase
Content-Type: application/json
{
  "blocks": [...]
}
```

### 9. База данных

```sql
-- Таблица витрины
CREATE TABLE showcase_layouts (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL UNIQUE,
  layout JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индекс
CREATE INDEX idx_showcase_layouts_restaurant 
ON showcase_layouts(restaurant_id);
```

### 10. Типичный рабочий процесс

#### Для оператора:
1. Войти в админку
2. Нажать на вкладку "Витрина"
3. Перейти на страницу конструктора
4. Добавить блоки
5. Перетащить категории в блоки
6. Настроить блоки (если нужно)
7. Нажать "Сохранить"

#### Для пользователя:
1. Открыть приложение
2. Видеть витрину с блоками
3. Нажать на категорию
4. Перейти в меню с фильтром
5. Добавить товары в корзину
6. Вернуться на витрину (бейджи обновлены)

### 11. Отладка (Debugging)

#### React DevTools
```javascript
// Посмотрите ShowcaseContext в React DevTools
// Проверьте состояние showcaseLayout
```

#### Console
```javascript
// Проверьте API запросы
console.log(showcaseLayout);
console.log(isDirty);

// Смотрите Network tab для API запросов
```

#### Server Logs
```bash
# Включите логирование в products.js
console.error('Showcase POST error:', error);
console.log('Saved showcase:', layoutJson);
```

### 12. Оптимизация

#### Что уже оптимизировано
- ✅ useMemo для вычисления активных категорий
- ✅ useCallback для обработчиков
- ✅ Lazy loading компонентов
- ✅ Кэширование макета на клиенте

#### Что можно оптимизировать
- Виртуализация длинного списка категорий
- Кэширование изображений категорий
- Pagination для большого количества товаров в слайдере

### 13. Расширения (в будущем)

```javascript
// Пример: добавить новый тип блока
// 1. Обновить BLOCK_TYPES в ShowcaseContext.jsx
export const BLOCK_TYPES = {
  GRID_3: 'grid_3',
  GRID_2: 'grid_2',
  BANNER: 'banner',
  SLIDER: 'slider',
  CAROUSEL: 'carousel'  // новый тип
};

// 2. Создать компонент
export function CarouselBlock({ ... }) { ... }

// 3. Добавить в ShowcaseBlocks.jsx switch
case 'carousel':
  return <CarouselBlock ... />;

// 4. Обновить ShowcaseBuilder.jsx для UI выбора
```

### 14. Часто задаваемые вопросы

**Q: Почему витрина на "/"?**  
A: Потому что это основная страница приложения. Меню теперь на "/catalog".

**Q: Как очистить витрину?**  
A: Удалите все блоки и нажмите "Сохранить".

**Q: Почему категория не добавляется?**  
A: Убедитесь, что категория имеет активные товары.

**Q: Как работает drag-and-drop?**  
A: Используется HTML5 Drag and Drop API. Категория из левой панели перетаскивается на блок справа.

**Q: Где сохраняется витрина?**  
A: В таблице showcase_layouts в БД в виде JSON.

---

## 📚 Дополнительные ресурсы

- [SHOWCASE_CONSTRUCTOR.md](./SHOWCASE_CONSTRUCTOR.md) - Полная документация
- [SHOWCASE_TESTING.md](./SHOWCASE_TESTING.md) - Тесты и примеры
- ShowcaseContext.jsx - Полная реализация логики

---

**Версия:** 1.0.0  
**Обновлено:** 2026-03-23
