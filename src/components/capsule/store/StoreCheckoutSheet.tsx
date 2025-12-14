"use client";

import * as React from "react";
import {
  CheckCircle,
  CreditCard,
  EnvelopeSimple,
  MapPin,
  PencilSimple,
  SealPercent,
  X,
} from "@phosphor-icons/react/dist/ssr";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import type {
  BillingSnapshot,
  CheckoutDetails,
  CheckoutStep,
  PaymentOption,
  ShippingOption,
  StoreCartItem,
} from "./types";

type StoreCheckoutSheetProps = {
  open: boolean;
  ordersHref?: string;
  step: CheckoutStep;
  steps: CheckoutStep[];
  stepDetails: Record<CheckoutStep, { label: string; description: string }>;
  currentStepIndex: number;
  orderReference: string | null;
  details: CheckoutDetails;
  shippingOptions: ShippingOption[];
  paymentOptions: PaymentOption[];
  selectedShipping: ShippingOption | null;
  selectedPaymentOption: PaymentOption;
  shippingRequired: boolean;
  needsBillingAddress: boolean;
  billingSnapshot: BillingSnapshot;
  maskedCardSummary: string;
  paymentElement?: React.ReactNode;
  paymentError?: string | null;
  checkoutBusy?: boolean;
  orderSummary?: {
    status: string;
    tracking?: string | null;
    carrier?: string | null;
    shippingStatus?: string | null;
    totalCents: number;
    currency: string;
    items: { title: string; quantity: number; unitPriceCents: number }[];
  } | null;
  cartItems: StoreCartItem[];
  subtotal: number;
  shippingCost: number;
  taxEstimate: number;
  orderTotal: number;
  canPlaceOrder: boolean;
  errorFor: (key: string) => string | undefined;
  onUpdateField: (field: keyof CheckoutDetails, value: string | boolean) => void;
  onNextStep: () => void | Promise<void>;
  onBackStep: () => void;
  onJumpToStep: (step: CheckoutStep) => void;
  onPlaceOrder: () => void | Promise<void>;
  onClose: () => void;
  onIncrement: (cartKey: string) => void;
  onDecrement: (cartKey: string) => void;
  onRemove: (cartKey: string) => void;
  formatCurrency: (value: number) => string;
};

function StoreCheckoutSheet({
  open,
  ordersHref,
  step,
  steps,
  stepDetails,
  currentStepIndex,
  orderReference,
  details,
  shippingOptions,
  paymentOptions,
  selectedShipping,
  selectedPaymentOption,
  shippingRequired,
  needsBillingAddress,
  billingSnapshot,
  maskedCardSummary,
  paymentElement,
  paymentError,
  checkoutBusy,
  orderSummary,
  cartItems,
  subtotal,
  shippingCost,
  taxEstimate,
  orderTotal,
  canPlaceOrder,
  errorFor,
  onUpdateField,
  onNextStep,
  onBackStep,
  onJumpToStep,
  onPlaceOrder,
  onClose,
  onIncrement,
  onDecrement,
  onRemove,
  formatCurrency,
}: StoreCheckoutSheetProps) {
  if (!open) return null;
  const resolvedOrdersHref = ordersHref ?? "/create/mystore/orders";

  return (
    <div className={capTheme.checkoutOverlay} role="dialog" aria-modal="true" aria-label="Checkout">
      <div className={capTheme.checkoutSheet}>
        <header className={capTheme.checkoutHeader}>
          <div>
            <p className={capTheme.checkoutEyebrow}>Review & checkout</p>
            <h3>
              {step === "shipping"
                ? "Contact & shipping"
                : step === "billing"
                  ? "Billing & payment"
                  : step === "review"
                    ? "Review order"
                    : "Order confirmed"}
            </h3>
          </div>
          <button
            type="button"
            className={capTheme.storeGhostButton}
            onClick={onClose}
            aria-label="Close checkout"
          >
            <X size={16} weight="bold" />
            Close
          </button>
        </header>

        <div className={capTheme.checkoutStepper}>
          {steps.map((stepId, index) => {
            const detail = stepDetails[stepId];
            const status = index < currentStepIndex ? "done" : index === currentStepIndex ? "active" : "upcoming";
            const muted = stepId === "confirmation" && !orderReference && step !== "confirmation";
            return (
              <div
                key={stepId}
                className={capTheme.checkoutStepBadge}
                data-status={status}
                data-muted={muted ? "true" : undefined}
              >
                <span className={capTheme.checkoutStepIndex}>{index + 1}</span>
                <div>
                  <strong>{detail.label}</strong>
                  <p>{detail.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className={capTheme.checkoutLayout}>
          <form
            className={capTheme.checkoutSection}
            onSubmit={(event) => {
              event.preventDefault();
              onNextStep();
            }}
          >
            {step === "shipping" ? (
              <>
                <div className={capTheme.checkoutGroup}>
                  <div className={capTheme.checkoutGroupHeader}>
                    <EnvelopeSimple size={16} weight="bold" />
                    <div>
                      <h4>Contact</h4>
                      <p>Where we&apos;ll send updates and receipts.</p>
                    </div>
                  </div>
                  <label className={capTheme.storeField} data-invalid={errorFor("email") ? "true" : undefined}>
                    <span>Email</span>
                    <input
                      type="email"
                      value={details.email}
                      onChange={(event) => onUpdateField("email", event.target.value)}
                      required
                    />
                    {errorFor("email") ? <p className={capTheme.checkoutError}>{errorFor("email")}</p> : null}
                  </label>
                  <label className={capTheme.storeField}>
                    <span>Phone (optional)</span>
                    <input
                      type="tel"
                      value={details.phone}
                      onChange={(event) => onUpdateField("phone", event.target.value)}
                    />
                  </label>
                </div>

                <div className={capTheme.checkoutGroup}>
                  <div className={capTheme.checkoutGroupHeader}>
                    <MapPin size={16} weight="bold" />
                    <div>
                      <h4>Shipping</h4>
                      <p>Where this order will be delivered.</p>
                    </div>
                  </div>

                  {shippingRequired ? (
                    <>
                      <label className={capTheme.storeField} data-invalid={errorFor("fullName") ? "true" : undefined}>
                        <span>Full name</span>
                        <input
                          type="text"
                          value={details.fullName}
                          onChange={(event) => onUpdateField("fullName", event.target.value)}
                        />
                        {errorFor("fullName") ? (
                          <p className={capTheme.checkoutError}>{errorFor("fullName")}</p>
                        ) : null}
                      </label>
                      <label className={capTheme.storeField} data-invalid={errorFor("address1") ? "true" : undefined}>
                        <span>Street address</span>
                        <input
                          type="text"
                          value={details.address1}
                          onChange={(event) => onUpdateField("address1", event.target.value)}
                        />
                        {errorFor("address1") ? (
                          <p className={capTheme.checkoutError}>{errorFor("address1")}</p>
                        ) : null}
                      </label>
                      <label className={capTheme.storeField}>
                        <span>Address line 2</span>
                        <input
                          type="text"
                          value={details.address2}
                          onChange={(event) => onUpdateField("address2", event.target.value)}
                        />
                      </label>
                      <div className={capTheme.checkoutFieldRow}>
                        <label className={capTheme.storeField} data-invalid={errorFor("city") ? "true" : undefined}>
                          <span>City</span>
                          <input
                            type="text"
                            value={details.city}
                            onChange={(event) => onUpdateField("city", event.target.value)}
                          />
                          {errorFor("city") ? <p className={capTheme.checkoutError}>{errorFor("city")}</p> : null}
                        </label>
                        <label className={capTheme.storeField} data-invalid={errorFor("region") ? "true" : undefined}>
                          <span>State / Region</span>
                          <input
                            type="text"
                            value={details.region}
                            onChange={(event) => onUpdateField("region", event.target.value)}
                          />
                          {errorFor("region") ? (
                            <p className={capTheme.checkoutError}>{errorFor("region")}</p>
                          ) : null}
                        </label>
                      </div>
                      <div className={capTheme.checkoutFieldRow}>
                        <label className={capTheme.storeField} data-invalid={errorFor("postal") ? "true" : undefined}>
                          <span>Postal code</span>
                          <input
                            type="text"
                            value={details.postal}
                            onChange={(event) => onUpdateField("postal", event.target.value)}
                          />
                          {errorFor("postal") ? (
                            <p className={capTheme.checkoutError}>{errorFor("postal")}</p>
                          ) : null}
                        </label>
                        <label className={capTheme.storeField} data-invalid={errorFor("country") ? "true" : undefined}>
                          <span>Country</span>
                          <input
                            type="text"
                            value={details.country}
                            onChange={(event) => onUpdateField("country", event.target.value)}
                          />
                          {errorFor("country") ? (
                            <p className={capTheme.checkoutError}>{errorFor("country")}</p>
                          ) : null}
                        </label>
                      </div>

                      {!shippingOptions.length ? (
                        <p className={capTheme.checkoutError}>
                          Shipping options are not available yet. Please contact the capsule owner.
                        </p>
                      ) : (
                        <>
                          <div
                            className={capTheme.checkoutOptions}
                            data-invalid={errorFor("shippingOption") ? "true" : undefined}
                          >
                            {shippingOptions.map((option) => (
                              <label key={option.id} className={capTheme.checkoutOptionCard}>
                                <input
                                  type="radio"
                                  name="shipping-option"
                                  value={option.id}
                                  checked={details.shippingOption === option.id}
                                  onChange={(event) => onUpdateField("shippingOption", event.target.value)}
                                />
                                <div>
                                  <div className={capTheme.checkoutOptionTop}>
                                    <strong>{option.label}</strong>
                                    <span>{option.price === 0 ? "Free" : formatCurrency(option.price)}</span>
                                  </div>
                                  <p>{option.detail}</p>
                                </div>
                              </label>
                            ))}
                          </div>
                          {errorFor("shippingOption") ? (
                            <p className={capTheme.checkoutError}>{errorFor("shippingOption")}</p>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <p className={capTheme.checkoutEyebrow}>No shipping required for this order.</p>
                  )}
                </div>
              </>
            ) : null}

            {step === "billing" ? (
              <>
                <div className={capTheme.checkoutGroup}>
                  <div className={capTheme.checkoutGroupHeader}>
                    <CreditCard size={16} weight="bold" />
                    <div>
                      <h4>Payment</h4>
                      <p>Select your payment method.</p>
                    </div>
                  </div>
                <div className={capTheme.checkoutOptions}>
                  {paymentOptions.map((option) => (
                    <label key={option.id} className={capTheme.checkoutOptionCard}>
                      <input
                        type="radio"
                          name="payment-option"
                          value={option.id}
                          checked={details.paymentMethod === option.id}
                          onChange={(event) => onUpdateField("paymentMethod", event.target.value)}
                        />
                        <div className={capTheme.checkoutOptionTop}>
                          <strong>{option.label}</strong>
                          <span>{option.detail}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className={capTheme.storeField} data-full-width="true">
                    {paymentElement ? (
                      paymentElement
                    ) : (
                      <p className={capTheme.checkoutError}>Payment is not available. Configure Stripe.</p>
                    )}
                  </div>
                  {paymentError ? <p className={capTheme.checkoutError}>{paymentError}</p> : null}
                  <label className={capTheme.storeField}>
                    <span>Order notes (optional)</span>
                    <textarea
                      rows={3}
                      value={details.notes}
                      onChange={(event) => onUpdateField("notes", event.target.value)}
                    />
                  </label>
                </div>

                <div className={capTheme.checkoutGroup}>
                  <div className={capTheme.checkoutGroupHeader}>
                    <MapPin size={16} weight="bold" />
                    <div>
                      <h4>Billing address</h4>
                      <p>For receipts and verification.</p>
                    </div>
                  </div>
                  {shippingRequired ? (
                    <label className={capTheme.checkoutToggle}>
                      <input
                        type="checkbox"
                        checked={details.billingSameAsShipping}
                        onChange={(event) => onUpdateField("billingSameAsShipping", event.target.checked)}
                      />
                      <span>Use shipping address for billing</span>
                    </label>
                  ) : (
                    <p className={capTheme.checkoutHint}>Billing details are required for digital items.</p>
                  )}
                  {needsBillingAddress ? (
                    <>
                      <label
                        className={capTheme.storeField}
                        data-invalid={errorFor("billingName") ? "true" : undefined}
                      >
                        <span>Billing name</span>
                        <input
                          type="text"
                          value={details.billingName}
                          onChange={(event) => onUpdateField("billingName", event.target.value)}
                        />
                        {errorFor("billingName") ? (
                          <p className={capTheme.checkoutError}>{errorFor("billingName")}</p>
                        ) : null}
                      </label>
                      <label
                        className={capTheme.storeField}
                        data-invalid={errorFor("billingAddress1") ? "true" : undefined}
                      >
                        <span>Billing address</span>
                        <input
                          type="text"
                          value={details.billingAddress1}
                          onChange={(event) => onUpdateField("billingAddress1", event.target.value)}
                        />
                        {errorFor("billingAddress1") ? (
                          <p className={capTheme.checkoutError}>{errorFor("billingAddress1")}</p>
                        ) : null}
                      </label>
                      <label className={capTheme.storeField}>
                        <span>Address line 2</span>
                        <input
                          type="text"
                          value={details.billingAddress2}
                          onChange={(event) => onUpdateField("billingAddress2", event.target.value)}
                        />
                      </label>
                      <div className={capTheme.checkoutFieldRow}>
                        <label
                          className={capTheme.storeField}
                          data-invalid={errorFor("billingCity") ? "true" : undefined}
                        >
                          <span>City</span>
                          <input
                            type="text"
                            value={details.billingCity}
                            onChange={(event) => onUpdateField("billingCity", event.target.value)}
                          />
                          {errorFor("billingCity") ? (
                            <p className={capTheme.checkoutError}>{errorFor("billingCity")}</p>
                          ) : null}
                        </label>
                        <label
                          className={capTheme.storeField}
                          data-invalid={errorFor("billingRegion") ? "true" : undefined}
                        >
                          <span>State / Region</span>
                          <input
                            type="text"
                            value={details.billingRegion}
                            onChange={(event) => onUpdateField("billingRegion", event.target.value)}
                          />
                          {errorFor("billingRegion") ? (
                            <p className={capTheme.checkoutError}>{errorFor("billingRegion")}</p>
                          ) : null}
                        </label>
                      </div>
                      <div className={capTheme.checkoutFieldRow}>
                        <label
                          className={capTheme.storeField}
                          data-invalid={errorFor("billingPostal") ? "true" : undefined}
                        >
                          <span>Postal code</span>
                          <input
                            type="text"
                            value={details.billingPostal}
                            onChange={(event) => onUpdateField("billingPostal", event.target.value)}
                          />
                          {errorFor("billingPostal") ? (
                            <p className={capTheme.checkoutError}>{errorFor("billingPostal")}</p>
                          ) : null}
                        </label>
                        <label
                          className={capTheme.storeField}
                          data-invalid={errorFor("billingCountry") ? "true" : undefined}
                        >
                          <span>Country</span>
                          <input
                            type="text"
                            value={details.billingCountry}
                            onChange={(event) => onUpdateField("billingCountry", event.target.value)}
                          />
                          {errorFor("billingCountry") ? (
                            <p className={capTheme.checkoutError}>{errorFor("billingCountry")}</p>
                          ) : null}
                        </label>
                      </div>
                    </>
                  ) : (
                    <p className={capTheme.checkoutEyebrow}>Billing address will match your shipping details.</p>
                  )}
                </div>
              </>
            ) : null}

            {step === "review" ? (
              <div className={capTheme.checkoutReviewGrid}>
                <div className={capTheme.checkoutReviewCard}>
                  <div className={capTheme.checkoutReviewHeader}>
                    <EnvelopeSimple size={16} weight="bold" />
                    <div>
                      <strong>Contact</strong>
                      <p>Receipts and updates</p>
                    </div>
                  </div>
                  <p className={capTheme.checkoutReviewValue}>{details.email || "Add an email"}</p>
                  {details.phone ? (
                    <p className={capTheme.checkoutReviewValue}>{details.phone}</p>
                  ) : (
                    <p className={capTheme.checkoutHint}>Phone is optional.</p>
                  )}
                  <button type="button" className={capTheme.storeGhostButton} onClick={() => onJumpToStep("shipping")}>
                    Edit contact
                  </button>
                </div>

                <div className={capTheme.checkoutReviewCard}>
                  <div className={capTheme.checkoutReviewHeader}>
                    <MapPin size={16} weight="bold" />
                    <div>
                      <strong>Shipping</strong>
                      <p>Where it&apos;s headed</p>
                    </div>
                  </div>
                  {shippingRequired ? (
                    <>
                      <p className={capTheme.checkoutReviewValue}>{details.fullName}</p>
                      <p className={capTheme.checkoutReviewValue}>{details.address1}</p>
                      {details.address2 ? <p className={capTheme.checkoutReviewValue}>{details.address2}</p> : null}
                      <p className={capTheme.checkoutReviewValue}>
                        {[details.city, details.region, details.postal].filter(Boolean).join(", ")}
                      </p>
                      <p className={capTheme.checkoutReviewValue}>{details.country}</p>
                      <p className={capTheme.checkoutHint}>
                        {selectedShipping
                          ? `${selectedShipping.label} (${formatCurrency(selectedShipping.price)})`
                          : "Select a shipping option"}
                      </p>
                    </>
                  ) : (
                    <p className={capTheme.checkoutHint}>Digital delivery - no shipping needed.</p>
                  )}
                  <button type="button" className={capTheme.storeGhostButton} onClick={() => onJumpToStep("shipping")}>
                    Edit shipping
                  </button>
                </div>

                <div className={capTheme.checkoutReviewCard}>
                  <div className={capTheme.checkoutReviewHeader}>
                    <CreditCard size={16} weight="bold" />
                    <div>
                      <strong>Billing & payment</strong>
                      <p>How you&apos;re paying</p>
                    </div>
                  </div>
                  <p className={capTheme.checkoutReviewValue}>{selectedPaymentOption.label}</p>
                  <p className={capTheme.checkoutReviewValue}>
                    {maskedCardSummary} - {details.cardExpiry || "MM/YY"}
                  </p>
                  <p className={capTheme.checkoutReviewValue}>
                    {billingSnapshot.name}
                    <br />
                    {billingSnapshot.address1}
                    {billingSnapshot.address2 ? (
                      <>
                        <br />
                        {billingSnapshot.address2}
                      </>
                    ) : null}
                    <br />
                    {[billingSnapshot.city, billingSnapshot.region, billingSnapshot.postal].filter(Boolean).join(", ")}
                    <br />
                    {billingSnapshot.country}
                  </p>
                  <button type="button" className={capTheme.storeGhostButton} onClick={() => onJumpToStep("billing")}>
                    Edit billing
                  </button>
                </div>

                {details.notes ? (
                  <div className={capTheme.checkoutReviewCard}>
                    <div className={capTheme.checkoutReviewHeader}>
                      <PencilSimple size={16} weight="bold" />
                      <div>
                        <strong>Order notes</strong>
                        <p>Special instructions</p>
                      </div>
                    </div>
                    <p className={capTheme.checkoutReviewValue}>{details.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === "confirmation" ? (
              <div className={capTheme.checkoutConfirmation}>
                <div className={capTheme.checkoutConfirmationIcon}>
                  <CheckCircle size={32} weight="duotone" />
                </div>
                <h4>Order confirmed</h4>
                <p className={capTheme.checkoutReviewValue}>Reference {orderReference ?? "Pending"}.</p>
                <p className={capTheme.checkoutHint}>
                  We&apos;ll email {details.email || "your inbox"} when fulfillment begins.
                </p>
                <p className={capTheme.checkoutHint}>
                  Delivery:{" "}
                  {shippingRequired
                    ? selectedShipping
                      ? `${selectedShipping.label}${selectedShipping.detail ? ` — ${selectedShipping.detail}` : ""}`
                      : "Shipping will be assigned before fulfillment."
                    : "Digital delivery"}
                </p>
              <div className={capTheme.storeSupportActions}>
                  <a className={capTheme.storeActionButton} href={resolvedOrdersHref}>
                    View all my orders
                  </a>
                  <button type="button" className={capTheme.storeGhostButton} onClick={onClose}>
                    Back to store
                  </button>
                </div>
              </div>
            ) : null}
          </form>

          <aside className={capTheme.checkoutSummary}>
            <div className={capTheme.checkoutSummaryHeader}>
              <h4>Order summary</h4>
              <span>
                {cartItems.length} item{cartItems.length === 1 ? "" : "s"} - Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
              </span>
            </div>
            {errorFor("cart") ? <p className={capTheme.checkoutError}>{errorFor("cart")}</p> : null}
            <ul className={capTheme.checkoutList}>
              {cartItems.map(({ key: cartKey, product, variant, quantity, unitPrice }) => (
                <li key={cartKey} className={capTheme.checkoutLineItem}>
                  <div>
                    <strong>{product.title}</strong>
                    {variant ? <p>{variant.label}</p> : null}
                    <p>{product.description}</p>
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
                  </div>
                  <div className={capTheme.checkoutPrice}>
                    <span>{formatCurrency(unitPrice * quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className={capTheme.checkoutPromo}>
              <label className={capTheme.storeField}>
                <span>
                  <SealPercent size={14} weight="bold" /> Promo code
                </span>
                <div className={capTheme.checkoutPromoRow}>
                  <input
                    type="text"
                    value={details.promoCode}
                    onChange={(event) => onUpdateField("promoCode", event.target.value)}
                    placeholder="SUMMER25"
                  />
                  <button type="button" className={capTheme.storeActionButton}>
                    Apply
                  </button>
                </div>
              </label>
            </div>

            <div className={capTheme.checkoutTotals}>
              <div>
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div>
                <span>Shipping</span>
                <strong>{formatCurrency(shippingCost)}</strong>
              </div>
              <div>
                <span>Tax (est.)</span>
                <strong>{formatCurrency(taxEstimate)}</strong>
              </div>
              <div className={capTheme.checkoutTotalRow}>
                <span>Total</span>
                <strong>{formatCurrency(orderTotal)}</strong>
              </div>
            </div>

            {step === "confirmation" && orderSummary ? (
              <div className={capTheme.checkoutGroup}>
                <div className={capTheme.checkoutGroupHeader}>
                  <CheckCircle size={16} weight="bold" />
                  <div>
                    <h4>Order details</h4>
                    <p>Status: {orderSummary.status}</p>
                  </div>
                </div>
                <ul className={capTheme.checkoutReviewList}>
                  {orderSummary.items.map((item) => (
                    <li key={item.title} className={capTheme.checkoutReviewCard}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>Quantity: {item.quantity}</p>
                      </div>
                      <div>
                        <span>{formatCurrency(item.unitPriceCents / 100)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {orderSummary.shippingStatus ? (
                  <p className={capTheme.checkoutHint}>Shipping status: {orderSummary.shippingStatus}</p>
                ) : null}
                {orderSummary.tracking ? (
                  <p className={capTheme.checkoutHint}>
                    Tracking:{" "}
                    <a href={orderSummary.tracking} target="_blank" rel="noreferrer">
                      {orderSummary.tracking}
                    </a>
                    {orderSummary.carrier ? ` (${orderSummary.carrier})` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "review" ? (
              <div className={capTheme.checkoutFooter}>
                <label className={capTheme.checkoutTerms} data-invalid={errorFor("terms") ? "true" : undefined}>
                  <input
                    type="checkbox"
                    checked={details.termsAccepted}
                    onChange={(event) => onUpdateField("termsAccepted", event.target.checked)}
                  />
                  <span>I agree to the store terms and refund policy.</span>
                </label>
                {errorFor("terms") ? <p className={capTheme.checkoutError}>{errorFor("terms")}</p> : null}
              </div>
            ) : null}

            <div className={capTheme.checkoutActions}>
              <button
                type="button"
                className={capTheme.storeGhostButton}
                onClick={step === "confirmation" ? onClose : onBackStep}
                disabled={checkoutBusy}
              >
                {step === "shipping" ? "Back to cart" : step === "confirmation" ? "Back to store" : "Back"}
              </button>
              {step === "confirmation" ? (
                <a className={capTheme.storePrimaryButton} href={resolvedOrdersHref}>
                  View all my orders
                </a>
              ) : step === "review" ? (
                <button
                  type="button"
                  className={capTheme.storePrimaryButton}
                  disabled={!canPlaceOrder || checkoutBusy}
                  aria-disabled={!canPlaceOrder || checkoutBusy}
                  onClick={() => {
                    void onPlaceOrder();
                  }}
                >
                  {checkoutBusy ? "Processing..." : "Place order"}
                </button>
              ) : (
                <button
                  type="button"
                  className={capTheme.storePrimaryButton}
                  onClick={() => {
                    void onNextStep();
                  }}
                  disabled={checkoutBusy}
                >
                  {checkoutBusy
                    ? "Working..."
                    : step === "shipping"
                      ? "Next: Billing"
                      : "Next: Review"}
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export { StoreCheckoutSheet };
