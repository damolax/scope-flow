import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScopeFlow — Flexible proposals, clearly approved",
  description: "Create clear interactive proposals, let clients choose extras, lock approved agreements and share secure invoice documents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
