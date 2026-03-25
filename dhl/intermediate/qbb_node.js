function XL(value) {
  if (value == null) return -1;
  try {
    let sum = 0;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code < 128) sum += code;
    }
    return sum;
  } catch {
    return -2;
  }
}

function J9b(type) {
  const textLike = ["text", "search", "url", "email", "tel", "number"];
  const normalized = String(type).toLowerCase();
  if (textLike.includes(normalized)) return 0;
  if (normalized === "password") return 1;
  return 2;
}

function mapAutocomplete(autocomplete) {
  if (autocomplete == null) return -1;
  const normalized = String(autocomplete).toLowerCase();
  if (normalized === "off") return 0;
  if (normalized === "on") return 1;
  return 2;
}

function normalizeInput(input) {
  const Qd = XL(input.name);
  const l2b = XL(input.id);
  const WDb = input.required == null ? 0 : 1;
  const hqb = input.type == null ? -1 : J9b(input.type);
  const rbb = mapAutocomplete(input.autocomplete);
  const Ugb = input.value ?? "";
  const mWb = input.defaultValue ?? "";
  const n1b = Ugb.length !== 0 ? 1 : 0;
  const wKb = mWb.length !== 0 && (n1b === 1 || mWb !== Ugb) ? 1 : 0;

  if (hqb === -1) return null;

  return [hqb, rbb, wKb, WDb, l2b, Qd, n1b].join(",") + ";";
}

function shouldIncludeInput(input) {
  // Browser-observed Qbb() output excludes the tracking input from BJb.
  if (input.id === "c-tracking--input") return false;
  return true;
}

function Qbb(inputs) {
  let result = "";
  for (const input of inputs) {
    if (!shouldIncludeInput(input)) continue;
    const tuple = normalizeInput(input);
    if (tuple != null) result += tuple;
  }
  return result;
}

const sampleInputs = [
  {
    id: "nav-search-static--input_d3e175ab-c6dd-4711-a0bd-cd836a604c39",
    name: "q",
    type: "search",
    autocomplete: "off",
    required: null,
    value: "",
    defaultValue: "",
  },
  {
    id: "nav-search-mobile--input_be6b38a5-b22a-4d39-993c-da669ada113a",
    name: "q",
    type: "text",
    autocomplete: "off",
    required: null,
    value: "",
    defaultValue: "",
  },
  {
    id: "nav-search-sticky--input_d3e175ab-c6dd-4711-a0bd-cd836a604c39",
    name: "q",
    type: "text",
    autocomplete: "off",
    required: null,
    value: "",
    defaultValue: "",
  },
  {
    id: "nav-search-mobile--input_bc593354-dd4b-489c-82d5-55506822321b",
    name: "q",
    type: "text",
    autocomplete: "off",
    required: null,
    value: "",
    defaultValue: "",
  },
  {
    id: "c-tracking--input",
    name: "tracking-id",
    type: "text",
    autocomplete: null,
    required: null,
    value: "1232343",
    defaultValue: "",
  },
  {
    id: "vendor-search-handler",
    name: "vendor-search-handler",
    type: "text",
    autocomplete: null,
    required: null,
    value: "",
    defaultValue: "",
  },
];

if (require.main === module) {
  console.log(Qbb(sampleInputs));
}

module.exports = {
  XL,
  J9b,
  mapAutocomplete,
  normalizeInput,
  shouldIncludeInput,
  Qbb,
};
