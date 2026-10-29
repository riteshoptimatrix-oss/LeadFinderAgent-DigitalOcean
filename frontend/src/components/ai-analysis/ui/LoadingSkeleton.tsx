"use client";

export function LoadingSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 lg:px-8 pt-6 pb-5 flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gray-100 animate-pulse" />
          <div className="space-y-2.5">
            <div className="h-7 w-48 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-3 w-80 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-36 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Status strip */}
      <div className="mx-6 lg:mx-8">
        <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
      </div>

      {/* Stepper */}
      <div className="mx-6 lg:mx-8 mt-4">
        <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
