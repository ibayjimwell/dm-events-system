import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import GlobalNetworkSkeleton from "@/components/ui/GlobalNetworkSkeleton";
export const metadata: Metadata = {
  title: {
    default: "DM Events | Event Booking & Management",
    template: "%s | DM Events",
  },
  description:
    "Plan memorable events with DM Events. Browse packages, request an event, and coordinate your celebration.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><GlobalNetworkSkeleton />{children}</body>
    </html>
  );
}
