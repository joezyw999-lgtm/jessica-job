"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "面经整理" },
    { href: "/scrape", label: "招聘信息识别" },
  ];

  return (
    <nav
      className="sticky top-0 z-50 flex items-center h-12 px-6 border-b"
      style={{
        background: "#FFFFFF",
        borderColor: "#E5E2DD",
      }}
    >
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold" style={{ color: "#2D6A6A" }}>
          职场助手
        </span>
        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: isActive ? "#2D6A6A" : "transparent",
                  color: isActive ? "#FFFFFF" : "#6B7280",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
