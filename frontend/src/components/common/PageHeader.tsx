import { Breadcrumb } from './Breadcrumb';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  action?: React.ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
      <div className="space-y-2">
        {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
        <h1 className="text-3xl font-extrabold tracking-tight text-[#111827]">{title}</h1>
        {description && <div className="text-[#6B7280]">{description}</div>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
