import React, { useState, useEffect } from 'react';
import { Bug, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import BugCharts from './BugCharts';
import api from '../../services/api';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/bugs');
      const bugs = response.data;
      
      const stats = {
        total: bugs.length,
        open: bugs.filter(b => b.status === 'OPEN').length,
        inProgress: bugs.filter(b => b.status === 'IN_PROGRESS').length,
        resolved: bugs.filter(b => b.status === 'RESOLVED').length,
        closed: bugs.filter(b => b.status === 'CLOSED').length,
      };
      
      setStats(stats);
    } catch (error) {
      toast.error('Failed to fetch bug statistics');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { 
      label: 'Total Bugs', 
      value: stats.total, 
      icon: Bug, 
      color: 'text-blue-600',
      bg: 'bg-blue-100'
    },
    { 
      label: 'Open', 
      value: stats.open, 
      icon: AlertCircle, 
      color: 'text-red-600',
      bg: 'bg-red-100'
    },
    { 
      label: 'In Progress', 
      value: stats.inProgress, 
      icon: Clock, 
      color: 'text-yellow-600',
      bg: 'bg-yellow-100'
    },
    { 
      label: 'Resolved', 
      value: stats.resolved, 
      icon: CheckCircle, 
      color: 'text-green-600',
      bg: 'bg-green-100'
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{label}</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
              </div>
              <div className={`p-3 rounded-full ${bg}`}>
                <Icon className={`w-6 h-6 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Bug Distribution by Status
          </h3>
          <BugCharts type="status" data={stats} />
        </div>
        
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Bug Distribution by Priority
          </h3>
          <BugCharts type="priority" data={stats} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;