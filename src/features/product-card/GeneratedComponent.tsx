import { useEffect, useRef, useState } from "react";
import "./Product.css";
type ProductId = "tomato" | "cucumber" | "carrot";
type Product = {
  id: ProductId;
  name: string;
  price: number;
  stock: number;
  photos: string[];
  description: string;
};
const products: Product[] = [
  {
    id: "tomato",
    name: "Томаты на ветке",
    price: 189,
    stock: 2,
    photos: ["/assets/tomato.png", "/assets/tomato2.png"],
    description: "Спелые томаты для салатов и домашних соусов.",
  },
  {
    id: "cucumber",
    name: "Огурцы",
    price: 159,
    stock: 2,
    photos: ["/assets/cucumber.png"],
    description: "Свежие огурцы для салатов и закусок.",
  },
  {
    id: "carrot",
    name: "Морковь",
    price: 79,
    stock: 2,
    photos: ["/assets/carrot.png"],
    description: "Сочная морковь для домашних блюд.",
  },
];
type Saved = {
  quantities: Record<ProductId, number>;
  favorites: ProductId[];
};
const storageKey = "korzina-product47-demo-v1";
const empty: Saved = {
  quantities: {
    tomato: 1,
    cucumber: 0,
    carrot: 0,
  },
  favorites: [],
};
function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!raw || typeof raw !== "object") return empty;
    const quantities = {
      ...empty.quantities,
    };
    products.forEach((p) => {
      const q = raw.quantities?.[p.id];
      quantities[p.id] = Number.isInteger(q)
        ? Math.max(0, Math.min(p.stock, q))
        : 0;
    });
    return {
      quantities,
      favorites: products
        .filter(
          (p) => Array.isArray(raw.favorites) && raw.favorites.includes(p.id),
        )
        .map((p) => p.id),
    };
  } catch {
    return empty;
  }
}
const money = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
function Brand() {
  return (
    <span className="kp-brand">
      <span className="kp-mark">
        <img src="/assets/korzina.svg" alt="" />
      </span>
      <span>Korzina</span>
    </span>
  );
}
const iconSources: Record<string, string> = {
  back: "/assets/back.svg",
  share: "/assets/share.svg",
  heart: "/assets/heart.svg",
  "heart-filled": "/assets/heart-filled.svg",
};
function Icon({ name }: { name: string }) {
  return <img className="kp-icon" src={iconSources[name]} alt="" />;
}
function Photo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return failed ? (
    <span className="kp-no-photo">Фото недоступно</span>
  ) : (
    <img src={src} alt={alt} onError={() => setFailed(true)} />
  );
}
type View = {
  page: "product" | "catalog" | "info" | "gallery" | "cart" | "share";
  id: ProductId;
  photo: number;
  scroll: number;
};
export const GeneratedComponent = () => {
  const [saved, setSaved] = useState<Saved>(readSaved);
  const [view, setView] = useState<View>({
    page: "product",
    id: "tomato",
    photo: 0,
    scroll: 0,
  });
  const [history, setHistory] = useState<View[]>([]);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const product = products.find((p) => p.id === view.id)!;
  const qty = saved.quantities[product.id];
  const total = products.reduce(
    (sum, p) => sum + p.price * saved.quantities[p.id],
    0,
  );
  const count = Object.values(saved.quantities).reduce((sum, n) => sum + n, 0);
  const liked = saved.favorites.includes(product.id);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(saved));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [saved]);
  useEffect(() => {
    if (content.current) content.current.scrollTop = view.scroll;
  }, [view.page, view.id]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(id);
  }, [notice]);
  function open(page: View["page"], id = view.id) {
    setHistory((h) => [
      ...h,
      {
        ...view,
        scroll: content.current?.scrollTop || 0,
      },
    ]);
    setView({
      page,
      id,
      photo: id === view.id ? view.photo : 0,
      scroll: 0,
    });
  }
  function back() {
    const previous = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setView(
      previous
        ? {
            ...previous,
            photo: previous.id === view.id ? view.photo : previous.photo,
          }
        : {
            page: "catalog",
            id: "tomato",
            photo: 0,
            scroll: 0,
          },
    );
  }
  function change(p: Product, delta: number) {
    setSaved((s) => ({
      ...s,
      quantities: {
        ...s.quantities,
        [p.id]: Math.max(0, Math.min(p.stock, s.quantities[p.id] + delta)),
      },
    }));
  }
  function Quantity({ p, small = false }: { p: Product; small?: boolean }) {
    const q = saved.quantities[p.id];
    return q === 0 ? (
      <button
        className={`kp-add ${small ? "kp-small" : ""}`}
        aria-label={`Добавить: ${p.name}`}
        onClick={() => change(p, 1)}
      >
        {small ? "+" : `+ ${money(p.price)}`}
      </button>
    ) : (
      <div
        className={`kp-quantity ${small ? "kp-small" : ""}`}
        aria-label={`Количество: ${p.name}`}
      >
        <button
          aria-label={`Уменьшить: ${p.name}`}
          onClick={() => change(p, -1)}
        >
          −
        </button>
        <output aria-label={`В корзине: ${p.name}`}>{q}</output>
        <button
          aria-label={`Увеличить: ${p.name}`}
          disabled={q >= p.stock}
          title={q >= p.stock ? "Достигнут доступный остаток" : undefined}
          onClick={() => change(p, 1)}
        >
          +
        </button>
      </div>
    );
  }
  function Cards({ items }: { items: Product[] }) {
    return (
      <div className="kp-cards">
        {items.map((p) => (
          <article className="kp-card" key={p.id}>
            <button
              className="kp-card-image"
              aria-label={`Открыть: ${p.name}`}
              onClick={() => open("product", p.id)}
            >
              <Photo src={p.photos[0]} alt={p.name} />
            </button>
            <div className="kp-card-body">
              <button
                className="kp-card-name"
                onClick={() => open("product", p.id)}
              >
                {p.name}
              </button>
              <p className="kp-card-unit">500 г</p>
              <p className="kp-card-price">{money(p.price)}</p>
              <Quantity p={p} small />
            </div>
          </article>
        ))}
      </div>
    );
  }
  const cycle = () =>
    setView((v) => ({
      ...v,
      photo: (v.photo + 1) % product.photos.length,
    }));
  const pageTitle = {
    catalog: "Овощи и зелень",
    info: "О товаре",
    gallery: "Фотографии",
    cart: "Корзина",
    share: "Поделиться",
    product: "",
  }[view.page];
  return (
    <div className="kp-stage">
      <div className={`kp-app ${view.page === "gallery" ? "kp-viewer" : ""}`}>
        <header className="kp-header">
          {view.page !== "catalog" && (
            <button
              className="kp-icon-button"
              aria-label="Назад"
              onClick={back}
            >
              <Icon name="back" />
            </button>
          )}
          {view.page === "product" || view.page === "catalog" ? (
            <div className="kp-header-title">
              <Brand />
            </div>
          ) : (
            <h1 className="kp-header-title kp-page-title">{pageTitle}</h1>
          )}
          {view.page === "product" && (
            <>
              <button
                className="kp-icon-button"
                aria-label="Поделиться товаром"
                onClick={() => open("share")}
              >
                <Icon name="share" />
              </button>
              <button
                className="kp-icon-button"
                aria-label={
                  liked ? "Удалить из избранного" : "Добавить в избранное"
                }
                aria-pressed={liked}
                onClick={() =>
                  setSaved((s) => ({
                    ...s,
                    favorites: liked
                      ? s.favorites.filter((id) => id !== product.id)
                      : [...s.favorites, product.id],
                  }))
                }
              >
                <Icon name={liked ? "heart-filled" : "heart"} />
              </button>
            </>
          )}
        </header>
        <main ref={content} className={`kp-content kp-${view.page}`}>
          {view.page === "product" && (
            <>
              <div
                className="kp-gallery"
                onTouchStart={(e) => {
                  touch.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (
                    touch.current !== null &&
                    Math.abs(e.changedTouches[0].clientX - touch.current) > 40
                  )
                    cycle();
                  touch.current = null;
                }}
              >
                <button
                  className="kp-main-photo"
                  aria-label={`Увеличить фото ${view.photo + 1}`}
                  onClick={() => open("gallery")}
                >
                  <Photo
                    src={product.photos[view.photo]}
                    alt={`${product.name}, фото ${view.photo + 1}`}
                  />
                </button>
                {product.photos.length > 1 && (
                  <div className="kp-dots">
                    {product.photos.map((_, i) => (
                      <button
                        key={i}
                        aria-label={`Показать фото ${i + 1}`}
                        aria-pressed={i === view.photo}
                        onClick={() =>
                          setView((v) => ({
                            ...v,
                            photo: i,
                          }))
                        }
                      >
                        <span />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <h1 className="kp-product-title">{product.name}</h1>
              <p className="kp-unit">500 г</p>
              <button className="kp-seller" onClick={() => open("catalog")}>
                Korzina&nbsp; ›
              </button>
              <p className="kp-price">{money(product.price)}</p>
              <p className="kp-stock">
                {qty === product.stock
                  ? `Вы добавили все ${product.stock} шт.`
                  : `Всего доступно ${product.stock} шт.`}
              </p>
              <p className="kp-description">{product.description}</p>
              <button className="kp-details" onClick={() => open("info")}>
                Подробнее о товаре&nbsp; ›
              </button>
              <section className="kp-recommendations">
                <h2>С этим покупают</h2>
                <Cards items={products.filter((p) => p.id !== product.id)} />
              </section>
            </>
          )}
          {view.page === "catalog" && (
            <>
              <h1 className="kp-product-title">Овощи и зелень</h1>
              <p className="kp-demo">Тестовый магазин · 3 товара</p>
              <Cards items={products} />
            </>
          )}
          {view.page === "info" && (
            <dl className="kp-info-list">
              {[
                ["Фасовка", "500 г"],
                ["Бренд", "Korzina"],
                ["Категория", "Овощи и зелень"],
                ["Описание", product.description],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view.page === "gallery" && (
            <div className="kp-full-gallery">
              <Photo
                src={product.photos[view.photo]}
                alt={`${product.name}, фото ${view.photo + 1}`}
              />
              {product.photos.length > 1 && (
                <div className="kp-gallery-controls">
                  <button aria-label="Предыдущее фото" onClick={cycle}>
                    ‹
                  </button>
                  <span>
                    {view.photo + 1} / {product.photos.length}
                  </span>
                  <button aria-label="Следующее фото" onClick={cycle}>
                    ›
                  </button>
                </div>
              )}
            </div>
          )}
          {view.page === "cart" && (
            <>
              <p className="kp-demo">
                Демонстрационная корзина · без оформления заказа
              </p>
              {count === 0 ? (
                <div className="kp-empty">
                  <h2>Корзина пуста</h2>
                  <p>Добавьте что-нибудь свежее</p>
                  <button className="kp-details" onClick={back}>
                    К товарам
                  </button>
                </div>
              ) : (
                <>
                  {products
                    .filter((p) => saved.quantities[p.id] > 0)
                    .map((p) => (
                      <article className="kp-cart-row" key={p.id}>
                        <button
                          className="kp-cart-image"
                          aria-label={`Открыть: ${p.name}`}
                          onClick={() => open("product", p.id)}
                        >
                          <Photo src={p.photos[0]} alt={p.name} />
                        </button>
                        <div>
                          <h2>{p.name}</h2>
                          <p className="kp-unit">
                            500 г · {money(p.price)} / шт.
                          </p>
                          <Quantity p={p} small />
                          <p className="kp-row-total">
                            {money(p.price * saved.quantities[p.id])}
                          </p>
                        </div>
                      </article>
                    ))}
                  <div className="kp-total">
                    <span>Итого</span>
                    <strong>{money(total)}</strong>
                  </div>
                </>
              )}
            </>
          )}
          {view.page === "share" && (
            <>
              <h2 className="kp-product-title">{product.name}</h2>
              <p className="kp-description">Тестовая карточка Korzina</p>
              <button
                className="kp-details"
                onClick={async () => {
                  const url = `https://designs.magicpath.ai/v1/fancily-river-7196`;
                  try {
                    if (navigator.share)
                      await navigator.share({
                        title: product.name,
                        url,
                      });
                    else {
                      await navigator.clipboard.writeText(url);
                      setNotice("Ссылка скопирована");
                    }
                  } catch (error) {
                    if ((error as Error).name !== "AbortError")
                      setNotice(
                        "Не удалось поделиться. Скопируйте ссылку ниже.",
                      );
                  }
                }}
              >
                Поделиться ссылкой на тест
              </button>
              <input
                className="kp-share-link"
                aria-label="Ссылка на тест"
                readOnly
                value="https://designs.magicpath.ai/v1/fancily-river-7196"
                onFocus={(e) => e.target.select()}
              />
              <p className="kp-demo">Ссылка ведёт на тестовый экран томатов.</p>
            </>
          )}
        </main>
        {view.page === "product" && (
          <footer className="kp-footer">
            <Quantity p={product} />
          </footer>
        )}
        {view.page === "catalog" && (
          <footer className="kp-footer">
            <button className="kp-cart-link" onClick={() => open("cart")}>
              <span>Корзина · {count} шт.</span>
              <strong>{money(total)}</strong>
            </button>
          </footer>
        )}
        {(notice || storageError) && (
          <div className="kp-notice" role="status">
            {storageError
              ? "Не удалось сохранить корзину в этом браузере"
              : notice}
          </div>
        )}
      </div>
    </div>
  );
};
