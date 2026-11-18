"use strict";

const items = document.getElementById("items");
const total = document.getElementById("total");
const template = document.getElementById("item-template");
const addButton = document.getElementById("add-item");
const discountInput = document.getElementById("discount-percent");
const vatInput = document.getElementById("vat-percent");
const currencyInput = document.getElementById("currency");
let nextItemId = 0;
const draftKey = "smeta-draft-v1";
const draftFields = ["sender", "recipient", "estimate-number", "estimate-date", "valid-until", "comment", "discount-percent", "vat-percent", "currency", "advance-type", "advance-value", "delivery-value"];
// Optional fields let drafts from earlier versions open without losing data.
const draftDefaults = { "valid-until": "", "advance-type": "amount", "advance-value": "0", "delivery-value": "0" };
const itemFields = ["name", "quantity", "unit", "price"];
let restoringDraft = true;
let copyTimer;
const companyKey = "smeta-company-v1";
const companyFields = ["company-phone", "company-address", "company-details"];
let companyLogo = "";
const catalogKey = "smeta-catalog-v1";
let catalog = [];

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

function tengeInWords(amount) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 999999999) return "";
  const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const words = [];
  for (const [divisor, forms, feminine] of [
    [1000000, ["миллион", "миллиона", "миллионов"], false],
    [1000, ["тысяча", "тысячи", "тысяч"], true],
    [1, null, false],
  ]) {
    const group = Math.floor(amount / divisor) % 1000;
    if (!group) continue;
    if (group >= 100) words.push(hundreds[Math.floor(group / 100)]);
    const lastTwo = group % 100;
    const last = group % 10;
    if (lastTwo >= 10 && lastTwo <= 19) {
      words.push(teens[lastTwo - 10]);
    } else {
      if (lastTwo >= 20) words.push(tens[Math.floor(lastTwo / 10)]);
      if (last) words.push(feminine && last <= 2 ? ["", "одна", "две"][last] : ones[last]);
    }
    if (forms) {
      const form = lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2;
      words.push(forms[form]);
    }
  }
  words.push("тенге");
  const text = words.join(" ");
  return text[0].toUpperCase() + text.slice(1);
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
  const delivery = roundedAmount(parseNumber(document.getElementById("delivery-value").value));
  updateSummary("delivery", "delivery-amount", delivery);
  const payable = roundedAmount(discounted + vat + delivery);
  total.textContent = formatMoney(payable);
  const totalWords = document.getElementById("total-words");
  totalWords.textContent = currencyInput.value === "₸" ? tengeInWords(payable) : "";
  totalWords.hidden = !totalWords.textContent;
  const advanceValue = parseNumber(document.getElementById("advance-value").value);
  const requestedAdvance = document.getElementById("advance-type").value === "percent"
    ? roundedAmount(payable * (Math.min(advanceValue, 100) / 100))
    : roundedAmount(advanceValue);
  const advance = Math.min(Math.max(payable, 0), Math.max(requestedAdvance, 0));
  document.getElementById("advance-amount").textContent = formatMoney(advance);
  document.getElementById("balance-amount").textContent = formatMoney(payable - advance);
  document.getElementById("payment-summary").hidden = advance === 0;
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

function addItem(focusName = true, values = null) {
  const row = template.content.firstElementChild.cloneNode(true);
  const id = ++nextItemId;
  for (const label of row.querySelectorAll("label[data-label]")) {
    const field = label.dataset.label;
    const input = row.querySelector(`[data-field="${field}"]`);
    input.id = `item-${id}-${field}`;
    label.htmlFor = input.id;
  }
  if (values) {
    for (const field of itemFields) {
      row.querySelector(`[data-field="${field}"]`).value = values[field];
    }
  }
  items.append(row);
  recalculate();
  saveDraft();
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
  saveDraft();
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
currencyInput.addEventListener("change", () => {
  recalculate();
  renderCatalog();
});
document.getElementById("advance-type").addEventListener("change", recalculate);
document.getElementById("advance-value").addEventListener("input", recalculate);
document.getElementById("delivery-value").addEventListener("input", recalculate);

function preparePrint() {
  recalculate();
  const number = document.getElementById("estimate-number").value.trim() || "—";
  const date = document.getElementById("estimate-date").value;
  const formattedDate = formatDate(date);
  document.getElementById("print-heading").textContent = `Смета № ${number} от ${formattedDate}`;
  document.getElementById("validity-field").classList.toggle("empty-print-field", !document.getElementById("valid-until").value);
  renderCompany();

  // Plain text copies wrap long values and print the entire comment.
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.querySelectorAll('.details-grid input:not([type="hidden"]), .company-fields textarea, #items input, #items select, #comment').forEach((field) => {
    const value = document.createElement("span");
    value.className = "print-value";
    if (field.dataset.field === "price") {
      value.textContent = formatMoney(parseNumber(field.value));
    } else if (field.dataset.field === "quantity") {
      value.textContent = String(parseNumber(field.value)).replace(".", ",");
    } else {
      value.textContent = field.type === "date" ? formatDate(field.value) : field.value;
    }
    field.insertAdjacentElement("afterend", value);
  });
}

document.getElementById("save-pdf").addEventListener("click", () => {
  preparePrint();
  window.print();
});
window.addEventListener("beforeprint", preparePrint);

function todayDate() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function formatDate(value) {
  return value ? value.split("-").reverse().join(".") : "—";
}

function restoreValidityDisplay() {
  const field = document.getElementById("valid-until-display");
  const value = document.getElementById("valid-until").value;
  field.value = value ? formatDate(value) : "";
  field.setCustomValidity("");
}

document.getElementById("valid-until-display").addEventListener("input", (event) => {
  const field = event.target;
  const text = field.value.trim();
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  let iso = "";
  if (match) {
    const [, day, month, year] = match;
    const candidate = `${year}-${month}-${day}`;
    const date = new Date(`${candidate}T00:00:00Z`);
    if (Number(year) > 0 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate) iso = candidate;
  }
  document.getElementById("valid-until").value = iso;
  field.setCustomValidity(text && !iso ? "Введите существующую дату в формате дд.мм.гггг" : "");
  saveDraft();
});
document.getElementById("valid-until-display").addEventListener("change", (event) => event.target.reportValidity());

function validLogo(value) {
  return typeof value === "string" && (value === "" || (value.length <= 1400000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)));
}

function renderCompany() {
  const preview = document.getElementById("company-logo");
  preview.hidden = !companyLogo;
  if (companyLogo) preview.src = companyLogo;
  else preview.removeAttribute("src");
  document.getElementById("remove-logo").hidden = !companyLogo;
  const hasContacts = companyFields.some((id) => document.getElementById(id).value.trim());
  document.getElementById("company-card").classList.toggle("empty-print-field", !companyLogo && !hasContacts);
  for (const id of companyFields) {
    document.getElementById(id).closest("label").classList.toggle("empty-print-field", !document.getElementById(id).value.trim());
  }
}

function saveCompany() {
  renderCompany();
  const fields = Object.fromEntries(companyFields.map((id) => [id, document.getElementById(id).value]));
  try {
    localStorage.setItem(companyKey, JSON.stringify({ fields, logo: companyLogo }));
    document.getElementById("company-status").textContent = "";
  } catch {
    document.getElementById("company-status").textContent = "Не удалось сохранить контакты или логотип. Попробуйте изображение меньшего размера.";
  }
}

function restoreCompany() {
  try {
    const stored = localStorage.getItem(companyKey);
    if (stored) {
      const profile = JSON.parse(stored);
      if (!profile || !profile.fields || !companyFields.every((id) => typeof profile.fields[id] === "string") || !validLogo(profile.logo)) throw new Error("Invalid company");
      companyLogo = profile.logo;
      for (const id of companyFields) document.getElementById(id).value = profile.fields[id];
    }
  } catch {
    document.getElementById("company-status").textContent = "Не удалось восстановить контакты компании из браузера.";
  }
  renderCompany();
}

function restoreCatalog() {
  try {
    const stored = localStorage.getItem(catalogKey);
    if (!stored) return;
    const entries = JSON.parse(stored);
    if (!Array.isArray(entries) || !entries.every((entry) => entry
      && Number.isSafeInteger(entry.id) && entry.id > 0
      && typeof entry.name === "string" && entry.name.trim()
      && typeof entry.price === "string"
      && ["шт", "час", "услуга"].includes(entry.unit)
      && ["₸", "₽", "$", "€"].includes(entry.currency))
      || new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("Invalid catalog");
    catalog = entries;
  } catch {
    document.getElementById("catalog-status").textContent = "Не удалось восстановить каталог из браузера.";
  }
}

function saveCatalog() {
  try {
    localStorage.setItem(catalogKey, JSON.stringify(catalog));
    return true;
  } catch {
    document.getElementById("catalog-status").textContent = "Не удалось сохранить каталог. Записи доступны только до закрытия страницы.";
    return false;
  }
}

function renderCatalog() {
  const list = document.getElementById("catalog-list");
  list.replaceChildren();
  const entries = catalog.filter((entry) => entry.currency === currencyInput.value);
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "field-hint";
    empty.textContent = "В этой валюте пока нет сохранённых позиций.";
    list.append(empty);
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "catalog-entry";
    const label = document.createElement("span");
    label.textContent = `${entry.name} — ${formatMoney(parseNumber(entry.price))} / ${entry.unit}`;
    const add = document.createElement("button");
    add.type = "button";
    add.className = "secondary-button";
    add.textContent = "Добавить";
    add.dataset.catalogAdd = String(entry.id);
    add.setAttribute("aria-label", `Добавить «${entry.name}» в смету`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Удалить";
    remove.dataset.catalogRemove = String(entry.id);
    remove.setAttribute("aria-label", `Удалить «${entry.name}» из каталога`);
    row.append(label, add, remove);
    list.append(row);
  }
}

document.getElementById("catalog-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const nameInput = document.getElementById("catalog-name");
  const name = nameInput.value.trim();
  if (!name) {
    document.getElementById("catalog-status").textContent = "Введите наименование позиции.";
    nameInput.focus();
    return;
  }
  const unit = document.getElementById("catalog-unit").value;
  const price = String(parseNumber(document.getElementById("catalog-price").value));
  const existing = catalog.find((entry) => entry.name === name && entry.unit === unit && entry.currency === currencyInput.value);
  if (existing) existing.price = price;
  else catalog.push({ id: catalog.reduce((max, entry) => Math.max(max, entry.id), 0) + 1, name, unit, price, currency: currencyInput.value });
  if (saveCatalog()) document.getElementById("catalog-status").textContent = existing ? "Цена в каталоге обновлена." : "Позиция сохранена в каталоге.";
  renderCatalog();
  nameInput.value = "";
  document.getElementById("catalog-price").value = "0";
  nameInput.focus();
});

document.getElementById("catalog-list").addEventListener("click", (event) => {
  const add = event.target.closest("[data-catalog-add]");
  const remove = event.target.closest("[data-catalog-remove]");
  const button = add || remove;
  if (!button) return;
  const id = Number(add ? add.dataset.catalogAdd : remove.dataset.catalogRemove);
  const entry = catalog.find((item) => item.id === id && item.currency === currencyInput.value);
  if (!entry) return;
  if (remove) {
    if (!window.confirm(`Удалить «${entry.name}» из каталога? Позиции в смете останутся.`)) return;
    catalog = catalog.filter((item) => item.id !== id);
    if (saveCatalog()) document.getElementById("catalog-status").textContent = "Позиция удалена из каталога.";
    renderCatalog();
    document.getElementById("catalog-name").focus();
    return;
  }
  const values = { name: entry.name, quantity: "1", unit: entry.unit, price: entry.price };
  const empty = Array.from(items.rows).find((row) => ["name", "quantity", "price"].every((field) => !row.querySelector(`[data-field="${field}"]`).value.trim()));
  if (empty) {
    for (const field of itemFields) empty.querySelector(`[data-field="${field}"]`).value = values[field];
    recalculate();
    saveDraft();
    empty.querySelector('[data-field="quantity"]').focus();
  } else addItem(true, values);
});

for (const id of companyFields) {
  document.getElementById(id).addEventListener("input", saveCompany);
  document.getElementById(id).addEventListener("change", saveCompany);
}

document.getElementById("choose-logo").addEventListener("click", () => document.getElementById("logo-file").click());

document.getElementById("logo-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) throw new Error("Invalid logo file");
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Cannot read logo"));
      reader.readAsDataURL(file);
    });
    if (!validLogo(data)) throw new Error("Invalid logo data");
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error("Cannot decode logo"));
      image.src = data;
    });
    companyLogo = data;
    saveCompany();
  } catch {
    document.getElementById("company-status").textContent = "Выберите исправное изображение PNG, JPG или WebP размером до 1 МБ.";
  }
  event.target.value = "";
});

document.getElementById("remove-logo").addEventListener("click", () => {
  companyLogo = "";
  document.getElementById("logo-file").value = "";
  saveCompany();
});

function saveDraft() {
  if (restoringDraft) return;
  const fields = Object.fromEntries(draftFields.map((id) => [id, document.getElementById(id).value]));
  const positions = Array.from(items.rows, (row) => Object.fromEntries(itemFields.map((field) => [field, row.querySelector(`[data-field="${field}"]`).value])));
  try {
    localStorage.setItem(draftKey, JSON.stringify({ fields, positions }));
    document.getElementById("storage-status").textContent = "";
  } catch {
    document.getElementById("storage-status").textContent = "Не удалось сохранить черновик в браузере. Не закрывайте страницу, пока не сохраните смету в PDF.";
  }
}

function restoreDraft() {
  try {
    const stored = localStorage.getItem(draftKey);
    if (!stored) return false;
    const draft = JSON.parse(stored);
    if (!draft || !draft.fields || !Array.isArray(draft.positions)
      || !draftFields.every((id) => typeof draft.fields[id] === "string" || (draft.fields[id] === undefined && Object.hasOwn(draftDefaults, id)))
      || !["₸", "₽", "$", "€"].includes(draft.fields.currency)
      || !["amount", "percent"].includes(draft.fields["advance-type"] ?? "amount")
      || !draft.positions.every((row) => row && itemFields.every((field) => typeof row[field] === "string") && ["шт", "час", "услуга"].includes(row.unit))) {
      throw new Error("Invalid draft");
    }
    for (const id of draftFields) document.getElementById(id).value = draft.fields[id] ?? draftDefaults[id];
    for (const position of draft.positions) addItem(false, position);
    recalculate();
    return true;
  } catch {
    document.getElementById("storage-status").textContent = "Не удалось восстановить черновик. Хранилище браузера недоступно или сохранённые данные повреждены.";
    return false;
  }
}

// Input/change bubble here after the existing calculation handlers.
for (const eventName of ["input", "change"]) {
  document.querySelector(".estimate").addEventListener(eventName, (event) => {
    if (draftFields.includes(event.target.id) || event.target.closest("#items")) saveDraft();
  });
}

document.getElementById("new-estimate").addEventListener("click", () => {
  if (!window.confirm("Создать новую смету? Текущий черновик будет очищен.")) return;
  const oldNumber = document.getElementById("estimate-number").value.trim();
  const nextNumber = /\d+$/.test(oldNumber)
    ? oldNumber.replace(/\d+$/, (digits) => (BigInt(digits) + 1n).toString().padStart(digits.length, "0"))
    : "1";
  restoringDraft = true;
  for (const id of draftFields) document.getElementById(id).value = draftDefaults[id] ?? "";
  restoreValidityDisplay();
  document.getElementById("estimate-number").value = nextNumber;
  document.getElementById("estimate-date").value = todayDate();
  discountInput.value = "0";
  vatInput.value = "0";
  currencyInput.value = "₸";
  items.replaceChildren();
  document.querySelectorAll(".print-value").forEach((value) => value.remove());
  document.getElementById("print-heading").textContent = "";
  clearTimeout(copyTimer);
  document.getElementById("copy-status").textContent = "";
  document.getElementById("manual-copy").hidden = true;
  document.getElementById("share-text").value = "";
  addItem();
  renderCatalog();
  restoringDraft = false;
  saveDraft();
});

function shareText() {
  recalculate();
  const number = document.getElementById("estimate-number").value.trim() || "—";
  const date = document.getElementById("estimate-date").value;
  const lines = [`Смета № ${number} от ${date ? date.split("-").reverse().join(".") : "—"}`];
  const validUntil = document.getElementById("valid-until").value;
  if (validUntil) lines.push(`Действует до: ${formatDate(validUntil)}`);
  for (const [id, label] of [["sender", "От кого"], ["recipient", "Для кого"]]) {
    const value = document.getElementById(id).value.trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  for (const [id, label] of [["company-phone", "Телефон"], ["company-address", "Адрес"], ["company-details", "Реквизиты компании"]]) {
    const value = document.getElementById(id).value.trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  lines.push("");
  for (const row of items.rows) {
    const field = (name) => row.querySelector(`[data-field="${name}"]`);
    const name = field("name").value.trim() || "Без названия";
    const quantity = String(parseNumber(field("quantity").value)).replace(".", ",");
    lines.push(`• ${name} — ${quantity} ${field("unit").value} × ${formatMoney(parseNumber(field("price").value))} = ${field("amount").textContent}`);
  }
  lines.push("", `Сумма: ${document.getElementById("subtotal").textContent}`);
  if (!document.getElementById("discount-row").hidden) {
    lines.push(`Скидка (${discountInput.value.trim()} %): ${document.getElementById("discount-amount").textContent}`);
    lines.push(`Сумма со скидкой: ${document.getElementById("discounted-amount").textContent}`);
  }
  if (!document.getElementById("vat-row").hidden) {
    lines.push(`НДС (${vatInput.value.trim()} %): ${document.getElementById("vat-amount").textContent}`);
  }
  if (!document.getElementById("delivery-row").hidden) {
    lines.push(`Доставка: ${document.getElementById("delivery-amount").textContent}`);
  }
  lines.push(`Итого к оплате: ${total.textContent}`);
  const totalWords = document.getElementById("total-words");
  if (!totalWords.hidden) lines.push(totalWords.textContent);
  if (!document.getElementById("payment-summary").hidden) {
    lines.push(`Предоплата: ${document.getElementById("advance-amount").textContent}`);
    lines.push(`Осталось оплатить: ${document.getElementById("balance-amount").textContent}`);
  }
  const comment = document.getElementById("comment").value.trim();
  if (comment) lines.push("", comment);
  return lines.join("\n");
}

document.getElementById("copy-whatsapp").addEventListener("click", async () => {
  const text = shareText();
  clearTimeout(copyTimer);
  document.getElementById("copy-status").textContent = "";
  document.getElementById("manual-copy").hidden = true;
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById("copy-status").textContent = "Скопировано ✓";
    copyTimer = setTimeout(() => { document.getElementById("copy-status").textContent = ""; }, 2000);
  } catch {
    const field = document.getElementById("share-text");
    field.value = text;
    document.getElementById("manual-copy").hidden = false;
    field.focus();
    field.select();
  }
});

document.getElementById("estimate-date").value = todayDate();
restoreCompany();
restoreCatalog();
if (!restoreDraft()) addItem(false);
restoreValidityDisplay();
renderCatalog();
restoringDraft = false;
