'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Kanban, Filter, Plus, Search, Building, User, Calendar, 
  ArrowRight, Activity, Zap, Star
} from 'lucide-react';
import { getApiUrl } from '@/src/lib/utils';
import { toast } from 'sonner';

const PIPELINE_STAGES = [
  'New Lead',
  'Website Analyzed',
  'Needs Review',
  'Contact Ready',
  'Email Sent',
  'WhatsApp Sent',
  'Follow-up Scheduled',
  'Meeting Scheduled',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
  'On Hold',
  'Archived'
];

interface Lead {
  id: string;
  name: string;
  pipeline_stage: string;
  website: string;
  priority: string;
  lead_score: number;
}

export default function CRMBoard() {
  const queryClient = useQueryClient();
  const [boardData, setBoardData] = useState<Record<string, Lead[]>>({});
  
  // Fetch all leads (for the board, we might want to fetch without pagination or a high limit)
  const { data, isLoading } = useQuery({
    queryKey: ['crm-pipeline'],
    queryFn: async () => {
      const res = await axios.get(getApiUrl('/api/v1/crm/leads/pipeline'), {
        params: { limit: 500 }
      });
      return res.data.data;
    }
  });

  useEffect(() => {
    if (data) {
      // Group leads by stage
      const grouped: Record<string, Lead[]> = {};
      PIPELINE_STAGES.forEach(stage => grouped[stage] = []);
      
      data.forEach((lead: Lead) => {
        const stage = lead.pipeline_stage || 'New Lead';
        if (grouped[stage]) {
          grouped[stage].push(lead);
        } else {
          // If a lead has a custom stage not in the default list
          if (!grouped['Other']) grouped['Other'] = [];
          grouped['Other'].push(lead);
        }
      });
      setBoardData(grouped);
    }
  }, [data]);

  const updateStageMutation = useMutation({
    mutationFn: async ({ leadId, newStage }: { leadId: string, newStage: string }) => {
      const res = await axios.patch(getApiUrl(`/api/v1/crm/leads/${leadId}/stage`), { stage: newStage });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Pipeline stage updated');
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
    },
    onError: () => {
      toast.error('Failed to update stage');
    }
  });

  const onDragEnd = (result: any) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStage = source.droppableId;
    const destStage = destination.droppableId;

    // Optimistic UI update
    const sourceLeads = Array.from(boardData[sourceStage]);
    const destLeads = Array.from(boardData[destStage]);
    
    const [movedLead] = sourceLeads.splice(source.index, 1);
    movedLead.pipeline_stage = destStage;
    destLeads.splice(destination.index, 0, movedLead);

    setBoardData({
      ...boardData,
      [sourceStage]: sourceLeads,
      [destStage]: destLeads
    });

    // Fire API call
    if (sourceStage !== destStage) {
      updateStageMutation.mutate({ leadId: movedLead.id, newStage: destStage });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'bg-red-100 text-red-700 border-red-200';
      case 'Low': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="p-6 h-screen flex flex-col bg-slate-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Kanban className="w-6 h-6 text-blue-600" />
            CRM Pipeline
          </h1>
          <p className="text-slate-500 mt-1">Manage leads across different stages of the sales cycle.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Search board..." 
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50">
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 h-full items-start" style={{ width: `${PIPELINE_STAGES.length * 320}px` }}>
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage} className="w-[300px] flex-shrink-0 flex flex-col h-full bg-slate-100/50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-3 border-b border-slate-200 bg-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700 text-sm">{stage}</h3>
                    <span className="bg-white text-slate-600 text-xs py-0.5 px-2 rounded-full font-medium border border-slate-200">
                      {boardData[stage]?.length || 0}
                    </span>
                  </div>
                  
                  <Droppable droppableId={stage}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''}`}
                      >
                        {boardData[stage]?.map((lead, index) => (
                          <Draggable key={lead.id} draggableId={lead.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`bg-white p-4 rounded-lg border shadow-sm transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg border-blue-300 ring-2 ring-blue-500/20' : 'border-slate-200 hover:shadow-md'
                                }`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <Link href={`/dashboard/leads/detail?id=${lead.id}`} className="font-semibold text-slate-800 hover:text-blue-600 line-clamp-1">
                                    {lead.name || 'Unknown Business'}
                                  </Link>
                                </div>
                                
                                {lead.website && (
                                  <div className="text-xs text-slate-500 mb-3 truncate flex items-center gap-1">
                                    <Building className="w-3 h-3" /> {lead.website}
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between mt-4">
                                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded border ${getPriorityColor(lead.priority || 'Normal')}`}>
                                    {lead.priority || 'Normal'}
                                  </span>
                                  
                                  {lead.lead_score > 0 && (
                                    <div className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                      <Star className="w-3 h-3 fill-current" />
                                      {lead.lead_score}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}
