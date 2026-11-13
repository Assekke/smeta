"use strict";

const items = document.getElementById("items");
const total = document.getElementById("total");
const template = document.getElementById("item-template");
const addButton = document.getElementById("add-item");
const discountInput = document.getElementById("discount-percent");
const vatInput = document.getElementById("vat-percent");
const currencyInput = document.getElementById("currency");
let nextItemId = 0;

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatMoney(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${moneyFormatter.format(safeValue).replace(/[\u00a0\u202f]/g, " ")} ${currencyInput.value}`;
}

function parseNumber(value) {
  const normalized = value.trim().replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return 0;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function recalculate() {
  let sum = 0;
  for (const row of items.rows) {
    const quantity = parseNumber(row.querySelector('[data-field="quantity"]').value);
    const price = parseNumber(row.querySelector('[data-field="price"]').value);
    const product = quantity * price;
    // Round each line so the displayed amounts add up to the subtotal.
    const rounded = Math.round(product);
    const amount = Number.isFinite(rounded) ? rounded : 0;
    row.querySelector('[data-field="amount"]').textContent = formatMoney(amount);
    sum += amount;
  }
  if (!Number.isFinite(sum)) sum = 0;
  const discount = roundedAmount(sum * (parseNumber(discountInput.value) / 100));
  const discounted = roundedAmount(sum - discount);
  const vat = roundedAmount(discounted * (parseNumber(vatInput.value) / 100));
  document.getElementById("subtotal").textContent = formatMoney(sum);
  updateSummary("discount", "discount-amount", discount);
  updateSummary("discounted", "discounted-amount", discounted);
  updateSummary("vat", "vat-amount", vat);
  total.textContent = formatMoney(roundedAmount(discounted + vat));
  for (const symbol of document.querySelectorAll("[data-currency]")) {
    symbol.textContent = currencyInput.value;
  }
}

function roundedAmount(value) {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

function updateSummary(rowName, outputId, amount) {
  document.getElementById(outputId).textContent = formatMoney(amount);
  document.getElementById(`${rowName}-row`).hidden = amount === 0;
}

function addItem(focusName = true) {
  const row = template.content.firstElementChild.cloneNode(true);
  const id = ++nextItemId;
  for (const label of row.querySelectorAll("label[data-label]")) {
    const field = label.dataset.label;
    const input = row.querySelector(`[data-field="${field}"]`);
    input.id = `item-${id}-${field}`;
    label.htmlFor = input.id;
  }
  items.append(row);
  recalculate();
  if (focusName) row.querySelector('[data-field="name"]').focus();
}

items.addEventListener("input", recalculate);
items.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-button");
  if (!button) return;
  const row = button.closest("tr");
  const nextRow = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  recalculate();
  if (nextRow) nextRow.querySelector('[data-field="name"]').focus();
  else addButton.focus();
});

items.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.isComposing || event.repeat) return;
  if (!event.target.matches("input, select")) return;
  if (event.target.closest("tr") !== items.lastElementChild) return;
  event.preventDefault();
  addItem();
});

addButton.addEventListener("click", () => addItem());
discountInput.addEventListener("input", recalculate);
vatInput.addEventListener("input", recalculate);
currencyInput.addEventListener("change", recalculate);

function preparePrint() {
  recalculate();
  const number = document.getElementById("estimate-number").value.trim() || "—";
  const date = document.getElementById("estimate-date").value;
  const formattedDate = date ? date.split("-").reverse().join(".") : "—";
  document.getElementById("print-heading").textContent = `Смета № ${number} от ${formattedDate}`;

  // Plain text copies wrap long values and print the entire comment.
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.querySelectorAll(".details-grid input, #items input, #items select, #comment").forEach((field) => {
    const value = document.createElement("span");
    value.className = "print-value";
    if (field.dataset.field === "price") {
      value.textContent = formatMoney(parseNumber(field.value));
    } else if (field.dataset.field === "quantity") {
      value.textContent = String(parseNumber(field.value)).replace(".", ",");
    } else {
      value.textContent = field.type === "date" ? formattedDate : field.value;
    }
    field.insertAdjacentElement("afterend", value);
  });
}

document.getElementById("save-pdf").addEventListener("click", () => {
  preparePrint();
  window.print();
});
window.addEventListener("beforeprint", preparePrint);

const today = new Date();
document.getElementById("estimate-date").value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

addItem(false);
