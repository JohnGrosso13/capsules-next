"use client";

import * as React from "react";
import { ShoppingCartSimple } from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import type { StoreCartItem } from "./types";

type StoreCartSidebarProps = {
  cartItems: StoreCartItem[];
  subtotal: number;
  hasItems: boolean;
  formatCurrency: (value: number) => string;
  onBeginCheckout: () => void;
  onIncrement: (cartKey: string) => void;
  onDecrement: (cartKey: string) => void;
  onRemove: (cartKey: string) => void;
};

function StoreCartSidebar({
  cartItems,
  subtotal,
  hasItems,
  formatCurrency,
  onBeginCheckout,
  onIncrement,
  onDecrement,
  onRemove,
}: StoreCartSidebarProps) {
  return (
    <aside className={capTheme.storeCartColumn}>
      <section className={`${capTheme.storePanel} ${capTheme.storeCheckoutCard}`}>
        <header className={capTheme.storePanelHeader}>
          <span className={capTheme.storeCartHeaderIcon}>
            <ShoppingCartSimple size={18} weight="bold" />
          </span>
          <div className={capTheme.storeCartHeaderMeta}>
            <h3>Cart</h3>
            <p>Real-time totals for a smooth checkout.</p>
          </div>
        </header>
        <div className={capTheme.storeCartBody}>
          {hasItems ? (
            <ul className={capTheme.storeCartList}>
              {cartItems.map(({ key: cartKey, product, variant, quantity, unitPrice }) => (
                <li key={cartKey} className={capTheme.storeCartItem}>
                  <div>
                    <span>{product.title}</span>
                    {variant ? <p>{variant.label}</p> : null}
                    <p>{formatCurrency(unitPrice)}</p>
                  </div>
                  <div className={capTheme.storeCartControls}>
                    <button
                      type="button"
                      className={capTheme.storeGhostButton}
                      onClick={() => onDecrement(cartKey)}
                      aria-label={`Decrease quantity of ${product.title}`}
                    >
                      -
                    </button>
                    <span className={capTheme.storeQuantity}>{quantity}</span>
                    <button
                      type="button"
                      className={capTheme.storeGhostButton}
                      onClick={() => onIncrement(cartKey)}
                      aria-label={`Increase quantity of ${product.title}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={capTheme.storeGhostButton}
                      onClick={() => onRemove(cartKey)}
                      aria-label={`Remove ${product.title}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={capTheme.storeCartEmpty}>
              Your cart is empty. Add something to begin checkout.
            </p>
          )}
        </div>
        <footer className={capTheme.storeCartFooter}>
          <div className={capTheme.storeCartSummary}>
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <button
            type="button"
            className={capTheme.storePrimaryButton}
            disabled={!hasItems}
            aria-disabled={!hasItems}
            onClick={onBeginCheckout}
          >
            {hasItems ? "Checkout" : "Add items to checkout"}
          </button>
        </footer>
      </section>
    </aside>
  );
}

export { StoreCartSidebar };
