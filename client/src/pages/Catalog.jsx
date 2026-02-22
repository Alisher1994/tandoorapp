import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Navbar from 'react-bootstrap/Navbar';
import { useAuth } from '../context/AuthContext';
import { useCart, formatPrice } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import BottomNav from '../components/BottomNav';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function Catalog() {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [prevRestaurant, setPrevRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null); // level 2 category id
  const [activeSubcategoryTab, setActiveSubcategoryTab] = useState(null);
  const [catalogQtyOpen, setCatalogQtyOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const { user, isOperator } = useAuth();
  const { addToCart, updateQuantity, clearCart, cart } = useCart();
  const { language, toggleLanguage } = useLanguage();
  const navigate = useNavigate();

  const productGroupRefs = useRef({});

  // Load restaurants (for header/logo and operator selection)
  useEffect(() => {
    fetchRestaurants();
  }, []);

  // For customers: lock to active_restaurant_id from bot
  useEffect(() => {
    if (!isOperator() && user?.active_restaurant_id) {
      setSelectedRestaurant(user.active_restaurant_id);
    }
  }, [user]);

  // Load products when restaurant changes
  useEffect(() => {
    if (selectedRestaurant) {
      setSelectedCategory(null);
      setActiveSubcategoryTab(null);
      fetchData();
      // Only clear cart if restaurant actually changed (not on first load)
      if (prevRestaurant && prevRestaurant !== selectedRestaurant) {
        clearCart();
      }
      setPrevRestaurant(selectedRestaurant);
    }
  }, [selectedRestaurant]);

  const getScrollContainer = () => document.getElementById('root') || window;

  const scrollToOffset = (offsetTop) => {
    const scrollContainer = getScrollContainer();
    if (scrollContainer === window) {
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    } else {
      scrollContainer.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  };

  const scrollToTop = () => scrollToOffset(0);

  const resolveImageUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_URL.replace('/api', '')}${url}`;
  };

  const getCategoryName = (category) => (
    language === 'uz' && category?.name_uz ? category.name_uz : category?.name_ru
  );

  const fetchRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/products/restaurants/list`);
      setRestaurants(response.data || []);

      // Auto-select for operators if not set
      if (isOperator()) {
        if (response.data?.length === 1) {
          setSelectedRestaurant(response.data[0].id);
        } else if (response.data?.length > 0 && !selectedRestaurant) {
          setSelectedRestaurant(response.data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching restaurants:', error);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!selectedRestaurant) return;

    setLoading(true);
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        axios.get(`${API_URL}/products/categories?restaurant_id=${selectedRestaurant}`),
        axios.get(`${API_URL}/products?restaurant_id=${selectedRestaurant}`)
      ]);

      setCategories((categoriesRes.data || []).sort((a, b) => {
        const getSortVal = (c) => (c.sort_order === null || c.sort_order === undefined) ? 9999 : c.sort_order;
        const orderDiff = getSortVal(a) - getSortVal(b);
        if (orderDiff !== 0) return orderDiff;
        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
      }));
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantChange = (e) => {
    const restaurantId = parseInt(e.target.value);
    setSelectedRestaurant(restaurantId);
    setSelectedCategory(null);
    setActiveSubcategoryTab(null);
  };

  const handleAddToCart = (product) => {
    addToCart({
      ...product,
      restaurant_id: selectedRestaurant
    });
  };

  const getCartItem = (productId) => cart.find(item => item.id === productId);

  const categoriesById = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    categories.forEach((category) => {
      const key = category.parent_id ?? null;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(category);
    });

    const getSortVal = (category) => (
      category.sort_order === null || category.sort_order === undefined ? 9999 : Number(category.sort_order)
    );

    for (const list of map.values()) {
      list.sort((a, b) => {
        const sortDiff = getSortVal(a) - getSortVal(b);
        if (sortDiff !== 0) return sortDiff;
        return (a.name_ru || '').localeCompare(b.name_ru || '', 'ru');
      });
    }

    return map;
  }, [categories]);

  const productCategoryIds = useMemo(() => (
    new Set(
      products
        .map((product) => Number(product.category_id))
        .filter((id) => Number.isFinite(id))
    )
  ), [products]);

  const nonEmptyCategoryIds = useMemo(() => {
    const memo = new Map();

    const hasProductsDeep = (categoryId) => {
      if (memo.has(categoryId)) return memo.get(categoryId);

      let hasProducts = productCategoryIds.has(categoryId);
      const children = childrenByParent.get(categoryId) || [];
      if (!hasProducts) {
        for (const child of children) {
          if (hasProductsDeep(child.id)) {
            hasProducts = true;
            break;
          }
        }
      }
      memo.set(categoryId, hasProducts);
      return hasProducts;
    };

    categories.forEach((category) => {
      hasProductsDeep(category.id);
    });

    return new Set(
      [...memo.entries()]
        .filter(([, hasProducts]) => hasProducts)
        .map(([id]) => id)
    );
  }, [categories, childrenByParent, productCategoryIds]);

  const level1Categories = useMemo(() => (
    (childrenByParent.get(null) || []).filter((category) => nonEmptyCategoryIds.has(category.id))
  ), [childrenByParent, nonEmptyCategoryIds]);

  const level2ByLevel1 = useMemo(() => {
    const map = new Map();
    level1Categories.forEach((level1) => {
      map.set(
        level1.id,
        (childrenByParent.get(level1.id) || []).filter((category) => nonEmptyCategoryIds.has(category.id))
      );
    });
    return map;
  }, [childrenByParent, level1Categories, nonEmptyCategoryIds]);

  const selectedLevel2Category = useMemo(() => {
    if (!selectedCategory) return null;
    return categoriesById.get(Number(selectedCategory)) || null;
  }, [selectedCategory, categoriesById]);

  const level3Categories = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return (childrenByParent.get(selectedLevel2Category.id) || []).filter((category) => nonEmptyCategoryIds.has(category.id));
  }, [childrenByParent, nonEmptyCategoryIds, selectedLevel2Category]);

  const directSelectedProducts = useMemo(() => {
    if (!selectedLevel2Category) return [];
    return products.filter((product) => Number(product.category_id) === selectedLevel2Category.id);
  }, [products, selectedLevel2Category]);

  const level3Sections = useMemo(() => (
    level3Categories
      .map((category) => ({
        id: category.id,
        title: getCategoryName(category),
        products: products.filter((product) => Number(product.category_id) === category.id)
      }))
      .filter((section) => section.products.length > 0)
  ), [level3Categories, products, language]);

  const hasLevel3Sections = level3Sections.length > 0;

  const level3Tabs = useMemo(() => (
    hasLevel3Sections ? level3Sections : []
  ), [hasLevel3Sections, level3Sections]);

  const productSections = useMemo(() => {
    if (!selectedLevel2Category) return [];

    if (hasLevel3Sections) {
      const sections = [];

      if (directSelectedProducts.length > 0) {
        sections.push({
          id: `direct-${selectedLevel2Category.id}`,
          title: getCategoryName(selectedLevel2Category),
          products: directSelectedProducts,
          tab: false
        });
      }

      level3Sections.forEach((section) => {
        sections.push({
          id: section.id,
          title: section.title,
          products: section.products,
          tab: true
        });
      });

      return sections;
    }

    if (directSelectedProducts.length === 0) return [];
    return [{
      id: selectedLevel2Category.id,
      title: getCategoryName(selectedLevel2Category),
      products: directSelectedProducts,
      tab: false
    }];
  }, [selectedLevel2Category, hasLevel3Sections, level3Sections, directSelectedProducts, language]);

  useEffect(() => {
    productGroupRefs.current = {};
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedCategory || level3Tabs.length === 0) {
      setActiveSubcategoryTab(null);
      return;
    }
    setActiveSubcategoryTab(level3Tabs[0].id);
  }, [selectedCategory, level3Tabs]);

  const openLevel2Category = (categoryId) => {
    setSelectedCategory(categoryId);
    setActiveSubcategoryTab(null);
    scrollToTop();
  };

  const closeLevel2Category = () => {
    setSelectedCategory(null);
    setActiveSubcategoryTab(null);
    scrollToTop();
  };

  const scrollToProductGroup = (sectionId) => {
    const sectionElement = productGroupRefs.current[sectionId];
    if (!sectionElement) return;

    const scrollContainer = getScrollContainer();
    const currentScroll = scrollContainer === window ? window.scrollY : scrollContainer.scrollTop;
    const rect = sectionElement.getBoundingClientRect();
    const topOffset = rect.top + currentScroll - 132;
    setActiveSubcategoryTab(sectionId);
    scrollToOffset(topOffset);
  };

  const currentRestaurant = restaurants.find(r => r.id === selectedRestaurant);

  // Product card component
  const renderProductCard = (product) => {
    const cartItem = getCartItem(product.id);
    const hasQty = !!cartItem;
    const qty = cartItem?.quantity || 0;
    const overlayKey = `qty_open_${product.id}`;
    const isOpen = catalogQtyOpen?.[overlayKey];

    return (
      <Card className="h-100 shadow-sm border-0">
        <div style={{ position: 'relative' }}>
          {product.image_url ? (
            <Card.Img
              variant="top"
              src={product.image_url.startsWith('http') ? product.image_url : `${API_URL.replace('/api', '')}${product.image_url}`}
              style={{ height: '140px', objectFit: 'cover' }}
              onError={(e) => {
                e.target.src = 'https://via.placeholder.com/150?text=No+Image';
              }}
            />
          ) : (
            <div
              style={{ height: '140px', background: '#f8f9fa' }}
              className="d-flex align-items-center justify-content-center"
            >
              <span style={{ fontSize: '3rem', opacity: 0.3 }}>🍽️</span>
            </div>
          )}
          {!product.in_stock && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span className="badge bg-secondary">{language === 'uz' ? 'Mavjud emas' : 'Нет в наличии'}</span>
            </div>
          )}

          {/* Quantity controls on image */}
          {product.in_stock && (
            <>
              {/* Plus button or Quantity circle */}
              {!isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    zIndex: 2
                  }}
                >
                  {!hasQty ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm rounded-circle d-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 32,
                        height: 32,
                        fontSize: '18px',
                        fontWeight: 'bold',
                        padding: 0
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddToCart(product);
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      +
                    </button>
                  ) : (
                    <span
                      className="rounded-circle d-inline-flex align-items-center justify-content-center shadow"
                      style={{
                        width: 32,
                        height: 32,
                        background: 'var(--accent-color, #FFD700)',
                        color: '#1a1a1a',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                        setTimeout(() => {
                          setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                        }, 2000);
                      }}
                    >
                      {qty}
                    </span>
                  )}
                </div>
              )}

              {/* Expanded controls */}
              {isOpen && (
                <div
                  className="d-flex align-items-center justify-content-between rounded-pill px-1 shadow"
                  style={{
                    position: 'absolute',
                    right: 8,
                    bottom: 8,
                    background: 'rgba(255,255,255,0.95)',
                    zIndex: 3,
                    minWidth: '90px'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: true }));
                    setTimeout(() => {
                      setCatalogQtyOpen(prev => ({ ...prev, [overlayKey]: false }));
                    }, 2000);
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty - 1);
                    }}
                  >
                    −
                  </button>
                  <span className="fw-bold px-2" style={{ fontSize: '14px' }}>{qty}</span>
                  <button
                    type="button"
                    className="btn btn-sm p-0 d-flex align-items-center justify-content-center"
                    style={{ width: 28, height: 28, fontSize: '16px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(product.id, qty + 1);
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <Card.Body className="d-flex flex-column p-2">
          <Card.Title className="fs-6 mb-1" style={{ fontSize: '0.85rem', lineHeight: '1.2' }}>
            {language === 'uz' && product.name_uz ? product.name_uz : product.name_ru}
          </Card.Title>
          <Card.Text className="text-muted small mb-1" style={{ fontSize: '0.7rem' }}>
            {language === 'uz' && product.unit_uz ? product.unit_uz : product.unit}
          </Card.Text>
          <div className="fw-bold text-primary mt-auto" style={{ fontSize: '0.9rem' }}>
            {formatPrice(product.price)} {language === 'uz' ? "so'm" : 'сум'}
          </div>
        </Card.Body>
      </Card>
    );
  };

  if (loading && restaurants.length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar
        expand="lg"
        className="mb-0"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1010,
          transform: 'translateZ(0)',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: '#f6f4ef',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <div className="d-flex justify-content-between align-items-center w-100 px-3">
          {/* Empty space for balance */}
          <div style={{ width: '40px' }} />

          {/* Center logo */}
          <Navbar.Brand className="d-flex align-items-center justify-content-center mx-auto">
            {currentRestaurant?.logo_url ? (
              <img
                src={currentRestaurant.logo_url.startsWith('http') ? currentRestaurant.logo_url : `${API_URL.replace('/api', '')}${currentRestaurant.logo_url}`}
                alt={currentRestaurant.name}
                style={{ height: '42px', width: '42px', objectFit: 'cover', borderRadius: '10px' }}
              />
            ) : (
              <span style={{ fontSize: '1.7rem' }}>🍽️</span>
            )}
          </Navbar.Brand>

          {/* Language switcher with flag */}
          <button
            onClick={toggleLanguage}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title={language === 'ru' ? 'Ўзбекча' : 'Русский'}
          >
            <img
              src={language === 'ru' ? '/ru.svg' : '/uz.svg'}
              alt={language === 'ru' ? 'RU' : 'UZ'}
              style={{ width: '28px', height: '20px', objectFit: 'cover', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
            />
          </button>
        </div>
      </Navbar>

      {selectedRestaurant && selectedCategory !== null && level3Tabs.length > 0 && (
        <div
          style={{
            position: 'sticky',
            top: 56,
            zIndex: 1000,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            padding: '10px 12px 8px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            backgroundColor: '#f6f4ef',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          {level3Tabs.map((section) => (
            <Button
              key={section.id}
              variant={activeSubcategoryTab === section.id ? 'primary' : 'outline-primary'}
              className="me-2 mb-2"
              size="sm"
              onClick={() => scrollToProductGroup(section.id)}
            >
              {section.title}
            </Button>
          ))}
        </div>
      )}

      <Container>
        {/* No restaurants */}
        {restaurants.length === 0 && (
          <div className="text-center py-5">
            <div style={{ fontSize: '4rem' }}>🏪</div>
            <h4 className="mt-3">Рестораны не найдены</h4>
            <p className="text-muted">
              Пока нет активных ресторанов. Пожалуйста, попробуйте позже.
            </p>
          </div>
        )}

        {selectedRestaurant && (
          <>

            {/* Loading */}
            {loading && (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Загрузка...</span>
                </div>
              </div>
            )}

            {!loading && selectedCategory === null && (
              <div className="py-3">
                {level1Categories.map((level1Category) => {
                  const level2Categories = level2ByLevel1.get(level1Category.id) || [];
                  if (level2Categories.length === 0) return null;

                  return (
                    <section key={level1Category.id} className="mb-4">
                      <h5 className="mb-3 fw-bold">{getCategoryName(level1Category)}</h5>
                      <Row className="g-3">
                        {level2Categories.map((level2Category) => {
                          const categoryImage = resolveImageUrl(level2Category.image_url);
                          return (
                            <Col key={level2Category.id} xs={6}>
                              <button
                                type="button"
                                onClick={() => openLevel2Category(level2Category.id)}
                                className="w-100 border-0 p-0 text-start"
                                style={{
                                  borderRadius: '14px',
                                  overflow: 'hidden',
                                  background: '#ffffff',
                                  position: 'relative',
                                  minHeight: '110px'
                                }}
                              >
                                <div
                                  style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundImage: categoryImage ? `url(${categoryImage})` : 'linear-gradient(135deg, #ece7da 0%, #ddd3be 100%)',
                                     backgroundSize: categoryImage ? 'contain' : 'cover',
                                     backgroundPosition: 'center',
                                     backgroundRepeat: 'no-repeat',
                                     backgroundColor: '#ffffff'
                                   }}
                                 />
                                 <div
                                   style={{
                                     position: 'relative',
                                     zIndex: 1,
                                      padding: '10px',
                                     color: '#1f1a14',
                                     fontWeight: 700,
                                     fontSize: '0.88rem',
                                     lineHeight: 1.2
                                   }}
                                 >
                                   <span
                                     style={{
                                       display: 'inline-block',
                                       background: 'rgba(255, 255, 255, 0.88)',
                                       borderRadius: '8px',
                                       padding: '3px 8px'
                                     }}
                                   >
                                     {getCategoryName(level2Category)}
                                   </span>
                                 </div>
                              </button>
                            </Col>
                          );
                        })}
                      </Row>
                    </section>
                  );
                })}
              </div>
            )}

            {!loading && selectedCategory !== null && selectedLevel2Category && (
              <div className="py-3">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <Button variant="outline-secondary" size="sm" onClick={closeLevel2Category}>
                    {language === 'uz' ? 'Orqaga' : 'Назад'}
                  </Button>
                  <h6 className="mb-0 fw-bold text-dark text-end ms-3">{getCategoryName(selectedLevel2Category)}</h6>
                </div>

                {productSections.map((section) => (
                  <section
                    key={section.id}
                    ref={(el) => { productGroupRefs.current[section.id] = el; }}
                    className="mb-4"
                  >
                    <h6 className="mb-3 text-muted fw-bold">{section.title}</h6>
                    <Row className="g-3">
                      {section.products.map((product) => (
                        <Col key={product.id} xs={6}>
                          {renderProductCard(product)}
                        </Col>
                      ))}
                    </Row>
                  </section>
                ))}
              </div>
            )}

            {!loading && selectedCategory === null && level1Categories.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🍽️</div>
                <p className="text-muted mt-3">Товары пока не добавлены</p>
                {isOperator() && (
                  <Button variant="primary" onClick={() => navigate('/admin')}>
                    Добавить товары
                  </Button>
                )}
              </div>
            )}

            {!loading && selectedCategory !== null && productSections.length === 0 && (
              <div className="text-center py-5">
                <div style={{ fontSize: '4rem', opacity: 0.5 }}>🍽️</div>
                <p className="text-muted mt-3">
                  {language === 'uz' ? 'Tanlangan bo‘limda mahsulotlar topilmadi' : 'В выбранном разделе товары не найдены'}
                </p>
              </div>
            )}
          </>
        )}
      </Container>

      {/* Bottom navigation */}
      {!isOperator() && <BottomNav />}

      {/* Spacer for bottom nav */}
      {!isOperator() && <div style={{ height: '70px' }} />}
    </>
  );
}

export default Catalog;
