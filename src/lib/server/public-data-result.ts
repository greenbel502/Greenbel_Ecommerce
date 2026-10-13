/** An expected failure to read public data; never a missing resource. */
export class PublicDataUnavailableError extends Error {
  constructor(message = "El contenido público no está disponible.") {
    super(message);
    this.name = "PublicDataUnavailableError";
  }
}

/** Keep an outage distinct from an empty catalog or a successful not-found read. */
export async function readPublicData<T>(read: () => Promise<T>): Promise<
  { status: "available"; data: T } | { status: "unavailable" }
> {
  try {
    return { status: "available", data: await read() };
  } catch (error) {
    if (error instanceof PublicDataUnavailableError) return { status: "unavailable" };
    // Unexpected bugs and Next.js navigation signals belong to their own boundaries.
    throw error;
  }
}
