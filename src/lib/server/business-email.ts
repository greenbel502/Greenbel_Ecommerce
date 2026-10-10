import "server-only";

import { getBusinessEmailDeliveryMode } from "./environment";

export type BusinessEmailRequest =
  | Readonly<{ kind: "contact_inquiry"; contactReference: string }>
  | Readonly<{ kind: "financing_application"; financingReference: string }>
  | Readonly<{ kind: "financing_email_verification"; financingReference: string }>;

export type BusinessEmailResult = Readonly<{
  status: "disabled";
  reason: "business_email_paused";
}>;

export interface BusinessEmailAdapter {
  deliver(request: BusinessEmailRequest): Promise<BusinessEmailResult>;
}

const disabledBusinessEmailAdapter: BusinessEmailAdapter = {
  async deliver(request) {
    switch (request.kind) {
      case "contact_inquiry":
      case "financing_application":
      case "financing_email_verification":
        return { status: "disabled", reason: "business_email_paused" };
    }
  }
};

/** No provider is instantiated and no message is queued during the email pause. */
export function getBusinessEmailAdapter(): BusinessEmailAdapter {
  getBusinessEmailDeliveryMode();
  return disabledBusinessEmailAdapter;
}
