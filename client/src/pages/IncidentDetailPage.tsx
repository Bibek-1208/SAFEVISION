import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { Incident } from '../types';
import { IncidentProofModal } from '../components/incidents/IncidentProofModal';

export const IncidentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchIncident = async () => {
    if (!id) return;
    try {
      const res = await api.getIncidentById(id);
      setIncident(res.incident);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncident();
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400 font-mono">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-safe" />
        LOADING INCIDENT TELEMETRY #{id}...
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-12 text-center text-critical font-mono">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        INCIDENT RECORD NOT FOUND.
        <button
          onClick={() => navigate('/incidents')}
          className="mt-4 block mx-auto px-4 py-2 bg-[#222] text-gray-200 text-xs rounded border border-[#333]"
        >
          Return to Incident Log
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <button
        onClick={() => navigate('/incidents')}
        className="flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to All Incidents
      </button>

      <IncidentProofModal
        incident={incident}
        isOpen={true}
        onClose={() => navigate('/incidents')}
        onUpdated={fetchIncident}
      />
    </div>
  );
};
