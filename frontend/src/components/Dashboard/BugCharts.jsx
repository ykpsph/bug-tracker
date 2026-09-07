import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import api from '../../services/api';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const BugCharts = ({ type }) => {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchChartData();
  }, [type]);

  const fetchChartData = async () => {
    try {
      const response = await api.get('/bugs');
      const bugs = response.data;

      let data;
      if (type === 'status') {
        const statusCounts = bugs.reduce((acc, bug) => {
          acc[bug.status] = (acc[bug.status] || 0) + 1;
          return acc;
        }, {});
        
        data = {
          labels: Object.keys(statusCounts),
          datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: [
              '#EF4444', // OPEN - Red
              '#F59E0B', // IN_PROGRESS - Yellow
              '#10B981', // RESOLVED - Green
              '#6B7280', // CLOSED - Gray
            ],
          }]
        };
      } else {
        const priorityCounts = bugs.reduce((acc, bug) => {
          acc[bug.priority] = (acc[bug.priority] || 0) + 1;
          return acc;
        }, {});
        
        data = {
          labels: Object.keys(priorityCounts),
          datasets: [{
            data: Object.values(priorityCounts),
            backgroundColor: [
              '#EF4444', // CRITICAL - Red
              '#F59E0B', // HIGH - Yellow
              '#3B82F6', // MEDIUM - Blue
              '#10B981', // LOW - Green
            ],
          }]
        };
      }

      setChartData(data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    }
  };

  if (!chartData) {
    return <div className="text-gray-500 text-center py-8">Loading chart data...</div>;
  }

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
      },
    },
  };

  return (
    <div className="h-64">
      <Pie data={chartData} options={options} />
    </div>
  );
};

export default BugCharts;