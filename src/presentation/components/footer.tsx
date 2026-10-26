import { readPublicGreenbelContacts } from "@/lib/server/contact-settings";
import { FooterView } from "./footer-view";
export async function Footer() {
  return <FooterView contacts={await readPublicGreenbelContacts()} />;
}
