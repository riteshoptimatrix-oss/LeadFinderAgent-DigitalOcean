'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { OverviewStats } from './OverviewStats';
import { ScoreDistribution } from './ScoreDistribution';
import { FilterBar, OverviewFilters, EMPTY_OVERVIEW_FILTERS } from './FilterBar';
import { LeadTable } from './LeadTable';
import { SummarySidebar } from './SummarySidebar';
import { AnalysisDrawer } from './AnalysisDrawer';
import { EmptyState } from './EmptyState';
import { SkeletonLoader } from './SkeletonLoader';
import { AnalysisLead, getLeadLocation, getLeadPriority, getLeadScore, getLeadStatus } from './leadAnalysis';
import { KPIData } from './KPIGrid';

const PAGE_SIZE = 10;

interface OverviewProps {
  kpiData?: KPIData;
  kpiLoading: boolean;
  websiteScoreDistribution?: { name: string; value: number; percentage?: number; color?: string | null }[];
  keyword: string;
  refreshKey: number;
  onKeywordChange: (value: string) => void;
  onAnalyze: () => void;
}

interface LeadsResponse {
  data: AnalysisLead[];
  total: number;
}

function matchesFilters(lead: AnalysisLead, f: OverviewFilters): boolean {
  const category = (lead?.category || '').toLowerCase();
  const location = getLeadLocation(lead).toLowerCase();
  const score = getLeadScore(lead);
  const priority = getLeadPriority(lead).toLowerCase();
  const status = getLeadStatus(lead).toLowerCase();

  if (f.industry && !category.includes(f.industry.toLowerCase())) return false;
  if (f.country && !location.includes(f.country.toLowerCase())) return false;
  if (f.state && !location.includes(f.state.toLowerCase())) return false;
  if (f.city && !location.includes(f.city.toLowerCase())) return false;
  if (f.minScore !== '' && score < Number(f.minScore)) return false;
  if (f.maxScore !== '' && score > Number(f.maxScore)) return false;
  if (f.priority && priority !== f.priority.toLowerCase()) return false;
  if (f.status && status !== f.status.toLowerCase()) return false;
  return true;
}

export function Overview({
  kpiData,
  kpiLoading,
  websiteScoreDistribution,
  keyword,
  refreshKey,
  onKeywordChange,
  onAnalyze,
}: OverviewProps) {
  const [filters, setFilters] = useState<OverviewFilters>(EMPTY_OVERVIEW_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<AnalysisLead | null>(null);

  const hasActiveFilters =
    keyword !== '' || Object.values(filters).some((v) => v !== '');

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ['overview-leads', keyword, filters.city, filters.status, page, refreshKey],
    queryFn: () =>
      api
        .get('/leads', {
          params: {
            search: keyword || undefined,
            city: filters.city || undefined,
            status: filters.status || undefined,
            limit: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
            sort_by: 'created_at',
            sort_order: -1,
          },
        })
        .then((r) => r.data),
    staleTime: 30000,
  });

  const apiTotal = data?.total ?? 0;

  const filteredLeads = useMemo(
    () => (data?.data ?? []).filter((l) => matchesFilters(l, filters)),
    [data, filters]
  );
  const filteredTotal = Math.max(0, filteredLeads.length);

  const setFilter = (next: OverviewFilters) => {
    setFilters(next);
    setPage(1);
  };

  const handleKeywordChange = (value: string) => {
    onKeywordChange(value);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_OVERVIEW_FILTERS);
    onKeywordChange('');
    setPage(1);
  };

  const showTrueEmpty = !hasActiveFilters && !isLoading && apiTotal === 0;

  return (
    <div className="space-y-6">
      {kpiLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 h-[104px] animate-pulse" />
          ))}
        </div>
      ) : (
        <OverviewStats data={kpiData || ({} as KPIData)} />
      )}

      <FilterBar
        search={keyword}
        onSearchChange={handleKeywordChange}
        filters={filters}
        onChange={setFilter}
        onReset={resetFilters}
      />

      <ScoreDistribution data={websiteScoreDistribution} />

      {isLoading ? (
        <SkeletonLoader />
      ) : showTrueEmpty ? (
        <EmptyState hasFilters={false} onReset={resetFilters} onAnalyze={onAnalyze} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6 min-w-0">
            {filteredTotal > 0 ? (
              <LeadTable
                leads={filteredLeads}
                total={apiTotal > filteredTotal ? filteredTotal : apiTotal}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                onSelectLead={setSelectedLead}
              />
            ) : (
              <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} onAnalyze={onAnalyze} />
            )}
          </div>
          <div className="min-w-0">
            <SummarySidebar kpi={kpiData} leads={filteredLeads} />
          </div>
        </div>
      )}

      <AnalysisDrawer lead={selectedLead} open={!!selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
