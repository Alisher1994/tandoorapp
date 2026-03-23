import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Spinner from 'react-bootstrap/Spinner';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../context/CartContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const UNIT_OPTIONS = ['шт', 'порция', 'кг', 'л', 'г', 'мл', 'стакан', 'банка'];

function OperatorQuickProducts() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [form, setForm] = useState({
    category_id: '',
    name_ru: '',
    name_uz: '',
    price: '',
    unit: 'шт',
    description_ru: '',
    in_stock: true
  });

  const isUz = language === 'uz';
  const restaurantId = Number.parseInt(user?.active_restaurant_id, 10);

  const labels = useMemo(() => ({
    title: isUz ? "Do'kon mahsulotlari" : 'Товары магазина',
    subtitle: isUz
      ? "Yangi mahsulotni qo'shing va ro'yxatni boshqaring"
      : 'Добавляйте товары вручную и проверяйте список',
    addProduct: isUz ? "Mahsulot qo'shish" : 'Добавить товар',
    addMore: isUz ? "Yana qo'shish" : 'Добавить еще',
    cancel: isUz ? 'Bekor qilish' : 'Отмена',
    save: isUz ? 'Saqlash' : 'Сохранить',
    saving: isUz ? 'Saqlanmoqda...' : 'Сохранение...',
    refresh: isUz ? 'Yangilash' : 'Обновить',
    close: isUz ? 'Yopish' : 'Закрыть',
    loading: isUz ? 'Yuklanmoqda...' : 'Загрузка...',
    search: isUz ? 'Mahsulot qidirish...' : 'Поиск по товарам...',
    noProducts: isUz ? "Mahsulotlar topilmadi" : 'Товары не найдены',
    category: isUz ? 'Kategoriya' : 'Категория',
    nameRu: isUz ? 'Nomi (RU)' : 'Название (RU)',
    nameUz: isUz ? 'Nomi (UZ)' : 'Название (UZ)',
    price: isUz ? 'Narxi' : 'Цена',
    unit: isUz ? "O'lchov birligi" : 'Единица',
    description: isUz ? 'Tavsif' : 'Описание',
    inStock: isUz ? 'Mavjud' : 'В наличии',
    noCategory: isUz ? 'Kategoriya tanlanmagan' : 'Без категории',
    categoryRequired: isUz ? 'Kategoriyani tanlang' : 'Выберите категорию',
    nameRequired: isUz ? 'RU nomini kiriting' : 'Введите название RU',
    priceRequired: isUz ? "Narxni to'g'ri kiriting" : 'Укажите корректную цену',
    created: isUz ? "Mahsulot qo'shildi" : 'Товар добавлен',
    createError: isUz ? "Mahsulotni saqlab bo'lmadi" : 'Не удалось сохранить товар',
    loadError: isUz ? "Ro'yxatni yuklab bo'lmadi" : 'Не удалось загрузить данные',
    list: isUz ? 'Mahsulotlar roʻyxati' : 'Список товаров'
  }), [isUz]);

  const fetchData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        axios.get(`${API_URL}/admin/products`),
        axios.get(`${API_URL}/admin/categories`)
      ]);

      const nextProducts = Array.isArray(productsRes.data) ? productsRes.data : [];
      const nextCategoriesRaw = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
      const nextCategories = Number.isInteger(restaurantId) && restaurantId > 0
        ? nextCategoriesRaw.filter((category) => (
          Number.parseInt(category?.restaurant_id, 10) === restaurantId
        ))
        : nextCategoriesRaw;

      setProducts(nextProducts);
      setCategories(nextCategories);
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.error || labels.loadError });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    const sorted = [...products].sort((a, b) => {
      const aTs = new Date(a?.created_at || 0).getTime();
      const bTs = new Date(b?.created_at || 0).getTime();
      if (aTs !== bTs) return bTs - aTs;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
    if (!query) return sorted;
    return sorted.filter((product) => (
      String(product?.name_ru || '').toLowerCase().includes(query)
      || String(product?.name_uz || '').toLowerCase().includes(query)
    ));
  }, [products, search]);

  const resetForm = () => {
    setForm({
      category_id: '',
      name_ru: '',
      name_uz: '',
      price: '',
      unit: 'шт',
      description_ru: '',
      in_stock: true
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedNameRu = String(form.name_ru || '').trim();
    const normalizedNameUz = String(form.name_uz || '').trim();
    const normalizedCategoryId = Number.parseInt(form.category_id, 10);
    const normalizedPrice = Number.parseFloat(String(form.price || '').replace(',', '.'));

    if (!Number.isFinite(normalizedCategoryId) || normalizedCategoryId <= 0) {
      setMessage({ type: 'warning', text: labels.categoryRequired });
      return;
    }
    if (!normalizedNameRu) {
      setMessage({ type: 'warning', text: labels.nameRequired });
      return;
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      setMessage({ type: 'warning', text: labels.priceRequired });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await axios.post(`${API_URL}/admin/products`, {
        category_id: normalizedCategoryId,
        name_ru: normalizedNameRu,
        name_uz: normalizedNameUz || null,
        description_ru: String(form.description_ru || '').trim(),
        description_uz: '',
        price: Math.round(normalizedPrice),
        unit: form.unit || 'шт',
        in_stock: Boolean(form.in_stock)
      });
      setMessage({ type: 'success', text: labels.created });
      resetForm();
      setShowForm(false);
      fetchData();
    } catch (error) {
      setMessage({ type: 'danger', text: error.response?.data?.error || labels.createError });
    } finally {
      setSaving(false);
    }
  };

  const closeWebApp = () => {
    const tg = window.Telegram?.WebApp;
    if (tg?.close) {
      tg.close();
      return;
    }
    window.history.back();
  };

  return (
    <div className="operator-products-webapp-page">
      <Container className="py-3" style={{ maxWidth: 720 }}>
        <Card className="border-0 shadow-sm mb-3">
          <Card.Body className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <h5 className="mb-1">{labels.title}</h5>
              <div className="text-muted small">{labels.subtitle}</div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Button variant="outline-secondary" size="sm" onClick={fetchData} disabled={loading}>
                {labels.refresh}
              </Button>
              <Button variant="outline-dark" size="sm" onClick={closeWebApp}>
                {labels.close}
              </Button>
            </div>
          </Card.Body>
        </Card>

        {message.text && (
          <Alert variant={message.type || 'info'} className="mb-3 py-2">
            {message.text}
          </Alert>
        )}

        {showForm ? (
          <Card className="border-0 shadow-sm mb-3">
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-2">
                  <Form.Label>{labels.category}</Form.Label>
                  <Form.Select
                    value={form.category_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                    required
                  >
                    <option value="">{labels.categoryRequired}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {isUz && category.name_uz ? category.name_uz : category.name_ru}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>{labels.nameRu}</Form.Label>
                  <Form.Control
                    value={form.name_ru}
                    onChange={(e) => setForm((prev) => ({ ...prev, name_ru: e.target.value }))}
                    required
                    maxLength={255}
                  />
                </Form.Group>

                <Form.Group className="mb-2">
                  <Form.Label>{labels.nameUz}</Form.Label>
                  <Form.Control
                    value={form.name_uz}
                    onChange={(e) => setForm((prev) => ({ ...prev, name_uz: e.target.value }))}
                    maxLength={255}
                  />
                </Form.Group>

                <div className="row g-2">
                  <div className="col-6">
                    <Form.Group className="mb-2">
                      <Form.Label>{labels.price}</Form.Label>
                      <Form.Control
                        type="number"
                        min="0"
                        step="1"
                        value={form.price}
                        onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                        required
                      />
                    </Form.Group>
                  </div>
                  <div className="col-6">
                    <Form.Group className="mb-2">
                      <Form.Label>{labels.unit}</Form.Label>
                      <Form.Select
                        value={form.unit}
                        onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                      >
                        {UNIT_OPTIONS.map((unitOption) => (
                          <option key={unitOption} value={unitOption}>{unitOption}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </div>
                </div>

                <Form.Group className="mb-2">
                  <Form.Label>{labels.description}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={form.description_ru}
                    onChange={(e) => setForm((prev) => ({ ...prev, description_ru: e.target.value }))}
                    maxLength={1000}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Check
                    type="switch"
                    checked={Boolean(form.in_stock)}
                    onChange={(e) => setForm((prev) => ({ ...prev, in_stock: e.target.checked }))}
                    label={labels.inStock}
                  />
                </Form.Group>

                <div className="d-flex gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? labels.saving : labels.save}
                  </Button>
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    disabled={saving}
                  >
                    {labels.cancel}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        ) : (
          <div className="mb-3">
            <Button onClick={() => setShowForm(true)}>{labels.addProduct}</Button>
          </div>
        )}

        <Card className="border-0 shadow-sm">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
              <h6 className="mb-0">{labels.list}</h6>
              {!showForm && (
                <Button size="sm" variant="outline-primary" onClick={() => setShowForm(true)}>
                  {labels.addMore}
                </Button>
              )}
            </div>

            <Form.Control
              placeholder={labels.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-3"
            />

            {loading ? (
              <div className="py-4 text-center text-muted">
                <Spinner animation="border" size="sm" className="me-2" />
                {labels.loading}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-muted small py-3">{labels.noProducts}</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="d-flex justify-content-between align-items-start gap-2 p-2 rounded border"
                    style={{ background: '#fff' }}
                  >
                    <div>
                      <div className="fw-semibold">
                        {isUz && product.name_uz ? product.name_uz : product.name_ru}
                      </div>
                      <div className="small text-muted">
                        {product.category_name || labels.noCategory}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="fw-semibold text-primary">
                        {formatPrice(product.price)} {t('sum')}
                      </div>
                      <Badge bg={product.in_stock !== false ? 'success' : 'secondary'}>
                        {product.in_stock !== false ? labels.inStock : (isUz ? "Yo'q" : 'Нет')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}

export default OperatorQuickProducts;
