import "server-only";
import { buildBrandedMime } from "./mime";
import { renderContactContent } from "./contact-template";

export type ContactNotification = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  inquiry_type: string | null;
  product: string | null;
  message: string;
  created_at: string;
};
export function buildContactMime(
  contact: ContactNotification,
  sender: string,
  recipient: string,
): string {
  return buildBrandedMime({
    kind: "contact",
    id: contact.id,
    createdAt: contact.created_at,
    sender,
    recipient,
    replyTo: contact.email,
    subject: `Greenbel | Nueva consulta de ${contact.name}`,
    ...renderContactContent(contact),
  });
}
