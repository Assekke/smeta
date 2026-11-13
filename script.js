"use strict";

const items = document.getElementById("items");
const total = document.getElementById("total");
const template = document.getElementById("item-template");
const addButton = document.getElementById("add-item");
let nextItemId = 0;

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
});

function formatMoney(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${moneyFormatter.format(safeValue).replace(/[\u00a0\u202f]/g, " ")} ₸`;
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
    // Round each line to tiyn so the displayed lines add up to the total.
    const rounded = Math.round(product * 100) / 100;
    const amount = Number.isFinite(rounded) ? rounded : 0;
    row.querySelector('[data-field="amount"]').textContent = formatMoney(amount);
    sum += amount;
  }
  total.textContent = formatMoney(sum);
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

const today = new Date();
document.getElementById("estimate-date").value = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0"),
].join("-");

addItem(false);
