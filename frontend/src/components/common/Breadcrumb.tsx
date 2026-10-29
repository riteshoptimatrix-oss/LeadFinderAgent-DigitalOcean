import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center text-sm font-medium text-[#6B7280]">
      <Link href="/dashboard" className="hover:text-[#111827] transition-colors flex items-center">
        <Home className="w-4 h-4" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <ChevronRight className="w-4 h-4 mx-2 text-neutral-600" />
          {item.href ? (
            <Link href={item.href} className="hover:text-[#111827] transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-[#111827]">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
