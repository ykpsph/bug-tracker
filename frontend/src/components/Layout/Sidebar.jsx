import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Home, 
  Bug, 
  PlusCircle,
  BarChart2 
} from 'lucide-react';

const Sidebar = () => {
  const navItems = [
    { to: '/dashboard', icon: Home, label: 'Dashboard' },
    { to: '/bugs', icon: Bug, label: 'All Bugs' },
    { to: '/bugs/new', icon: PlusCircle, label: 'New Bug' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Bug className="w-7 h-7 text-blue-600" />
          BugTracker
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          <p>Version 1.0.0</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;