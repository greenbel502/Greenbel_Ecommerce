import assert from "node:assert/strict";
import test from "node:test";
import { MAX_CART_LINES, MAX_CART_QUANTITY, parseCartSelection, resolveCartSelection } from "../src/domain/cart/cartSelection.ts";

test("la selección local acepta IDs de DEV y UUID con cantidades acotadas", () => {
  assert.deepEqual(parseCartSelection([
    { productId: "asp-001", quantity: 2 },
    { productId: "d4bf7d25-5705-4400-bceb-7f689c6dc2a6", quantity: MAX_CART_QUANTITY }
  ]), [
    { productId: "asp-001", quantity: 2 },
    { productId: "d4bf7d25-5705-4400-bceb-7f689c6dc2a6", quantity: MAX_CART_QUANTITY }
  ]);
});

test("la selección pública rechaza duplicados, cantidades inválidas y exceso de líneas", () => {
  assert.equal(parseCartSelection([{ productId: "asp-001", quantity: 1 }, { productId: "asp-001", quantity: 2 }]), null);
  assert.equal(parseCartSelection([{ productId: "asp-001", quantity: 0 }]), null);
  assert.equal(parseCartSelection([{ productId: "asp-001", quantity: 1.5 }]), null);
  assert.equal(parseCartSelection([{ productId: "asp-001", quantity: MAX_CART_QUANTITY + 1 }]), null);
  assert.equal(parseCartSelection([{ productId: "../../admin", quantity: 1 }]), null);
  assert.equal(parseCartSelection(Array.from({ length: MAX_CART_LINES + 1 }, (_, index) => ({ productId: `id-${index}`, quantity: 1 }))), null);
});

test("una ficha despublicada desaparece de las líneas visibles sin perder su ID guardado", () => {
  const selection = [
    { productId: "publicado", quantity: 2 },
    { productId: "despublicado", quantity: 1 }
  ];
  const publicProduct = { id: "publicado", stock: null, price: 125 };
  const resolved = resolveCartSelection(selection, [publicProduct]);
  assert.deepEqual(resolved.lines, [{ product: publicProduct, quantity: 2 }]);
  assert.deepEqual(resolved.missingIds, ["despublicado"]);
  assert.equal(selection.length, 2);
});
