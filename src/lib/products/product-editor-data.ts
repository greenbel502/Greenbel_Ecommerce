import type {
  ProductRow,
  BrandRow,
  CategoryRow,
  SpecRow,
  InclusionRow,
  ImageRow,
  CompatibilityRow,
} from "../../app/admin/catalogo/catalog-admin";

export type ProductEditorData = {
  product: ProductRow;
  images: ImageRow[];
  specs: SpecRow[];
  inclusions: InclusionRow[];
  compatibilities: CompatibilityRow[];
  relatedProducts: ProductRow[];
  brands: BrandRow[];
  categories: CategoryRow[];
};

export class ProductEditorLoadError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Read one product independently of the catalogue router state. Never wait forever. */
export async function loadProductEditorData(
  id: string,
  {
    signal,
    timeoutMs = 10_000,
    request = fetch,
  }: {
    signal?: AbortSignal;
    timeoutMs?: number;
    request?: typeof fetch;
  } = {},
): Promise<ProductEditorData> {
  id = id.toLowerCase();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onCancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    onCancel = () => {
      controller.abort();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    if (signal?.aborted) onCancel();
    else signal?.addEventListener("abort", onCancel, { once: true });
    timer = setTimeout(() => {
      reject(
        new ProductEditorLoadError(
          "La carga está tardando más de lo esperado. Inténtalo de nuevo.",
        ),
      );
      controller.abort();
    }, timeoutMs);
  });
  const read = async () => {
    const response = await request(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new ProductEditorLoadError(
        response.status === 401
          ? "Tu sesión venció. Vuelve a ingresar para cargar el producto."
          : response.status === 403
            ? "No tienes permiso para consultar este producto."
            : response.status === 404
              ? "El producto ya no está disponible. Actualiza la lista."
              : "No se pudieron cargar las fotografías y los detalles. Inténtalo de nuevo.",
        response.status,
      );
    const data = await response.json();
    if (
      !data ||
      data.product?.id !== id ||
      ![
        "images",
        "specs",
        "inclusions",
        "compatibilities",
        "relatedProducts",
        "brands",
        "categories",
      ].every((key) => Array.isArray(data[key])) ||
      [...data.images, ...data.specs, ...data.inclusions].some(
        (row) => row.product_id !== id,
      ) ||
      data.compatibilities.some(
        (row: CompatibilityRow) =>
          row.equipment_id !== id && row.part_id !== id,
      )
    )
      throw new ProductEditorLoadError(
        "No se pudo confirmar la información del producto. Inténtalo de nuevo.",
      );
    return data as ProductEditorData;
  };
  try {
    if (signal?.aborted) return await interrupted;
    return await Promise.race([read(), interrupted]);
  } catch (error) {
    if (error instanceof ProductEditorLoadError || signal?.aborted) throw error;
    throw new ProductEditorLoadError(
      "No se pudieron cargar las fotografías y los detalles. Inténtalo de nuevo.",
    );
  } finally {
    clearTimeout(timer);
    if (onCancel) signal?.removeEventListener("abort", onCancel);
  }
}
