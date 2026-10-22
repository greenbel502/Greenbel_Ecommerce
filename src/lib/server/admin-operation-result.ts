import "server-only";
export type AdminFormResult = {
  status: "idle" | "error" | "success";
  message: string;
};
export class AdminOperationResult extends Error {
  constructor(readonly code: string) {
    super("Administrative operation result");
  }
}
export async function runAdminOperation(
  operation: () => Promise<void>,
  messages: Record<string, string>,
): Promise<AdminFormResult> {
  try {
    await operation();
    return { status: "error", message: "No se pudo confirmar el cambio." };
  } catch (error) {
    if (!(error instanceof AdminOperationResult)) throw error;
    return {
      status: /(?:saved|registered|withdrawn)$/.test(error.code)
        ? "success"
        : "error",
      message:
        messages[error.code] ||
        "No se pudo guardar el cambio. Revisa la información e inténtalo de nuevo.",
    };
  }
}
