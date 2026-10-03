import "./globals.css";

export const metadata = { title: "Sports Hub", description: "All team schedules and chats in one place" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
